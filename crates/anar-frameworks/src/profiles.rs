//! Framework-specific run profiles and external CLI tool detection.

use crate::detect::{detect_workspace_frameworks, DetectedFramework};
use anar_core::FrameworkKind;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Executable launch configuration tailored to a detected framework or standard crate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProfile {
    pub id: String,
    pub label: String,
    pub description: String,
    pub framework: Option<FrameworkKind>,
    pub program: String,
    pub args: Vec<String>,
    pub working_subdir: Option<String>,
    pub default_port: Option<u16>,
    pub readiness_hints: Vec<String>,
    pub required_tool: Option<String>,
    pub tool_available: bool,
    pub parse_cargo_json: bool,
}

/// Resolves a specific [`RunProfile`] inside `workspace_root` by its `profile_id`.
pub fn resolve_profile_by_id(
    workspace_root: &Path,
    profile_id: &str,
) -> Result<RunProfile, String> {
    let report = detect_workspace_frameworks(workspace_root)?;
    report
        .profiles
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| format!("unknown run profile `{profile_id}` for this workspace"))
}

/// Generates ordered, deduplicated [`RunProfile`]s for all detected frameworks.
pub fn profiles_for_detected(
    detected: &[DetectedFramework],
    workspace_root: Option<&Path>,
) -> Vec<RunProfile> {
    let mut profiles = Vec::new();
    let mut seen_ids = HashSet::new();

    for fw in detected {
        let manifest_subdir = manifest_parent_subdir(&fw.source_manifest);
        let fw_profiles = build_framework_profiles(fw.kind, manifest_subdir, &fw.source_manifest);
        for profile in fw_profiles {
            if seen_ids.insert(profile.id.clone()) {
                profiles.push(profile);
            }
        }
    }

    let cargo_available = is_binary_available("cargo");
    let standard = [
        RunProfile {
            id: "cargo-run".to_string(),
            label: "Cargo Run (Debug)".to_string(),
            description: "Build and run the default binary target with JSON diagnostics.".into(),
            framework: None,
            program: "cargo".to_string(),
            args: vec!["run".to_string(), "--message-format=json".to_string()],
            working_subdir: None,
            default_port: None,
            readiness_hints: Vec::new(),
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_available,
            parse_cargo_json: true,
        },
        RunProfile {
            id: "cargo-run-release".to_string(),
            label: "Cargo Run (Release)".to_string(),
            description: "Build and run with release optimizations enabled.".to_string(),
            framework: None,
            program: "cargo".to_string(),
            args: vec![
                "run".to_string(),
                "--release".to_string(),
                "--message-format=json".to_string(),
            ],
            working_subdir: None,
            default_port: None,
            readiness_hints: Vec::new(),
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_available,
            parse_cargo_json: true,
        },
    ];

    for profile in standard {
        if seen_ids.insert(profile.id.clone()) {
            profiles.push(profile);
        }
    }

    // Check `working_subdir` sanity if a workspace root was provided.
    if let Some(root) = workspace_root {
        for profile in &mut profiles {
            if let Some(sub) = &profile.working_subdir {
                if !root.join(sub).is_dir() {
                    profile.working_subdir = None;
                }
            }
        }
    }

    profiles
}

