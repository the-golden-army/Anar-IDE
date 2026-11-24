use crate::diagnostics::normalize_diagnostic_path;
use crate::RunnerAction;
use anar_core::{DiagnosticItem, DiagnosticSeverity, DiagnosticSpan};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Capability and installation status for the optional `rusturbo` accelerator CLI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RusturboStatus {
    pub available: bool,
    pub binary_path: Option<String>,
    pub version: Option<String>,
    pub config_exists: bool,
    pub configured_preset: Option<String>,
    pub shared_targets: Option<bool>,
    pub linker_mode: Option<String>,
    pub supports_check: bool,
    pub supports_test: bool,
    pub supports_json_diagnostics: bool,
}

/// Summary extracted from `rusturbo analyze --json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RusturboAnalysis {
    pub rusturbo_version: Option<String>,
    pub config_found: bool,
    pub linker_selected: Option<String>,
    pub sccache_active: Option<bool>,
    pub sccache_path: Option<String>,
    pub package_count: Option<u64>,
    pub edge_count: Option<u64>,
    pub duplicate_count: Option<u64>,
    pub cache_decision: Option<String>,
    pub cache_reuse: Option<String>,
    pub cache_key: Option<String>,
    pub advice: Vec<String>,
}

/// Returns the `rusturbo` CLI argument vector for `action`, or `None` if Cargo fallback is needed.
pub fn rusturbo_args_for(workspace_root: &Path, action: RunnerAction) -> Option<Vec<String>> {
    let subcommand = match action {
        RunnerAction::Build => "build",
        RunnerAction::Run => "run",
        RunnerAction::Check | RunnerAction::Test => return None,
    };
    Some(vec![
        String::from("--manifest-dir"),
        workspace_root.to_string_lossy().into_owned(),
        String::from(subcommand),
    ])
}

/// Searches `PATH` (and `~/.cargo/bin`) for an executable `rusturbo` binary.
pub fn find_rusturbo_binary() -> Option<PathBuf> {
    let exe_name = if cfg!(windows) {
        "rusturbo.exe"
    } else {
        "rusturbo"
    };

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(exe_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(home_dir) = home {
        let cargo_bin = PathBuf::from(home_dir)
            .join(".cargo")
            .join("bin")
            .join(exe_name);
        if cargo_bin.is_file() {
            return Some(cargo_bin);
        }
    }

    None
}

/// Summary extracted from `<workspace>/rusturbo.toml`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RusturboTomlSummary {
    pub exists: bool,
    pub preset: Option<String>,
    pub shared_targets: Option<bool>,
    pub linker_mode: Option<String>,
}

/// Probes `rusturbo` availability, CLI version, and workspace `rusturbo.toml` presence.
pub fn probe_rusturbo_status(workspace_root: Option<&Path>) -> RusturboStatus {
    let binary = find_rusturbo_binary();
    let version = binary.as_deref().and_then(read_rusturbo_version);
    // Treat broken wrapper shims (e.g. npm wrapper missing its native binary) as unavailable.
    let available = binary.is_some() && version.is_some();

    let toml_summary = workspace_root
        .map(|root| inspect_rusturbo_toml(&root.join("rusturbo.toml")))
        .unwrap_or_default();

    RusturboStatus {
        available,
        binary_path: binary.map(|p| p.to_string_lossy().into_owned()),
        version,
        config_exists: toml_summary.exists,
        configured_preset: toml_summary.preset,
        shared_targets: toml_summary.shared_targets,
        linker_mode: toml_summary.linker_mode,
        // Rusturbo v0.1.2 only implements `build` and `run` and discards Cargo stdout.
        supports_check: false,
        supports_test: false,
        supports_json_diagnostics: false,
    }
}

