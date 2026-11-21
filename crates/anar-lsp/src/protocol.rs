//! JSON-RPC 2.0 `Content-Length` framing and typed LSP response parsers.

use crate::uri::uri_to_relative_path;
use anar_core::{DiagnosticItem, DiagnosticSeverity, DiagnosticSpan};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, Write};
use std::path::Path;

/// Lifecycle state of the managed `rust-analyzer` language server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LspStatus {
    #[default]
    Stopped,
    Starting,
    Indexing,
    Ready,
    Unavailable,
    Crashed,
}

/// Emitted to the frontend via `lsp://status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStatusEvent {
    pub status: LspStatus,
    pub detail: Option<String>,
}

/// Emitted to the frontend via `lsp://diagnostics` for one file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDiagnosticsEvent {
    pub relative_path: String,
    pub diagnostics: Vec<DiagnosticItem>,
}

/// 0-based UTF-16 LSP document position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspPosition {
    pub line: u32,
    pub character: u32,
}

/// 0-based LSP document range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRange {
    pub start: LspPosition,
    pub end: LspPosition,
}

/// Completion item projected for CodeMirror autocomplete.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub kind: Option<u32>,
    pub insert_text: Option<String>,
    pub sort_text: Option<String>,
}

/// Hover markdown/plaintext payload and optional highlight range.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspHoverInfo {
    pub contents: String,
    pub range: Option<LspRange>,
}

/// 1-based go-to-definition target inside the opened workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspLocation {
    pub relative_path: String,
    pub line: u32,
    pub col: u32,
}

/// Single document text replacement produced by `textDocument/formatting`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTextEdit {
    pub range: LspRange,
    pub new_text: String,
}

/// Serializes one JSON-RPC 2.0 message with `Content-Length` framing.
pub fn write_lsp_message<W: Write>(writer: &mut W, payload: &Value) -> Result<(), String> {
    let body = match serde_json::to_vec(payload) {
        Ok(bytes) => bytes,
        Err(err) => return Err(format!("failed to serialize LSP message: {err}")),
    };
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    if let Err(err) = writer.write_all(header.as_bytes()) {
        return Err(format!("failed to write LSP header: {err}"));
    }
    if let Err(err) = writer.write_all(&body) {
        return Err(format!("failed to write LSP body: {err}"));
    }
    writer
        .flush()
        .map_err(|err| format!("failed to flush LSP writer: {err}"))
}

/// Reads one `Content-Length` framed JSON-RPC 2.0 message, returning `None` at clean EOF.
pub fn read_lsp_message<R: BufRead>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut content_length: Option<usize> = None;
    let mut line = String::new();

    loop {
        line.clear();
        let read = match reader.read_line(&mut line) {
            Ok(n) => n,
            Err(err) => return Err(format!("failed to read LSP header: {err}")),
        };
        if read == 0 {
            if content_length.is_none() {
                return Ok(None);
            }
            return Err("unexpected EOF while reading LSP headers".to_string());
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            if content_length.is_some() {
                break;
            }
            continue;
        }

        if let Some((name, value)) = trimmed.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                let len = match value.trim().parse::<usize>() {
                    Ok(n) => n,
                    Err(err) => return Err(format!("invalid Content-Length header: {err}")),
                };
                content_length = Some(len);
            }
        }
    }

    let Some(length) = content_length else {
        return Err("missing Content-Length header in LSP frame".to_string());
    };
    let mut body = vec![0u8; length];
    if let Err(err) = reader.read_exact(&mut body) {
        return Err(format!(
            "failed to read LSP payload ({length} bytes): {err}"
        ));
    }

    match serde_json::from_slice(&body) {
        Ok(value) => Ok(Some(value)),
        Err(err) => Err(format!("invalid JSON in LSP payload: {err}")),
    }
}

