//! Framework detection, project templates, and run profiles.
//!
//! Supports `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`,
//! `bevy`, and `clap` plus standard Rust binary/library scaffolding.

pub mod detect;
pub mod profiles;
pub mod templates;

pub use detect::{
    detect_workspace_frameworks, framework_from_crate_name, DetectedFramework, FrameworkCategory,
    WorkspaceFrameworkReport,
};
pub use profiles::{is_binary_available, resolve_profile_by_id, RunProfile};
pub use templates::{
    list_project_templates, scaffold_project, validate_project_name, ProjectTemplateId,
    ProjectTemplateSummary,
};

use anar_core::FrameworkKind;

/// Metadata describing how Anar labels and profiles a supported Rust framework.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameworkDescriptor {
    pub kind: FrameworkKind,
    pub crate_name: &'static str,
    pub display_name: &'static str,
    pub category: FrameworkCategory,
}

/// Returns the canonical Cargo crate identifier for a [`FrameworkKind`].
pub fn crate_name_for(kind: FrameworkKind) -> &'static str {
    match kind {
        FrameworkKind::Axum => "axum",
        FrameworkKind::ActixWeb => "actix-web",
        FrameworkKind::Rocket => "rocket",
        FrameworkKind::Dioxus => "dioxus",
        FrameworkKind::Leptos => "leptos",
        FrameworkKind::Yew => "yew",
        FrameworkKind::Tauri => "tauri",
        FrameworkKind::Bevy => "bevy",
        FrameworkKind::Clap => "clap",
    }
}

/// Returns the human-readable display name for a [`FrameworkKind`].
pub fn display_name_for(kind: FrameworkKind) -> &'static str {
    match kind {
        FrameworkKind::Axum => "Axum",
        FrameworkKind::ActixWeb => "Actix Web",
        FrameworkKind::Rocket => "Rocket",
        FrameworkKind::Dioxus => "Dioxus",
        FrameworkKind::Leptos => "Leptos",
        FrameworkKind::Yew => "Yew",
        FrameworkKind::Tauri => "Tauri",
        FrameworkKind::Bevy => "Bevy",
        FrameworkKind::Clap => "Clap",
    }
}

/// Returns the ecosystem category for a [`FrameworkKind`].
pub fn category_for(kind: FrameworkKind) -> FrameworkCategory {
    match kind {
        FrameworkKind::Axum | FrameworkKind::ActixWeb | FrameworkKind::Rocket => {
            FrameworkCategory::WebApi
        }
        FrameworkKind::Dioxus | FrameworkKind::Leptos | FrameworkKind::Yew => {
            FrameworkCategory::WebFrontend
        }
        FrameworkKind::Tauri => FrameworkCategory::Desktop,
        FrameworkKind::Bevy => FrameworkCategory::GameEngine,
        FrameworkKind::Clap => FrameworkCategory::Cli,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(d) => d.as_nanos(),
            Err(_) => 0,
        };
        let dir = std::env::temp_dir().join(format!("anar-fw-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn find_fw(report: &WorkspaceFrameworkReport, kind: FrameworkKind) -> &DetectedFramework {
        for fw in &report.detected {
            if fw.kind == kind {
                return fw;
            }
        }
        panic!("expected framework {kind:?} in report");
    }

    #[test]
    fn framework_crate_names_match_cargo_registry() {
        assert_eq!(crate_name_for(FrameworkKind::ActixWeb), "actix-web");
        assert_eq!(crate_name_for(FrameworkKind::Axum), "axum");
        assert_eq!(crate_name_for(FrameworkKind::Dioxus), "dioxus");
        assert_eq!(
            framework_from_crate_name("actix-web"),
            Some(FrameworkKind::ActixWeb)
        );
    }

    #[test]
    fn detects_frameworks_across_workspace_members_and_cargo_lock() {
        let root = make_temp_dir("workspace-detect");
        fs::write(
            root.join("Cargo.toml"),
            "[workspace]\nmembers = [\"crates/*\", \"apps/desktop\"]\n\n[workspace.dependencies]\nclap = \"4.5\"\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("crates/api")).unwrap();
        fs::write(
            root.join("crates/api/Cargo.toml"),
            "[package]\nname = \"api\"\nversion = \"0.1.0\"\n\n[dependencies]\nweb = { package = \"axum\", version = \"0.7.5\" }\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("apps/desktop")).unwrap();
        fs::write(
            root.join("apps/desktop/Cargo.toml"),
            "[package]\nname = \"desktop\"\nversion = \"0.1.0\"\n\n[dependencies]\ntauri = { version = \"2.1\", features = [] }\n",
        )
        .unwrap();
        fs::write(
            root.join("Cargo.lock"),
            "[[package]]\nname = \"axum\"\nversion = \"0.7.9\"\n\n[[package]]\nname = \"tauri\"\nversion = \"2.1.1\"\n",
        )
        .unwrap();

        let report = detect_workspace_frameworks(&root).unwrap();
        assert_eq!(
            report.workspace_members,
            vec!["crates/api".to_string(), "apps/desktop".to_string()]
        );

        let axum = find_fw(&report, FrameworkKind::Axum);
        assert_eq!(axum.version_spec.as_deref(), Some("0.7.5"));
        assert_eq!(axum.resolved_version.as_deref(), Some("0.7.9"));
        assert_eq!(axum.source_manifest, "crates/api/Cargo.toml");

        let tauri = find_fw(&report, FrameworkKind::Tauri);
        assert_eq!(tauri.resolved_version.as_deref(), Some("2.1.1"));

        let clap = find_fw(&report, FrameworkKind::Clap);
        assert_eq!(clap.source_manifest, "Cargo.toml");

        assert!(report.profiles.iter().any(|p| p.id == "axum-serve"));
        assert!(report.profiles.iter().any(|p| p.id == "tauri-dev"));
        assert!(report.profiles.iter().any(|p| p.id == "cargo-run"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn scaffolds_and_detects_all_framework_templates() {
        let parent = make_temp_dir("templates");
        let templates = list_project_templates();
        assert_eq!(templates.len(), 11);

        let axum_dir = scaffold_project(&parent, "demo-axum", ProjectTemplateId::Axum).unwrap();
        let axum_report = detect_workspace_frameworks(&axum_dir).unwrap();
        let pkg_name = axum_report.package_name.as_deref();
        assert_eq!(pkg_name, Some("demo-axum"));
        assert_eq!(axum_report.detected.len(), 1);
        assert_eq!(axum_report.detected[0].kind, FrameworkKind::Axum);
        let default_id = axum_report.default_profile_id.as_deref();
        assert_eq!(default_id, Some("axum-serve"));

        let tauri_res = scaffold_project(&parent, "demo-tauri", ProjectTemplateId::Tauri);
        let tauri_dir = tauri_res.unwrap();
        let tauri_report = detect_workspace_frameworks(&tauri_dir).unwrap();
        assert_eq!(tauri_report.detected.len(), 1);
        assert_eq!(tauri_report.detected[0].kind, FrameworkKind::Tauri);
        assert_eq!(
            tauri_report.detected[0].source_manifest,
            "src-tauri/Cargo.toml"
        );

        assert!(validate_project_name("../bad").is_err());
        assert!(scaffold_project(&parent, "demo-axum", ProjectTemplateId::Binary).is_err());

        let _ = fs::remove_dir_all(&parent);
    }
}
