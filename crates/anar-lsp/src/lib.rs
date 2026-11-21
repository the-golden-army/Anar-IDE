//! `rust-analyzer` lifecycle management and LSP JSON-RPC bridge.
//!
//! Full JSON-RPC transport and `lsp-types` integration are scheduled for Phase 5.

use anar_core::ProjectDescriptor;

/// Current lifecycle state of the managed `rust-analyzer` child process.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LspStatus {
    #[default]
    Stopped,
    Starting,
    Ready,
    Crashed,
}

/// Stub configuration for spawning `rust-analyzer` for a workspace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LspSessionConfig {
    pub workspace_name: String,
    pub status: LspStatus,
}

impl LspSessionConfig {
    /// Creates a stopped LSP session descriptor for the given project.
    pub fn for_project(project: &ProjectDescriptor) -> Self {
        Self {
            workspace_name: project.name.clone(),
            status: LspStatus::Stopped,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_starts_stopped() {
        let project = ProjectDescriptor::new("demo", "/tmp/demo");
        let cfg = LspSessionConfig::for_project(&project);
        assert_eq!(cfg.workspace_name, "demo");
        assert_eq!(cfg.status, LspStatus::Stopped);
    }
}
