//! Core domain types and shared abstractions for Anar.
//!
//! This crate intentionally has **no** dependency on Tauri so that all domain
//! crates can compile and be tested without a desktop runtime.

pub mod preferences;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Compiler backend used to build and run Rust projects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompilerBackend {
    #[default]
    Cargo,
    Rusturbo,
}

/// Supported Rust frameworks detected and profiled by Anar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FrameworkKind {
    Axum,
    ActixWeb,
    Rocket,
    Dioxus,
    Leptos,
    Yew,
    Tauri,
    Bevy,
    Clap,
}

/// Minimal descriptor for an opened Rust project or Cargo workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectDescriptor {
    pub name: String,
    pub root_dir: PathBuf,
    pub backend: CompilerBackend,
}

impl ProjectDescriptor {
    /// Creates a new [`ProjectDescriptor`] using the default Cargo backend.
    pub fn new(name: impl Into<String>, root_dir: impl Into<PathBuf>) -> Self {
        Self {
            name: name.into(),
            root_dir: root_dir.into(),
            backend: CompilerBackend::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_descriptor_defaults_to_cargo_backend() {
        let project = ProjectDescriptor::new("hello-anar", "/tmp/hello-anar");
        assert_eq!(project.name, "hello-anar");
        assert_eq!(project.backend, CompilerBackend::Cargo);
    }
}
