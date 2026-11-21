//! Build and run pipeline for Cargo and Rusturbo backends.
//!
//! Streaming execution, process supervision, and diagnostic parsing are scheduled
//! for Phase 4 (Cargo) and Phase 7 (Rusturbo).

use anar_core::CompilerBackend;

/// Supported runner actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunnerAction {
    Build,
    Run,
    Check,
    Test,
}

/// Resolves which executable handles a given [`RunnerAction`] for a backend.
pub fn executable_for(backend: CompilerBackend, action: RunnerAction) -> &'static str {
    match (backend, action) {
        // Rusturbo v0.1.2 implements `build` and `run`, but not `check` or `test`.
        (CompilerBackend::Rusturbo, RunnerAction::Build | RunnerAction::Run) => "rusturbo",
        (CompilerBackend::Rusturbo, RunnerAction::Check | RunnerAction::Test) => "cargo",
        (CompilerBackend::Cargo, _) => "cargo",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rusturbo_falls_back_to_cargo_for_check_and_test() {
        assert_eq!(
            executable_for(CompilerBackend::Rusturbo, RunnerAction::Build),
            "rusturbo"
        );
        assert_eq!(
            executable_for(CompilerBackend::Rusturbo, RunnerAction::Check),
            "cargo"
        );
        assert_eq!(
            executable_for(CompilerBackend::Cargo, RunnerAction::Run),
            "cargo"
        );
    }
}
