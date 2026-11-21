use crate::error::Result;
use crate::path_scope::WorkspaceScope;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// Directory names excluded from default explorer listings to avoid indexing
/// massive build artifact or VCS directories.
const IGNORED_DIRS: &[&str] = &[".git", "target", "node_modules"];

/// Summary returned when opening a workspace folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub name: String,
    pub root_path: String,
    pub is_cargo_project: bool,
    pub entries: Vec<FileEntry>,
}

/// Single file or directory entry inside the workspace explorer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

/// Returns `true` if a directory name is hidden from the explorer by default.
pub fn is_ignored_dir_name(name: &str) -> bool {
    IGNORED_DIRS.contains(&name)
}

/// Returns `true` if a workspace-relative path passes through an ignored directory.
pub fn is_ignored_relative_path(rel_path: &str) -> bool {
    rel_path
        .split(['/', '\\'])
        .any(|segment| is_ignored_dir_name(segment))
}

/// Opens a workspace directory and returns its metadata and root directory listing.
pub fn open_workspace(scope: &WorkspaceScope) -> Result<WorkspaceInfo> {
    let entries = list_directory(scope, Path::new(""))?;
    let is_cargo_project = scope.root().join("Cargo.toml").is_file();
    Ok(WorkspaceInfo {
        name: scope.name(),
        root_path: scope.root().display().to_string(),
        is_cargo_project,
        entries,
    })
}

/// Lists immediate children of `rel_dir` inside `scope` (directories first, then files).
pub fn list_directory(scope: &WorkspaceScope, rel_dir: &Path) -> Result<Vec<FileEntry>> {
    let dir_path = if rel_dir.as_os_str().is_empty() {
        scope.root().to_path_buf()
    } else {
        scope.resolve_existing(rel_dir)?
    };

    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir_path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        // Resolve symlinks carefully so external symlink targets are never exposed.
        let full_path = entry.path();
        let Ok(canonical) = fs::canonicalize(&full_path) else {
            continue;
        };
        if !canonical.starts_with(scope.root()) {
            continue;
        }

        let is_dir = if file_type.is_symlink() {
            canonical.is_dir()
        } else {
            file_type.is_dir()
        };

        if is_dir && is_ignored_dir_name(&file_name) {
            continue;
        }

        let Some(relative_path) = scope.to_relative_string(&canonical) else {
            continue;
        };

        let size_bytes = if is_dir {
            0
        } else {
            fs::metadata(&canonical).map(|m| m.len()).unwrap_or(0)
        };

        entries.push(FileEntry {
            name: file_name,
            relative_path,
            is_dir,
            size_bytes,
        });
    }

    entries.sort_by(|a, b| {
        let dir_ord = b.is_dir.cmp(&a.is_dir);
        let lower_ord = a.name.to_lowercase().cmp(&b.name.to_lowercase());
        dir_ord.then(lower_ord).then_with(|| a.name.cmp(&b.name))
    });

    Ok(entries)
}
