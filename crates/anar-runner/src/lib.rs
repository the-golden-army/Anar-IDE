//! Build and run pipeline for Cargo and Rusturbo backends.
//!
//! Supports streaming Cargo execution, `--message-format=json` diagnostic parsing,
//! interactive stdin forwarding, cross-platform process-tree termination, and
//! Rusturbo (`v0.1.2`) CLI probing, `analyze --json`, `init`, and build/run delegation.

pub mod diagnostics;
pub mod process;
pub mod rusturbo;

pub use diagnostics::{normalize_diagnostic_path, parse_cargo_stdout_line, ParsedCargoLine};
pub use process::RunnerManager;
pub use rusturbo::{
    analyze_workspace_with_rusturbo, find_rusturbo_binary, init_rusturbo_config,
    probe_rusturbo_status, RusturboAnalysis, RusturboStatus,
};

use anar_core::{CompilerBackend, DiagnosticItem};
use serde::{Deserialize, Serialize};

/// Supported runner actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RunnerAction {
    Build,
    Run,
    Check,
    Test,
}

/// Output stream origin for streamed console lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

/// Ordered event emitted on the runner Tauri channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RunnerEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        run_id: u64,
        action: RunnerAction,
        command: String,
    },
    #[serde(rename_all = "camelCase")]
    Output {
        run_id: u64,
        stream: OutputStream,
        line: String,
    },
    #[serde(rename_all = "camelCase")]
    Diagnostic {
        run_id: u64,
        diagnostic: DiagnosticItem,
    },
    #[serde(rename_all = "camelCase")]
    Finished {
        run_id: u64,
        action: RunnerAction,
        exit_code: Option<i32>,
        cancelled: bool,
        duration_ms: u64,
    },
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

/// Returns the argument vector passed to `cargo` for a given [`RunnerAction`].
pub fn cargo_args_for(action: RunnerAction) -> Vec<&'static str> {
    match action {
        RunnerAction::Build => vec!["build", "--message-format=json"],
        RunnerAction::Run => vec!["run", "--message-format=json"],
        RunnerAction::Check => vec!["check", "--message-format=json"],
        RunnerAction::Test => vec!["test", "--message-format=json"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

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

    #[test]
    fn cargo_args_include_json_diagnostics() {
        assert_eq!(
            cargo_args_for(RunnerAction::Build),
            vec!["build", "--message-format=json"]
        );
        assert_eq!(
            cargo_args_for(RunnerAction::Run),
            vec!["run", "--message-format=json"]
        );
        assert_eq!(
            cargo_args_for(RunnerAction::Check),
            vec!["check", "--message-format=json"]
        );
        assert_eq!(
            cargo_args_for(RunnerAction::Test),
            vec!["test", "--message-format=json"]
        );
    }

    #[test]
    fn runner_manager_executes_cargo_version_and_streams_output() {
        let manager = Arc::new(RunnerManager::new());
        let events = Arc::new(Mutex::new(Vec::<RunnerEvent>::new()));
        let events_cb = Arc::clone(&events);

        let cwd = std::env::temp_dir();
        let run_id = manager
            .spawn_command(
                &cwd,
                RunnerAction::Check,
                "cargo",
                &["--version"],
                false,
                move |evt| {
                    if let Ok(mut guard) = events_cb.lock() {
                        guard.push(evt);
                    }
                },
            )
            .expect("spawn cargo --version");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            let done = events
                .lock()
                .map(|g| g.iter().any(|e| matches!(e, RunnerEvent::Finished { .. })))
                .unwrap_or(false);
            if done || std::time::Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }

        let captured = events.lock().unwrap().clone();
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Started {
                run_id: id,
                action: RunnerAction::Check,
                ..
            } if *id == run_id
        )));
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Output {
                stream: OutputStream::Stdout,
                line,
                ..
            } if line.contains("cargo")
        )));
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Finished {
                exit_code: Some(0),
                cancelled: false,
                ..
            }
        )));
    }
}