fn build_framework_profiles(
    kind: FrameworkKind,
    manifest_subdir: Option<String>,
    source_manifest: &str,
) -> Vec<RunProfile> {
    let cargo_ok = is_binary_available("cargo");

    match kind {
        FrameworkKind::Axum => vec![RunProfile {
            id: "axum-serve".to_string(),
            label: "Axum Server (Dev)".to_string(),
            description: "Runs the Axum HTTP server in debug mode.".to_string(),
            framework: Some(FrameworkKind::Axum),
            program: "cargo".to_string(),
            args: vec!["run".to_string(), "--message-format=json".to_string()],
            working_subdir: manifest_subdir,
            default_port: Some(3000),
            readiness_hints: vec![
                "listening on".to_string(),
                "127.0.0.1:3000".to_string(),
                "0.0.0.0:3000".to_string(),
            ],
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_ok,
            parse_cargo_json: true,
        }],
        FrameworkKind::ActixWeb => vec![RunProfile {
            id: "actix-serve".to_string(),
            label: "Actix Web Server".to_string(),
            description: "Runs the Actix Web HTTP service in debug mode.".to_string(),
            framework: Some(FrameworkKind::ActixWeb),
            program: "cargo".to_string(),
            args: vec!["run".to_string(), "--message-format=json".to_string()],
            working_subdir: manifest_subdir,
            default_port: Some(8080),
            readiness_hints: vec![
                "starting service".to_string(),
                "127.0.0.1:8080".to_string(),
                "0.0.0.0:8080".to_string(),
            ],
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_ok,
            parse_cargo_json: true,
        }],
        FrameworkKind::Rocket => vec![RunProfile {
            id: "rocket-launch".to_string(),
            label: "Rocket Server".to_string(),
            description: "Launches the Rocket web server (default port 8000).".to_string(),
            framework: Some(FrameworkKind::Rocket),
            program: "cargo".to_string(),
            args: vec!["run".to_string(), "--message-format=json".to_string()],
            working_subdir: manifest_subdir,
            default_port: Some(8000),
            readiness_hints: vec![
                "Rocket has launched".to_string(),
                "http://127.0.0.1:8000".to_string(),
            ],
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_ok,
            parse_cargo_json: true,
        }],
        FrameworkKind::Dioxus => vec![RunProfile {
            id: "dx-serve".to_string(),
            label: "Dioxus Serve (dx serve)".to_string(),
            description: "Starts the Dioxus CLI dev server with hot-reload.".to_string(),
            framework: Some(FrameworkKind::Dioxus),
            program: "dx".to_string(),
            args: vec!["serve".to_string()],
            working_subdir: manifest_subdir,
            default_port: Some(8080),
            readiness_hints: vec!["Serving your app".to_string(), "http://".to_string()],
            required_tool: Some("dx".to_string()),
            tool_available: is_binary_available("dx"),
            parse_cargo_json: false,
        }],
        FrameworkKind::Leptos => vec![
            RunProfile {
                id: "leptos-watch".to_string(),
                label: "Leptos Watch (cargo leptos)".to_string(),
                description: "Builds and serves fullstack/SSR Leptos with live reload.".into(),
                framework: Some(FrameworkKind::Leptos),
                program: "cargo".to_string(),
                args: vec!["leptos".to_string(), "watch".to_string()],
                working_subdir: manifest_subdir.clone(),
                default_port: Some(3000),
                readiness_hints: vec!["listening on".to_string(), "http://".to_string()],
                required_tool: Some("cargo-leptos".to_string()),
                tool_available: cargo_ok && is_binary_available("cargo-leptos"),
                parse_cargo_json: false,
            },
            RunProfile {
                id: "leptos-trunk".to_string(),
                label: "Trunk Serve (CSR WASM)".to_string(),
                description: "Serves client-side rendered Leptos via Trunk.".to_string(),
                framework: Some(FrameworkKind::Leptos),
                program: "trunk".to_string(),
                args: vec!["serve".to_string()],
                working_subdir: manifest_subdir,
                default_port: Some(8080),
                readiness_hints: vec!["serving at".to_string(), "http://".to_string()],
                required_tool: Some("trunk".to_string()),
                tool_available: is_binary_available("trunk"),
                parse_cargo_json: false,
            },
        ],
        FrameworkKind::Yew => vec![
            RunProfile {
                id: "yew-trunk".to_string(),
                label: "Trunk Serve (Yew WASM)".to_string(),
                description: "Compiles Yew to WebAssembly and launches Trunk dev server.".into(),
                framework: Some(FrameworkKind::Yew),
                program: "trunk".to_string(),
                args: vec!["serve".to_string()],
                working_subdir: manifest_subdir.clone(),
                default_port: Some(8080),
                readiness_hints: vec!["serving at".to_string(), "http://".to_string()],
                required_tool: Some("trunk".to_string()),
                tool_available: is_binary_available("trunk"),
                parse_cargo_json: false,
            },
            RunProfile {
                id: "yew-wasm-build".to_string(),
                label: "Cargo Build (wasm32)".to_string(),
                description: "Builds the Yew crate for wasm32-unknown-unknown.".to_string(),
                framework: Some(FrameworkKind::Yew),
                program: "cargo".to_string(),
                args: vec![
                    "build".to_string(),
                    "--target".to_string(),
                    "wasm32-unknown-unknown".to_string(),
                    "--message-format=json".to_string(),
                ],
                working_subdir: manifest_subdir,
                default_port: None,
                readiness_hints: Vec::new(),
                required_tool: Some("cargo".to_string()),
                tool_available: cargo_ok,
                parse_cargo_json: true,
            },
        ],
        FrameworkKind::Tauri => vec![RunProfile {
            id: "tauri-dev".to_string(),
            label: "Tauri Dev (cargo tauri dev)".to_string(),
            description: "Starts the desktop WebView dev server and Rust backend.".to_string(),
            framework: Some(FrameworkKind::Tauri),
            program: "cargo".to_string(),
            args: vec!["tauri".to_string(), "dev".to_string()],
            working_subdir: tauri_project_subdir(source_manifest),
            default_port: Some(1420),
            readiness_hints: vec!["Running `target/".to_string(), "Local:".to_string()],
            required_tool: Some("cargo-tauri".to_string()),
            tool_available: cargo_ok && is_binary_available("cargo-tauri"),
            parse_cargo_json: false,
        }],
        FrameworkKind::Bevy => vec![RunProfile {
            id: "bevy-dynamic".to_string(),
            label: "Bevy Dev (Dynamic Linking)".to_string(),
            description: "Runs Bevy with `bevy/dynamic_linking` for fast iteration.".into(),
            framework: Some(FrameworkKind::Bevy),
            program: "cargo".to_string(),
            args: vec![
                "run".to_string(),
                "--features".to_string(),
                "bevy/dynamic_linking".to_string(),
                "--message-format=json".to_string(),
            ],
            working_subdir: manifest_subdir,
            default_port: None,
            readiness_hints: Vec::new(),
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_ok,
            parse_cargo_json: true,
        }],
        FrameworkKind::Clap => vec![RunProfile {
            id: "clap-help".to_string(),
            label: "Clap CLI (--help)".to_string(),
            description: "Executes the CLI binary with `--help` output.".to_string(),
            framework: Some(FrameworkKind::Clap),
            program: "cargo".to_string(),
            args: vec!["run".to_string(), "--".to_string(), "--help".to_string()],
            working_subdir: manifest_subdir,
            default_port: None,
            readiness_hints: Vec::new(),
            required_tool: Some("cargo".to_string()),
            tool_available: cargo_ok,
            parse_cargo_json: false,
        }],
    }
}