/// Parses `textDocument/publishDiagnostics` parameters into workspace-scoped diagnostics.
pub fn parse_publish_diagnostics(
    params: &Value,
    workspace_root: &Path,
) -> Option<LspDiagnosticsEvent> {
    let uri = params.get("uri")?.as_str()?;
    let relative_path = uri_to_relative_path(uri, workspace_root)?;
    let raw_items = params.get("diagnostics")?.as_array()?;

    let mut diagnostics = Vec::with_capacity(raw_items.len());
    for item in raw_items {
        let Some(message) = item.get("message").and_then(Value::as_str) else {
            continue;
        };
        let severity = match item.get("severity").and_then(Value::as_u64) {
            Some(1) => DiagnosticSeverity::Error,
            Some(2) => DiagnosticSeverity::Warning,
            Some(3) => DiagnosticSeverity::Note,
            _ => DiagnosticSeverity::Help,
        };
        let code = item.get("code").and_then(|c| {
            if let Some(s) = c.as_str() {
                Some(s.to_string())
            } else {
                c.as_i64().map(|n| n.to_string())
            }
        });
        let range_val = item.get("range");
        let parsed_range =
            range_val.and_then(|r| serde_json::from_value::<LspRange>(r.clone()).ok());
        let primary_span = parsed_range.map(|range| DiagnosticSpan {
            file_name: relative_path.clone(),
            line_start: range.start.line.saturating_add(1),
            line_end: range.end.line.saturating_add(1),
            column_start: range.start.character.saturating_add(1),
            column_end: range.end.character.saturating_add(1),
            is_primary: true,
            label: None,
        });
        let spans = primary_span.clone().into_iter().collect();

        diagnostics.push(DiagnosticItem {
            severity,
            code,
            message: message.to_string(),
            rendered: None,
            primary_span,
            spans,
        });
    }

    Some(LspDiagnosticsEvent {
        relative_path,
        diagnostics,
    })
}

