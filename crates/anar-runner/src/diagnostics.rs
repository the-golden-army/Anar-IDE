use anar_core::{DiagnosticItem, DiagnosticSeverity, DiagnosticSpan};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct CargoJsonMessage {
    reason: String,
    #[serde(default)]
    message: Option<CargoCompilerMessage>,
}

#[derive(Debug, Deserialize)]
struct CargoCompilerMessage {
    message: String,
    level: String,
    code: Option<CargoDiagnosticCode>,
    #[serde(default)]
    spans: Vec<CargoDiagnosticSpan>,
    rendered: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CargoDiagnosticCode {
    code: String,
}

#[derive(Debug, Deserialize)]
struct CargoDiagnosticSpan {
    file_name: String,
    line_start: u32,
    line_end: u32,
    column_start: u32,
    column_end: u32,
    is_primary: bool,
    label: Option<String>,
}

/// Result of inspecting a single stdout line from `cargo --message-format=json`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedCargoLine {
    /// Structured compiler diagnostic emitted by `rustc`.
    Diagnostic(DiagnosticItem),
    /// Cargo JSON metadata line (such as `compiler-artifact` or `build-finished`)
    /// that does not represent user-facing diagnostic text.
    Metadata,
    /// Non-JSON stdout output (for example `println!` output from `cargo run` or `cargo test`).
    PlainStdout(String),
}

fn map_severity(level: &str) -> DiagnosticSeverity {
    match level {
        "error" | "error: internal compiler error" => DiagnosticSeverity::Error,
        "warning" => DiagnosticSeverity::Warning,
        "help" => DiagnosticSeverity::Help,
        _ => DiagnosticSeverity::Note,
    }
}

/// Normalizes a diagnostic path relative to `workspace_root` using `/` separators.
pub fn normalize_diagnostic_path(workspace_root: Option<&Path>, raw_path: &str) -> String {
    let normalized_slashes = raw_path.replace('\\', "/");
    if let Some(root) = workspace_root {
        let root_str = root.to_string_lossy().replace('\\', "/");
        let trimmed_root = root_str.trim_end_matches('/');
        let prefix = format!("{trimmed_root}/");
        if let Some(rel) = normalized_slashes.strip_prefix(&prefix) {
            return rel.to_string();
        }
    }
    normalized_slashes
}

/// Parses one line of `cargo ... --message-format=json` stdout.
pub fn parse_cargo_stdout_line(workspace_root: Option<&Path>, line: &str) -> ParsedCargoLine {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return ParsedCargoLine::PlainStdout(line.to_string());
    }

    let Ok(envelope) = serde_json::from_str::<CargoJsonMessage>(trimmed) else {
        return ParsedCargoLine::PlainStdout(line.to_string());
    };

    if envelope.reason != "compiler-message" {
        return ParsedCargoLine::Metadata;
    }

    let Some(msg) = envelope.message else {
        return ParsedCargoLine::Metadata;
    };

    ParsedCargoLine::Diagnostic(compiler_message_to_diagnostic(workspace_root, msg))
}

/// Parses one line of `rustc --error-format=json` stderr.
pub fn parse_rustc_stderr_line(workspace_root: Option<&Path>, line: &str) -> ParsedCargoLine {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return ParsedCargoLine::PlainStdout(line.to_string());
    }

    let Ok(msg) = serde_json::from_str::<CargoCompilerMessage>(trimmed) else {
        return ParsedCargoLine::PlainStdout(line.to_string());
    };

    ParsedCargoLine::Diagnostic(compiler_message_to_diagnostic(workspace_root, msg))
}

fn compiler_message_to_diagnostic(
    workspace_root: Option<&Path>,
    msg: CargoCompilerMessage,
) -> DiagnosticItem {
    let spans: Vec<DiagnosticSpan> = msg
        .spans
        .into_iter()
        .map(|s| DiagnosticSpan {
            file_name: normalize_diagnostic_path(workspace_root, &s.file_name),
            line_start: s.line_start,
            line_end: s.line_end,
            column_start: s.column_start,
            column_end: s.column_end,
            is_primary: s.is_primary,
            label: s.label,
        })
        .collect();

    let primary_span = spans
        .iter()
        .find(|s| s.is_primary)
        .cloned()
        .or_else(|| spans.first().cloned());

    DiagnosticItem {
        severity: map_severity(&msg.level),
        code: msg.code.map(|c| c.code),
        message: msg.message,
        rendered: msg.rendered,
        primary_span,
        spans,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_compiler_error_and_normalizes_path() {
        let json = r#"{"reason":"compiler-message","message":{"rendered":"error[E0308]: mismatched types\n","children":[],"code":{"code":"E0308","explanation":null},"level":"error","message":"mismatched types","spans":[{"column_end":18,"column_start":12,"file_name":"src\\main.rs","is_primary":true,"label":"expected `i32`, found `&str`","line_end":4,"line_start":4}]}}"#;
        let parsed = parse_cargo_stdout_line(None, json);
        match parsed {
            ParsedCargoLine::Diagnostic(diag) => {
                assert_eq!(diag.severity, DiagnosticSeverity::Error);
                assert_eq!(diag.code.as_deref(), Some("E0308"));
                assert_eq!(diag.message, "mismatched types");
                let primary = diag.primary_span.expect("primary span");
                assert_eq!(primary.file_name, "src/main.rs");
                assert_eq!(primary.line_start, 4);
                assert_eq!(primary.column_start, 12);
            }
            other => panic!("expected diagnostic, got {other:?}"),
        }
    }

    #[test]
    fn strips_workspace_root_prefix_from_diagnostic_path() {
        let root = PathBuf::from("/tmp/demo-app");
        let norm = normalize_diagnostic_path(Some(&root), "/tmp/demo-app/src/lib.rs");
        assert_eq!(norm, "src/lib.rs");
    }

    #[test]
    fn passes_through_plain_user_stdout_and_ignores_artifacts() {
        let user_line = "hello from rust";
        assert_eq!(
            parse_cargo_stdout_line(None, user_line),
            ParsedCargoLine::PlainStdout(user_line.to_string())
        );

        let artifact = r#"{"reason":"compiler-artifact","package_id":"demo 0.1.0"}"#;
        assert_eq!(
            parse_cargo_stdout_line(None, artifact),
            ParsedCargoLine::Metadata
        );
    }

    #[test]
    fn parses_rustc_json_stderr_diagnostic() {
        let json = r#"{"rendered":"error[E0425]: cannot find value `x`\n","children":[],"code":{"code":"E0425","explanation":null},"level":"error","message":"cannot find value `x`","spans":[{"column_end":6,"column_start":5,"file_name":"src/app.rs","is_primary":true,"label":"not found in this scope","line_end":2,"line_start":2}]}"#;
        match parse_rustc_stderr_line(None, json) {
            ParsedCargoLine::Diagnostic(diag) => {
                assert_eq!(diag.severity, DiagnosticSeverity::Error);
                assert_eq!(diag.code.as_deref(), Some("E0425"));
                assert_eq!(diag.message, "cannot find value `x`");
                let primary = diag.primary_span.expect("primary span");
                assert_eq!(primary.file_name, "src/app.rs");
                assert_eq!(primary.line_start, 2);
            }
            other => panic!("expected diagnostic, got {other:?}"),
        }
    }
}
