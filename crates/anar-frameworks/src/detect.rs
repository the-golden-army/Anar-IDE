//! Workspace inspection for `Cargo.toml`, workspace members, and `Cargo.lock`.

use crate::profiles::{profiles_for_detected, RunProfile};
use crate::{category_for, crate_name_for, display_name_for};
use anar_core::FrameworkKind;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Coarse ecosystem category for a detected framework.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FrameworkCategory {
    WebApi,
    WebFrontend,
    Desktop,
    GameEngine,
    Cli,
    Standard,
}

/// One Rust framework discovered inside a workspace manifest or lockfile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedFramework {
    pub kind: FrameworkKind,
    pub display_name: String,
    pub crate_name: String,
    pub category: FrameworkCategory,
    pub version_spec: Option<String>,
    pub resolved_version: Option<String>,
    pub source_manifest: String,
    pub direct: bool,
}

/// Full detection and run-profile report for an opened Cargo workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFrameworkReport {
    pub package_name: Option<String>,
    pub workspace_members: Vec<String>,
    pub detected: Vec<DetectedFramework>,
    pub profiles: Vec<RunProfile>,
    pub default_profile_id: Option<String>,
}

const KNOWN_FRAMEWORKS: [FrameworkKind; 9] = [
    FrameworkKind::Axum,
    FrameworkKind::ActixWeb,
    FrameworkKind::Rocket,
    FrameworkKind::Dioxus,
    FrameworkKind::Leptos,
    FrameworkKind::Yew,
    FrameworkKind::Tauri,
    FrameworkKind::Bevy,
    FrameworkKind::Clap,
];

/// Inspects `workspace_root` (`Cargo.toml`, member manifests, `src-tauri/Cargo.toml`,
/// and `Cargo.lock`) to identify frameworks and construct tailored run profiles.
pub fn detect_workspace_frameworks(
    workspace_root: &Path,
) -> Result<WorkspaceFrameworkReport, String> {
    if !workspace_root.is_dir() {
        return Err(format!(
            "workspace path is not a directory: {}",
            workspace_root.display()
        ));
    }

    let lock_versions = parse_cargo_lock(&workspace_root.join("Cargo.lock"));
    let root_manifest_path = workspace_root.join("Cargo.toml");

    let mut package_name: Option<String> = None;
    let mut member_globs: Vec<String> = Vec::new();
    let mut manifests_to_scan: Vec<(PathBuf, String)> = Vec::new();

    if root_manifest_path.is_file() {
        if let Ok(content) = fs::read_to_string(&root_manifest_path) {
            let parsed = parse_manifest(&content);
            package_name = parsed.package_name;
            member_globs = parsed.workspace_members;
        }
        manifests_to_scan.push((root_manifest_path, "Cargo.toml".to_string()));
    }

    let resolved_members = expand_workspace_members(workspace_root, &member_globs);
    for rel_member in &resolved_members {
        let candidate = workspace_root.join(rel_member).join("Cargo.toml");
        if candidate.is_file() {
            let rel_manifest = format!("{rel_member}/Cargo.toml");
            manifests_to_scan.push((candidate, rel_manifest));
        }
    }

    // Standard Tauri projects often live in `src-tauri/Cargo.toml` without a root Cargo workspace.
    let nested_tauri = workspace_root.join("src-tauri").join("Cargo.toml");
    let has_nested_tauri = manifests_to_scan
        .iter()
        .any(|(_, rel)| rel == "src-tauri/Cargo.toml");
    if nested_tauri.is_file() && !has_nested_tauri {
        manifests_to_scan.push((nested_tauri, "src-tauri/Cargo.toml".to_string()));
    }

    let mut by_kind: BTreeMap<String, DetectedFramework> = BTreeMap::new();
    for (manifest_path, rel_label) in &manifests_to_scan {
        let Ok(content) = fs::read_to_string(manifest_path) else {
            continue;
        };
        let parsed = parse_manifest(&content);
        for (crate_id, version_spec) in parsed.dependencies {
            let Some(kind) = framework_from_crate_name(&crate_id) else {
                continue;
            };
            let key = format!("{crate_id}::{rel_label}");
            let resolved_version = lock_versions.get(&crate_id).cloned();
            by_kind.entry(key).or_insert_with(|| DetectedFramework {
                kind,
                display_name: display_name_for(kind).to_string(),
                crate_name: crate_name_for(kind).to_string(),
                category: category_for(kind),
                version_spec,
                resolved_version,
                source_manifest: rel_label.clone(),
                direct: true,
            });
        }
    }

    // Preserve one clean primary entry per FrameworkKind (preferring root/shorter manifest path).
    let mut deduped: Vec<DetectedFramework> = Vec::new();
    let mut seen_kinds: HashSet<String> = HashSet::new();
    let mut all_hits: Vec<DetectedFramework> = by_kind.into_values().collect();
    all_hits.sort_by(|a, b| {
        a.source_manifest
            .len()
            .cmp(&b.source_manifest.len())
            .then_with(|| a.crate_name.cmp(&b.crate_name))
    });
    for hit in all_hits {
        if seen_kinds.insert(hit.crate_name.clone()) {
            deduped.push(hit);
        }
    }

    let profiles = profiles_for_detected(&deduped, Some(workspace_root));
    let default_profile_id = profiles
        .iter()
        .find(|p| p.framework.is_some() && p.tool_available)
        .or_else(|| profiles.first())
        .map(|p| p.id.clone());

    Ok(WorkspaceFrameworkReport {
        package_name,
        workspace_members: resolved_members,
        detected: deduped,
        profiles,
        default_profile_id,
    })
}

