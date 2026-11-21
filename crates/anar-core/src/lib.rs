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

/// Severity level for compiler or LSP diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Note,
    Help,
}

/// Source code location associated with a diagnostic.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSpan {
    pub file_name: String,
    pub line_start: u32,
    pub line_end: u32,
    pub column_start: u32,
    pub column_end: u32,
    pub is_primary: bool,
    pub label: Option<String>,
}

/// Normalized compiler or language-server diagnostic.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticItem {
    pub severity: DiagnosticSeverity,
    pub code: Option<String>,
    pub message: String,
    pub rendered: Option<String>,
    pub primary_span: Option<DiagnosticSpan>,
    pub spans: Vec<DiagnosticSpan>,
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
