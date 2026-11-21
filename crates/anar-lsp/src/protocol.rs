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
    let body = serde_json::to_vec(payload)
        .map_err(|err| format!("failed to serialize LSP message: {err}"))?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    writer
        .write_all(header.as_bytes())
        .and_then(|()| writer.write_all(&body))
        .and_then(|()| writer.flush())
        .map_err(|err| format!("failed to write LSP message: {err}"))
}

/// Reads one `Content-Length` framed JSON-RPC 2.0 message, returning `None` at clean EOF.
pub fn read_lsp_message<R: BufRead>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut content_length: Option<usize> = None;
    let mut line = String::new();

    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|err| format!("failed to read LSP header: {err}"))?;
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
                let len = value
                    .trim()
                    .parse::<usize>()
                    .map_err(|err| format!("invalid Content-Length header: {err}"))?;
                content_length = Some(len);
            }
        }
    }

    let length =
        content_length.ok_or_else(|| "missing Content-Length header in LSP frame".to_string())?;
    let mut body = vec![0u8; length];
    reader
        .read_exact(&mut body)
        .map_err(|err| format!("failed to read LSP payload ({length} bytes): {err}"))?;

    let value: Value = serde_json::from_slice(&body)
        .map_err(|err| format!("invalid JSON in LSP payload: {err}"))?;
    Ok(Some(value))
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
            c.as_str()
                .map(ToString::to_string)
                .or_else(|| c.as_i64().map(|n| n.to_string()))
        });
        let primary_span = item
            .get("range")
            .and_then(|r| serde_json::from_value::<LspRange>(r.clone()).ok())
            .map(|range| DiagnosticSpan {
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
                return Some(s.to_string());
            }
            doc.get("value")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        });
        out.push(LspCompletionItem {
            label: label.to_string(),
            detail: item
                .get("detail")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            documentation,
            kind: item
                .get("kind")
                .and_then(Value::as_u64)
                .and_then(|k| u32::try_from(k).ok()),
            insert_text: item
                .get("insertText")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            sort_text: item
                .get("sortText")
                .and_then(Value::as_str)
                .map(ToString::to_string),
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
    let range = result
        .get("range")
        .and_then(|r| serde_json::from_value::<LspRange>(r.clone()).ok());
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
        let parts: Vec<String> = arr
            .iter()
            .map(extract_hover_contents)
            .filter(|part| !part.trim().is_empty())
            .collect();
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
            entry
                .get("targetSelectionRange")
                .or_else(|| entry.get("targetRange"))
                .map(|r| (uri, r))
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
    arr.iter()
        .filter_map(|v| serde_json::from_value::<LspTextEdit>(v.clone()).ok())
        .collect()
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

        let diags = parse_publish_diagnostics(
            &json!({
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
            }),
            root,
        )
        .unwrap();

        assert_eq!(diags.relative_path, "src/main.rs");
        assert_eq!(diags.diagnostics.len(), 1);
        assert_eq!(diags.diagnostics[0].severity, DiagnosticSeverity::Error);
        assert_eq!(
            diags.diagnostics[0].primary_span.as_ref().unwrap().line_start,
            4
        );
        assert_eq!(
            diags.diagnostics[0].primary_span.as_ref().unwrap().column_start,
            9
        );

        let defs = parse_definition_response(
            &json!([{
                "targetUri": uri,
                "targetRange": {
                    "start": { "line": 10, "character": 0 },
                    "end": { "line": 10, "character": 12 }
                },
                "targetSelectionRange": {
                    "start": { "line": 10, "character": 3 },
                    "end": { "line": 10, "character": 10 }
                }
            }]),
            root,
        );
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
        let completions = parse_completion_response(&json!({
            "isIncomplete": false,
            "items": [{
                "label": "println!",
                "kind": 15,
                "detail": "macro_rules! println",
                "documentation": { "kind": "markdown", "value": "Prints to stdout." }
            }]
        }));
        assert_eq!(completions.len(), 1);
        assert_eq!(completions[0].label, "println!");
        assert_eq!(
            completions[0].documentation.as_deref(),
            Some("Prints to stdout.")
        );

        let hover = parse_hover_response(&json!({
            "contents": { "kind": "markdown", "value": "```rust\nlet x: i32\n```" }
        }))
        .unwrap();
        assert!(hover.contents.contains("let x: i32"));

        let edits = parse_formatting_response(&json!([{
            "range": {
                "start": { "line": 0, "character": 0 },
                "end": { "line": 0, "character": 5 }
            },
            "newText": "fn main() {}"
        }]));
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].new_text, "fn main() {}");
    }
}
