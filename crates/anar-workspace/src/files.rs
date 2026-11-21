use crate::error::{Result, WorkspaceError};
use crate::path_scope::WorkspaceScope;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Files at or above 1 MiB enable large-file editor optimizations.
pub const LARGE_FILE_THRESHOLD_BYTES: u64 = 1_048_576;
/// Hard safety cap (50 MiB) to prevent OOM when reading accidental giant artifacts.
pub const MAX_FILE_SIZE_BYTES: u64 = 50 * 1024 * 1024;

/// Detected line ending style of a text document.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    #[default]
    Lf,
    Crlf,
}

/// UTF-8 document payload returned to the desktop frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub relative_path: String,
    pub name: String,
    pub content: String,
    pub size_bytes: u64,
    pub modified_ms: Option<u64>,
    pub line_ending: LineEnding,
    pub is_large_file: bool,
}

/// Metadata returned after saving a document atomically.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub relative_path: String,
    pub size_bytes: u64,
    pub modified_ms: Option<u64>,
}

fn modified_millis(meta: &fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn detect_line_ending(text: &str) -> LineEnding {
    if text.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    }
}

/// Reads a UTF-8 file inside `scope` while enforcing size and binary guards.
pub fn read_document(scope: &WorkspaceScope, rel_path: &Path) -> Result<DocumentContent> {
    let resolved = scope.resolve_existing(rel_path)?;
    let meta = fs::metadata(&resolved)?;
    if !meta.is_file() {
        return Err(WorkspaceError::NotFile(format!(
            "'{}' is not a regular file",
            rel_path.display()
        )));
    }

    let size_bytes = meta.len();
    if size_bytes > MAX_FILE_SIZE_BYTES {
        return Err(WorkspaceError::TooLarge(format!(
            "file '{}' is {} bytes, exceeding the {} byte editor limit",
            rel_path.display(),
            size_bytes,
            MAX_FILE_SIZE_BYTES
        )));
    }

    let bytes = fs::read(&resolved)?;
    if bytes.contains(&0) {
        return Err(WorkspaceError::BinaryOrInvalidUtf8(format!(
            "file '{}' appears to be binary",
            rel_path.display()
        )));
    }

    let content = String::from_utf8(bytes).map_err(|_| {
        WorkspaceError::BinaryOrInvalidUtf8(format!(
            "file '{}' is not valid UTF-8 text",
            rel_path.display()
        ))
    })?;

    let relative_path = scope
        .to_relative_string(&resolved)
        .unwrap_or_else(|| rel_path.to_string_lossy().into_owned());
    let name = resolved
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&relative_path)
        .to_string();

    Ok(DocumentContent {
        relative_path,
        name,
        line_ending: detect_line_ending(&content),
        is_large_file: size_bytes >= LARGE_FILE_THRESHOLD_BYTES,
        content,
        size_bytes,
        modified_ms: modified_millis(&meta),
    })
}

/// Atomically writes `content` to `rel_path` inside `scope`.
pub fn save_document(
    scope: &WorkspaceScope,
    rel_path: &Path,
    content: &str,
) -> Result<SaveResult> {
    let resolved = scope.resolve_for_write(rel_path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)?;
    }

    let file_name = resolved
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let tmp_name = format!(".{file_name}.anar-tmp-{}", std::process::id());
    let tmp_path = resolved.with_file_name(tmp_name);

    fs::write(&tmp_path, content.as_bytes())?;
    if let Err(rename_err) = fs::rename(&tmp_path, &resolved) {
        if fs::write(&resolved, content.as_bytes()).is_err() {
            let _ = fs::remove_file(&tmp_path);
            return Err(WorkspaceError::Io(format!(
                "failed to save '{}': {rename_err}",
                rel_path.display()
            )));
        }
        let _ = fs::remove_file(&tmp_path);
    }

    let meta = fs::metadata(&resolved)?;
    let relative_path = scope
        .to_relative_string(&resolved)
        .unwrap_or_else(|| rel_path.to_string_lossy().into_owned());

    Ok(SaveResult {
        relative_path,
        size_bytes: meta.len(),
        modified_ms: modified_millis(&meta),
    })
}

/// Creates a new empty file inside `scope`, failing if it already exists.
pub fn create_file(scope: &WorkspaceScope, rel_path: &Path) -> Result<String> {
    let resolved = scope.resolve_for_write(rel_path)?;
    if resolved.exists() {
        return Err(WorkspaceError::AlreadyExists(format!(
            "'{}' already exists",
            rel_path.display()
        )));
    }
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&resolved)?;
    Ok(scope
        .to_relative_string(&resolved)
        .unwrap_or_else(|| rel_path.to_string_lossy().into_owned()))
}

/// Creates a new directory (and parents if needed) inside `scope`.
pub fn create_directory(scope: &WorkspaceScope, rel_path: &Path) -> Result<String> {
    let resolved = scope.resolve_for_write(rel_path)?;
    if resolved.exists() {
        return Err(WorkspaceError::AlreadyExists(format!(
            "'{}' already exists",
            rel_path.display()
        )));
    }
    fs::create_dir_all(&resolved)?;
    Ok(scope
        .to_relative_string(&resolved)
        .unwrap_or_else(|| rel_path.to_string_lossy().into_owned()))
}

/// Renames or moves a file/directory within `scope`.
pub fn rename_entry(scope: &WorkspaceScope, from: &Path, to: &Path) -> Result<String> {
    let src = scope.resolve_existing(from)?;
    let dst = scope.resolve_for_write(to)?;
    if dst.exists() {
        return Err(WorkspaceError::AlreadyExists(format!(
            "'{}' already exists",
            to.display()
        )));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&src, &dst)?;
    Ok(scope
        .to_relative_string(&dst)
        .unwrap_or_else(|| to.to_string_lossy().into_owned()))
}

/// Deletes a file or directory inside `scope` (never allowing deletion of the root itself).
pub fn delete_entry(scope: &WorkspaceScope, rel_path: &Path) -> Result<()> {
    let resolved = scope.resolve_existing(rel_path)?;
    if resolved == scope.root() {
        return Err(WorkspaceError::PathEscape(
            "cannot delete workspace root directory".to_string(),
        ));
    }
    if resolved.is_dir() {
        fs::remove_dir_all(&resolved)?;
    } else {
        fs::remove_file(&resolved)?;
    }
    Ok(())
}