fn manifest_parent_subdir(source_manifest: &str) -> Option<String> {
    let stripped = source_manifest.strip_suffix("/Cargo.toml")?;
    if stripped.is_empty() {
        None
    } else {
        Some(stripped.to_string())
    }
}

fn tauri_project_subdir(source_manifest: &str) -> Option<String> {
    if source_manifest == "src-tauri/Cargo.toml" || source_manifest == "Cargo.toml" {
        return None;
    }
    if let Some(prefix) = source_manifest.strip_suffix("/src-tauri/Cargo.toml") {
        if prefix.is_empty() {
            return None;
        }
        return Some(prefix.to_string());
    }
    manifest_parent_subdir(source_manifest)
}

/// Checks whether `binary_name` exists on `PATH` or in `~/.cargo/bin` without spawning a process.
pub fn is_binary_available(binary_name: &str) -> bool {
    let exe_name = if cfg!(windows) {
        format!("{binary_name}.exe")
    } else {
        binary_name.to_string()
    };

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(&exe_name);
            if candidate.is_file() {
                return true;
            }
        }
    }

    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        let cargo_bin = PathBuf::from(home)
            .join(".cargo")
            .join("bin")
            .join(&exe_name);
        if cargo_bin.is_file() {
            return true;
        }
    }

    false
}