/// Maps a Cargo crate name to a [`FrameworkKind`], if supported.
pub fn framework_from_crate_name(name: &str) -> Option<FrameworkKind> {
    let normalized = name.trim().to_ascii_lowercase();
    KNOWN_FRAMEWORKS
        .into_iter()
        .find(|&kind| crate_name_for(kind) == normalized)
}

#[derive(Default)]
struct ParsedManifest {
    package_name: Option<String>,
    workspace_members: Vec<String>,
    dependencies: Vec<(String, Option<String>)>,
}

fn parse_manifest(content: &str) -> ParsedManifest {
    let mut result = ParsedManifest::default();
    let mut section = String::new();
    let mut in_members_array = false;
    let mut brace_depth: i32 = 0;

    for raw_line in content.lines() {
        let stripped = strip_toml_comment(raw_line).trim();
        if stripped.is_empty() {
            continue;
        }

        if in_members_array {
            collect_quoted_strings(stripped, &mut result.workspace_members);
            if stripped.contains(']') {
                in_members_array = false;
            }
            continue;
        }

        if brace_depth > 0 {
            brace_depth += count_char(stripped, '{') as i32;
            brace_depth -= count_char(stripped, '}') as i32;
            if brace_depth < 0 {
                brace_depth = 0;
            }
            continue;
        }

        if stripped.starts_with('[') && stripped.ends_with(']') {
            let inner = stripped[1..stripped.len() - 1].trim();
            section = inner.trim_matches(['[', ']']).trim().to_string();
            continue;
        }

        let Some((lhs, rhs)) = stripped.split_once('=') else {
            continue;
        };
        let key = lhs.trim();
        let val = rhs.trim();

        if section == "package" && key == "name" {
            if let Some(name) = extract_first_quoted(val) {
                result.package_name = Some(name);
            }
            continue;
        }

        if section == "workspace" && key == "members" {
            collect_quoted_strings(val, &mut result.workspace_members);
            if val.contains('[') && !val.contains(']') {
                in_members_array = true;
            }
            continue;
        }

        if is_dependency_section(&section) {
            // Handle `axum.workspace = true` or `axum.version = "0.7"`.
            let base_key = key.split('.').next().unwrap_or(key).trim();
            let clean_key = base_key.trim_matches(['"', '\'']);
            if clean_key.is_empty() {
                continue;
            }

            let actual_pkg = extract_inline_package_rename(val).unwrap_or(clean_key);
            let version = extract_dep_version(val);
            result.dependencies.push((actual_pkg.to_string(), version));

            let delta = count_char(val, '{') as i32 - count_char(val, '}') as i32;
            if delta > 0 {
                brace_depth = delta;
            }
        }
    }

    result
}

fn is_dependency_section(section: &str) -> bool {
    if matches!(
        section,
        "dependencies" | "dev-dependencies" | "build-dependencies" | "workspace.dependencies"
    ) {
        return true;
    }
    if section.starts_with("target.") {
        return section.ends_with(".dependencies")
            || section.ends_with(".dev-dependencies")
            || section.ends_with(".build-dependencies");
    }
    false
}

