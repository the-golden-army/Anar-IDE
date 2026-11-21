//! Framework detection, project templates, and run profiles.
//!
//! Full framework support (`axum`, `actix-web`, `rocket`, `dioxus`, `leptos`,
//! `yew`, `tauri`, `bevy`, `clap`) is scheduled for Phase 6.

use anar_core::FrameworkKind;

/// Metadata describing how Anar labels and profiles a supported Rust framework.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameworkDescriptor {
    pub kind: FrameworkKind,
    pub crate_name: &'static str,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_crate_names_match_cargo_registry() {
        assert_eq!(crate_name_for(FrameworkKind::ActixWeb), "actix-web");
        assert_eq!(crate_name_for(FrameworkKind::Axum), "axum");
        assert_eq!(crate_name_for(FrameworkKind::Dioxus), "dioxus");
    }
}