fn read_rusturbo_version(binary: &Path) -> Option<String> {
    let mut cmd = Command::new(binary);
    anar_core::configure_background_command(&mut cmd);
    let output = cmd.arg("--version").env("NO_COLOR", "1").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Runs `rusturbo --manifest-dir <root> analyze --json` and returns structured insights.
pub fn analyze_workspace_with_rusturbo(workspace_root: &Path) -> Result<RusturboAnalysis, String> {
    let binary = find_rusturbo_binary().ok_or_else(|| {
        String::from(
            "rusturbo binary not found on PATH. Install via `cargo install --git https://github.com/the-golden-army/Rusturbo --locked`.",
        )
    })?;

    let mut cmd = Command::new(&binary);
    anar_core::configure_background_command(&mut cmd);
    let output = cmd
        .arg("--manifest-dir")
        .arg(workspace_root)
        .args(["analyze", "--json"])
        .env("NO_COLOR", "1")
        .output()
        .map_err(|e| format!("failed to run `rusturbo analyze --json`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        return Err(if msg.is_empty() {
            format!(
                "`rusturbo analyze --json` exited with status {:?}",
                output.status.code()
            )
        } else {
            format!("`rusturbo analyze --json` failed: {msg}")
        });
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    parse_rusturbo_analyze_json(&raw)
}

/// Runs `rusturbo --manifest-dir <root> init` with validated preset/profile options.
pub fn init_rusturbo_config(
    workspace_root: &Path,
    preset: Option<&str>,
    profile: Option<&str>,
) -> Result<RusturboStatus, String> {
    let binary = find_rusturbo_binary().ok_or_else(|| {
        String::from(
            "rusturbo binary not found on PATH. Install via `cargo install --git https://github.com/the-golden-army/Rusturbo --locked`.",
        )
    })?;

    let mut args: Vec<&str> = vec!["init"];
    if let Some(p) = preset {
        match p {
            "auto" | "actix" => {
                args.push("--preset");
                args.push(p);
            }
            other => {
                return Err(format!(
                    "unsupported rusturbo preset `{other}` (expected `auto` or `actix`)"
                ));
            }
        }
    }
    if let Some(prof) = profile {
        match prof {
            "balanced" | "fastest" | "safe" => {
                args.push("--profile");
                args.push(prof);
            }
            other => {
                return Err(format!(
                    "unsupported rusturbo profile `{other}` (expected `balanced`, `fastest`, or `safe`)"
                ));
            }
        }
    }

    let mut cmd = Command::new(&binary);
    anar_core::configure_background_command(&mut cmd);
    let output = cmd
        .arg("--manifest-dir")
        .arg(workspace_root)
        .args(&args)
        .env("NO_COLOR", "1")
        .output()
        .map_err(|e| format!("failed to run `rusturbo init`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        return Err(if msg.is_empty() {
            format!(
                "`rusturbo init` exited with status {:?}",
                output.status.code()
            )
        } else {
            format!("`rusturbo init` failed: {msg}")
        });
    }

    Ok(probe_rusturbo_status(Some(workspace_root)))
}

/// Parses `rusturbo analyze --json` output into [`RusturboAnalysis`].
pub fn parse_rusturbo_analyze_json(raw: &str) -> Result<RusturboAnalysis, String> {
    let trimmed = raw.trim();
    let json_slice = if let Some(start) = trimmed.find('{') {
        &trimmed[start..]
    } else {
        return Err(String::from("rusturbo analyze output did not contain JSON"));
    };

    let val: Value = serde_json::from_str(json_slice)
        .map_err(|e| format!("failed to parse rusturbo analyze JSON: {e}"))?;

    let rusturbo_version = pick_str(&val, &["rusturbo_version", "rusturboVersion"]);
    let config_found = val
        .get("config_found")
        .or_else(|| val.get("configFound"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let linker_val = val.get("linker");
    let linker_selected = linker_val.and_then(|l| {
        l.as_str()
            .map(str::to_string)
            .or_else(|| pick_str(l, &["selected", "active", "linker", "mode", "name"]))
    });

    let sccache_val = val.get("sccache");
    let sccache_active = sccache_val.and_then(|s| {
        s.as_bool()
            .or_else(|| pick_bool(s, &["active", "enabled", "available", "usable"]))
    });
    let sccache_path = sccache_val.and_then(|s| pick_str(s, &["path", "binary"]));

    let graph_val = val.get("graph");
    let package_count =
        graph_val.and_then(|g| pick_u64(g, &["package_count", "packages", "nodes"]));
    let edge_count = graph_val.and_then(|g| pick_u64(g, &["edge_count", "edges"]));
    let duplicate_count = graph_val.and_then(|g| {
        pick_u64(g, &["duplicate_count", "duplicates"]).or_else(|| {
            g.get("duplicates")
                .and_then(Value::as_array)
                .map(|arr| arr.len() as u64)
        })
    });

    let cache_val = val.get("cache");
    let cache_decision =
        cache_val.and_then(|c| pick_str(c, &["decision", "verdict", "status", "reason"]));
    let cache_reuse = cache_val.and_then(|c| pick_str(c, &["reuse", "strategy", "mode"]));
    let cache_key = cache_val.and_then(|c| pick_str(c, &["key", "short_key"]));

    let mut advice = Vec::new();
    if let Some(items) = val.get("advice").and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.as_str() {
                if !text.trim().is_empty() {
                    advice.push(text.trim().to_string());
                }
            } else if let Some(text) =
                pick_str(item, &["message", "title", "summary", "text", "detail"])
            {
                advice.push(text);
            }
        }
    }

    Ok(RusturboAnalysis {
        rusturbo_version,
        config_found,
        linker_selected,
        sccache_active,
        sccache_path,
        package_count,
        edge_count,
        duplicate_count,
        cache_decision,
        cache_reuse,
        cache_key,
        advice,
    })
}