fn strip_toml_comment(line: &str) -> &str {
    let mut in_double = false;
    let mut in_single = false;
    let mut escaped = false;
    for (idx, ch) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if in_double {
            if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_double = false;
            }
            continue;
        }
        if in_single {
            if ch == '\'' {
                in_single = false;
            }
            continue;
        }
        match ch {
            '"' => in_double = true,
            '\'' => in_single = true,
            '#' => return &line[..idx],
            _ => {}
        }
    }
    line
}

fn extract_first_quoted(raw: &str) -> Option<String> {
    let quote = if raw.starts_with('"') {
        '"'
    } else if raw.starts_with('\'') {
        '\''
    } else {
        return None;
    };
    let rest = &raw[1..];
    let end = rest.find(quote)?;
    Some(rest[..end].to_string())
}

fn collect_quoted_strings(raw: &str, out: &mut Vec<String>) {
    let mut rest = raw;
    while let Some(start) = rest.find(['"', '\'']) {
        let quote = rest.as_bytes()[start] as char;
        let after = &rest[start + 1..];
        let Some(end) = after.find(quote) else {
            break;
        };
        let item = after[..end].trim();
        if !item.is_empty() {
            out.push(item.to_string());
        }
        rest = &after[end + 1..];
    }
}

fn extract_inline_package_rename(val: &str) -> Option<&str> {
    let idx = val.find("package")?;
    let after = val[idx + "package".len()..].trim_start();
    let after_eq = after.strip_prefix('=')?.trim_start();
    let quote = after_eq.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &after_eq[1..];
    let end = inner.find(quote)?;
    Some(&inner[..end])
}

fn extract_dep_version(val: &str) -> Option<String> {
    if val.starts_with('"') || val.starts_with('\'') {
        return extract_first_quoted(val);
    }
    if let Some(idx) = val.find("version") {
        let after = val[idx + "version".len()..].trim_start();
        if let Some(after_eq) = after.strip_prefix('=') {
            return extract_first_quoted(after_eq.trim_start());
        }
    }
    if val.contains("workspace") && val.contains("true") {
        return Some("workspace".to_string());
    }
    None
}

fn count_char(s: &str, target: char) -> usize {
    s.chars().filter(|&c| c == target).count()
}

fn expand_workspace_members(workspace_root: &Path, patterns: &[String]) -> Vec<String> {
    let mut members = Vec::new();
    let mut seen = HashSet::new();

    for raw_pattern in patterns {
        let pattern = raw_pattern.trim().trim_matches('/').replace('\\', "/");
        if pattern.is_empty() || pattern.contains("..") {
            continue;
        }
        if let Some(prefix) = pattern.strip_suffix("/*") {
            let parent = workspace_root.join(prefix);
            let Ok(read_dir) = fs::read_dir(&parent) else {
                continue;
            };
            let mut entries: Vec<String> = read_dir
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().into_string().ok())
                .map(|name| {
                    if prefix.is_empty() {
                        name
                    } else {
                        format!("{prefix}/{name}")
                    }
                })
                .collect();
            entries.sort();
            for item in entries {
                if seen.insert(item.clone()) {
                    members.push(item);
                }
            }
        } else if seen.insert(pattern.clone()) {
            members.push(pattern);
        }
    }

    members
}

fn parse_cargo_lock(lock_path: &Path) -> HashMap<String, String> {
    let mut versions = HashMap::new();
    let Ok(content) = fs::read_to_string(lock_path) else {
        return versions;
    };

    let mut in_pkg = false;
    let mut cur_name: Option<String> = None;
    let mut cur_version: Option<String> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line == "[[package]]" {
            if let (Some(name), Some(ver)) = (cur_name.take(), cur_version.take()) {
                versions.entry(name).or_insert(ver);
            }
            in_pkg = true;
            continue;
        }
        if !in_pkg {
            continue;
        }
        if line.starts_with('[') {
            if let (Some(name), Some(ver)) = (cur_name.take(), cur_version.take()) {
                versions.entry(name).or_insert(ver);
            }
            in_pkg = false;
            continue;
        }
        if let Some(rest) = line.strip_prefix("name = ") {
            cur_name = extract_first_quoted(rest.trim());
        } else if let Some(rest) = line.strip_prefix("version = ") {
            cur_version = extract_first_quoted(rest.trim());
        }
    }

    if let (Some(name), Some(ver)) = (cur_name, cur_version) {
        versions.entry(name).or_insert(ver);
    }

    versions
}