fn str_field(val: &Value, key: &str) -> Option<String> {
    val.get(key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

/// Parses `textDocument/completion` (`CompletionList | CompletionItem[] | null`).
pub fn parse_completion_response(result: &Value) -> Vec<LspCompletionItem> {
    let items_val = if let Some(arr) = result.as_array() {
        arr
    } else if let Some(arr) = result.get("items").and_then(Value::as_array) {
        arr
    } else {
        return Vec::new();
    };

    let mut out = Vec::with_capacity(items_val.len().min(100));
    for item in items_val.iter().take(100) {
        let Some(label) = item.get("label").and_then(Value::as_str) else {
            continue;
        };
        let documentation = item.get("documentation").and_then(|doc| {
            if let Some(s) = doc.as_str() {
                Some(s.to_string())
            } else {
                str_field(doc, "value")
            }
        });
        let kind_u64 = item.get("kind").and_then(Value::as_u64);
        out.push(LspCompletionItem {
            label: label.to_string(),
            detail: str_field(item, "detail"),
            documentation,
            kind: kind_u64.and_then(|k| u32::try_from(k).ok()),
            insert_text: str_field(item, "insertText"),
            sort_text: str_field(item, "sortText"),
        });
    }
    out
}

/// Parses `textDocument/hover` (`Hover | null`).
pub fn parse_hover_response(result: &Value) -> Option<LspHoverInfo> {
    if result.is_null() {
        return None;
    }
    let raw_contents = result.get("contents")?;
    let contents = extract_hover_contents(raw_contents);
    if contents.trim().is_empty() {
        return None;
    }
    let range_val = result.get("range");
    let range = range_val.and_then(|r| serde_json::from_value::<LspRange>(r.clone()).ok());
    Some(LspHoverInfo { contents, range })
}

fn extract_hover_contents(value: &Value) -> String {
    if let Some(s) = value.as_str() {
        return s.to_string();
    }
    if let Some(s) = value.get("value").and_then(Value::as_str) {
        return s.to_string();
    }
    if let Some(arr) = value.as_array() {
        let mut parts = Vec::new();
        for elem in arr {
            let text = extract_hover_contents(elem);
            if !text.trim().is_empty() {
                parts.push(text);
            }
        }
        return parts.join("\n\n");
    }
    String::new()
}

/// Parses `textDocument/definition` (`Location | Location[] | LocationLink[] | null`).
pub fn parse_definition_response(result: &Value, workspace_root: &Path) -> Vec<LspLocation> {
    if result.is_null() {
        return Vec::new();
    }

    let entries: Vec<&Value> = if let Some(arr) = result.as_array() {
        arr.iter().collect()
    } else {
        vec![result]
    };

    let mut out = Vec::new();
    for entry in entries {
        let uri_and_range = if let Some(uri) = entry.get("uri").and_then(Value::as_str) {
            entry.get("range").map(|r| (uri, r))
        } else if let Some(uri) = entry.get("targetUri").and_then(Value::as_str) {
            let range = entry
                .get("targetSelectionRange")
                .or_else(|| entry.get("targetRange"));
            range.map(|r| (uri, r))
        } else {
            None
        };

        let Some((uri, range_val)) = uri_and_range else {
            continue;
        };
        let Some(relative_path) = uri_to_relative_path(uri, workspace_root) else {
            continue;
        };
        let Ok(range) = serde_json::from_value::<LspRange>(range_val.clone()) else {
            continue;
        };
        out.push(LspLocation {
            relative_path,
            line: range.start.line.saturating_add(1),
            col: range.start.character.saturating_add(1),
        });
    }
    out
}

/// Parses `textDocument/formatting` (`TextEdit[] | null`).
pub fn parse_formatting_response(result: &Value) -> Vec<LspTextEdit> {
    let Some(arr) = result.as_array() else {
        return Vec::new();
    };
    let mut edits = Vec::new();
    for item in arr {
        if let Ok(edit) = serde_json::from_value::<LspTextEdit>(item.clone()) {
            edits.push(edit);
        }
    }
    edits
}

/// Maps `$/progress` notifications from `rust-analyzer` into `LspStatus` updates.
pub fn parse_work_done_progress(params: &Value) -> Option<(LspStatus, Option<String>)> {
    let value = params.get("value")?;
    let kind = value.get("kind")?.as_str()?;
    let title = value.get("title").and_then(Value::as_str);
    let message = value.get("message").and_then(Value::as_str);

    match kind {
        "begin" | "report" => {
            let detail = match (title, message) {
                (Some(t), Some(m)) => Some(format!("{t}: {m}")),
                (Some(t), None) => Some(t.to_string()),
                (None, Some(m)) => Some(m.to_string()),
                (None, None) => None,
            };
            Some((LspStatus::Indexing, detail))
        }
        "end" => Some((LspStatus::Ready, None)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::uri::path_to_file_uri;
    use serde_json::json;
    use std::io::Cursor;

    #[test]
    fn roundtrips_content_length_json_rpc_frames() {
        let msg1 = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize" });
        let msg2 = json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} });
        let mut wire = Vec::new();
        write_lsp_message(&mut wire, &msg1).unwrap();
        write_lsp_message(&mut wire, &msg2).unwrap();

        let mut cursor = Cursor::new(wire);
        assert_eq!(read_lsp_message(&mut cursor).unwrap(), Some(msg1));
        assert_eq!(read_lsp_message(&mut cursor).unwrap(), Some(msg2));
        assert_eq!(read_lsp_message(&mut cursor).unwrap(), None);
    }

    #[test]
    fn parses_publish_diagnostics_and_definition_locations() {
        let root = Path::new("/tmp/anar-demo");
        let uri = path_to_file_uri(&root.join("src/main.rs"));

        let diag_params = json!({
            "uri": uri,
            "diagnostics": [{
                "range": {
                    "start": { "line": 3, "character": 8 },
                    "end": { "line": 3, "character": 14 }
                },
                "severity": 1,
                "code": "E0425",
                "message": "cannot find value `foo` in this scope"
            }]
        });
        let diags = parse_publish_diagnostics(&diag_params, root).unwrap();

        assert_eq!(diags.relative_path, "src/main.rs");
        assert_eq!(diags.diagnostics.len(), 1);
        assert_eq!(diags.diagnostics[0].severity, DiagnosticSeverity::Error);
        let span = diags.diagnostics[0].primary_span.as_ref().unwrap();
        assert_eq!(span.line_start, 4);
        assert_eq!(span.column_start, 9);

        let def_payload = json!([{
            "targetUri": uri,
            "targetRange": {
                "start": { "line": 10, "character": 0 },
                "end": { "line": 10, "character": 12 }
            },
            "targetSelectionRange": {
                "start": { "line": 10, "character": 3 },
                "end": { "line": 10, "character": 10 }
            }
        }]);
        let defs = parse_definition_response(&def_payload, root);
        assert_eq!(
            defs,
            vec![LspLocation {
                relative_path: "src/main.rs".to_string(),
                line: 11,
                col: 4,
            }]
        );
    }

    #[test]
    fn parses_completion_hover_and_formatting() {
        let comp_payload = json!({
            "isIncomplete": false,
            "items": [{
                "label": "println!",
                "kind": 15,
                "detail": "macro_rules! println",
                "documentation": { "kind": "markdown", "value": "Prints to stdout." }
            }]
        });
        let completions = parse_completion_response(&comp_payload);
        assert_eq!(completions.len(), 1);
        assert_eq!(completions[0].label, "println!");
        assert_eq!(
            completions[0].documentation.as_deref(),
            Some("Prints to stdout.")
        );

        let hover_payload = json!({
            "contents": { "kind": "markdown", "value": "```rust\nlet x: i32\n```" }
        });
        let hover = parse_hover_response(&hover_payload).unwrap();
        assert!(hover.contents.contains("let x: i32"));

        let fmt_payload = json!([{
            "range": {
                "start": { "line": 0, "character": 0 },
                "end": { "line": 0, "character": 5 }
            },
            "newText": "fn main() {}"
        }]);
        let edits = parse_formatting_response(&fmt_payload);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].new_text, "fn main() {}");
    }
}