fn pick_str(obj: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = obj.get(*key).and_then(Value::as_str) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn pick_bool(obj: &Value, keys: &[&str]) -> Option<bool> {
    for key in keys {
        if let Some(b) = obj.get(*key).and_then(Value::as_bool) {
            return Some(b);
        }
    }
    None
}

fn pick_u64(obj: &Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(v) = obj.get(*key) {
            if let Some(n) = v.as_u64() {
                return Some(n);
            }
            if let Some(arr) = v.as_array() {
                return Some(arr.len() as u64);
            }
        }
    }
    None
}

/// Lightweight parser for `rusturbo.toml` without pulling an extra TOML crate.
pub fn inspect_rusturbo_toml(path: &Path) -> RusturboTomlSummary {
    let Ok(raw) = fs::read_to_string(path) else {
        return RusturboTomlSummary::default();
    };

    let mut summary = RusturboTomlSummary {
        exists: true,
        ..RusturboTomlSummary::default()
    };
    let mut section = String::new();

    for raw_line in raw.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len() - 1].trim().to_ascii_lowercase();
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let key = k.trim();
        let val = v.trim().trim_matches('"').trim_matches('\'');
        match (section.as_str(), key) {
            ("profile", "preset") => summary.preset = Some(val.to_string()),
            ("cache", "shared_targets") => {
                if val == "true" {
                    summary.shared_targets = Some(true);
                } else if val == "false" {
                    summary.shared_targets = Some(false);
                }
            }
            ("linker", "mode") => summary.linker_mode = Some(val.to_string()),
            _ => {}
        }
    }

    summary
}

/// Incremental fallback parser for human-readable `rustc` diagnostics on `stderr`.
#[derive(Default)]
pub struct StderrDiagnosticParser {
    pending: Option<(DiagnosticSeverity, Option<String>, String)>,
}

impl StderrDiagnosticParser {
    /// Feeds a stripped `stderr` line and emits a [`DiagnosticItem`] when a span follows.
    pub fn push_line(
        &mut self,
        workspace_root: Option<&Path>,
        raw_line: &str,
    ) -> Option<DiagnosticItem> {
        let stripped = strip_ansi_escapes(raw_line);
        let trimmed = stripped.trim();

        if let Some(rest) = trimmed.strip_prefix("-->") {
            let (severity, code, message) = self.pending.take()?;
            let span = parse_arrow_location(workspace_root, rest.trim())?;
            return Some(DiagnosticItem {
                severity,
                code,
                message,
                rendered: Some(stripped),
                primary_span: Some(span.clone()),
                spans: vec![span],
            });
        }

        if let Some(header) = parse_rustc_header(trimmed) {
            self.pending = Some(header);
        }

        None
    }
}

fn parse_rustc_header(line: &str) -> Option<(DiagnosticSeverity, Option<String>, String)> {
    if let Some(rest) = line.strip_prefix("error") {
        return split_code_and_message(DiagnosticSeverity::Error, rest);
    }
    if let Some(rest) = line.strip_prefix("warning") {
        return split_code_and_message(DiagnosticSeverity::Warning, rest);
    }
    None
}

fn split_code_and_message(
    severity: DiagnosticSeverity,
    rest: &str,
) -> Option<(DiagnosticSeverity, Option<String>, String)> {
    if let Some(after_bracket) = rest.strip_prefix('[') {
        let (code, msg_part) = after_bracket.split_once("]:")?;
        let message = msg_part.trim();
        if message.is_empty() {
            return None;
        }
        return Some((severity, Some(code.trim().to_string()), message.to_string()));
    }
    let msg_part = rest.strip_prefix(':')?;
    let message = msg_part.trim();
    if message.is_empty()
        || message.starts_with("could not compile")
        || message.starts_with("build failed")
    {
        return None;
    }
    Some((severity, None, message.to_string()))
}

fn parse_arrow_location(workspace_root: Option<&Path>, text: &str) -> Option<DiagnosticSpan> {
    let mut parts = text.rsplitn(3, ':');
    let col: u32 = parts.next()?.trim().parse().ok()?;
    let line: u32 = parts.next()?.trim().parse().ok()?;
    let raw_file = parts.next()?.trim();
    if raw_file.is_empty() {
        return None;
    }
    let file_name = normalize_diagnostic_path(workspace_root, raw_file);
    Some(DiagnosticSpan {
        file_name,
        line_start: line,
        line_end: line,
        column_start: col,
        column_end: col.saturating_add(1),
        is_primary: true,
        label: None,
    })
}

fn strip_ansi_escapes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for esc in chars.by_ref() {
                    if esc.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rusturbo_args_only_for_build_and_run() {
        let root = Path::new("/tmp/sample");
        assert_eq!(
            rusturbo_args_for(root, RunnerAction::Build),
            Some(vec![
                "--manifest-dir".into(),
                "/tmp/sample".into(),
                "build".into()
            ])
        );
        assert_eq!(
            rusturbo_args_for(root, RunnerAction::Run),
            Some(vec![
                "--manifest-dir".into(),
                "/tmp/sample".into(),
                "run".into()
            ])
        );
        assert_eq!(rusturbo_args_for(root, RunnerAction::Check), None);
        assert_eq!(rusturbo_args_for(root, RunnerAction::Test), None);
    }

    #[test]
    fn parse_analyze_json_handles_rusturbo_report() {
        let sample = r#"{
          "rusturbo_version": "0.1.2",
          "config_found": true,
          "linker": { "selected": "mold" },
          "sccache": { "active": true, "path": "/usr/bin/sccache" },
          "graph": { "package_count": 42, "edge_count": 88, "duplicate_count": 1 },
          "cache": { "decision": "hit", "reuse": "shared_target", "key": "abc123" },
          "advice": ["Consider removing tokio/full to trim compile cost"]
        }"#;
        let parsed = parse_rusturbo_analyze_json(sample).expect("parse sample");
        assert_eq!(parsed.rusturbo_version.as_deref(), Some("0.1.2"));
        assert!(parsed.config_found);
        assert_eq!(parsed.linker_selected.as_deref(), Some("mold"));
        assert_eq!(parsed.sccache_active, Some(true));
        assert_eq!(parsed.sccache_path.as_deref(), Some("/usr/bin/sccache"));
        assert_eq!(parsed.package_count, Some(42));
        assert_eq!(parsed.edge_count, Some(88));
        assert_eq!(parsed.duplicate_count, Some(1));
        assert_eq!(parsed.cache_decision.as_deref(), Some("hit"));
        assert_eq!(parsed.cache_reuse.as_deref(), Some("shared_target"));
        assert_eq!(parsed.advice.len(), 1);
    }

    #[test]
    fn inspect_rusturbo_toml_reads_preset_cache_and_linker() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-rt-toml-{}-{nanos}", std::process::id());
        let dir = std::env::temp_dir().join(dir_name);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rusturbo.toml");
        let content = concat!(
            "[profile]\npreset = \"fastest\"\n",
            "[cache]\nshared_targets = true\n",
            "[linker]\nmode = \"lld\"\n",
        );
        fs::write(&path, content).unwrap();

        let summary = inspect_rusturbo_toml(&path);
        assert!(summary.exists);
        assert_eq!(summary.preset.as_deref(), Some("fastest"));
        assert_eq!(summary.shared_targets, Some(true));
        assert_eq!(summary.linker_mode.as_deref(), Some("lld"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stderr_diagnostic_parser_extracts_error_and_location() {
        let mut parser = StderrDiagnosticParser::default();
        let root = Path::new("/workspace/demo");
        let header = "\x1b[1;31merror[E0425]\x1b[0m: cannot find value `x` in this scope";
        assert!(parser.push_line(Some(root), header).is_none());
        let diag = parser
            .push_line(Some(root), "  --> src/main.rs:14:9")
            .expect("expected diagnostic");
        assert_eq!(diag.severity, DiagnosticSeverity::Error);
        assert_eq!(diag.code.as_deref(), Some("E0425"));
        assert_eq!(diag.message, "cannot find value `x` in this scope");
        let span = diag.primary_span.unwrap();
        assert_eq!(span.file_name, "src/main.rs");
        assert_eq!(span.line_start, 14);
        assert_eq!(span.column_start, 9);
    }

    #[test]
    fn read_rusturbo_version_rejects_non_executable_or_missing_binary() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-rt-ver-{}-{nanos}", std::process::id());
        let dir = std::env::temp_dir().join(dir_name);
        fs::create_dir_all(&dir).unwrap();
        let failing = dir.join("missing-bin");
        fs::write(&failing, "").unwrap();
        assert!(read_rusturbo_version(&failing).is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
