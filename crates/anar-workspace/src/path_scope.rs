use crate::error::{Result, WorkspaceError};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Canonicalized workspace root enforcing strict path containment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceScope {
    root: PathBuf,
}

impl WorkspaceScope {
    /// Opens and canonicalizes `root_dir`, ensuring it is an existing directory.
    pub fn open(root_dir: &Path) -> Result<Self> {
        let canonical = fs::canonicalize(root_dir).map_err(|err| {
            WorkspaceError::NotFound(format!(
                "cannot open workspace '{}': {err}",
                root_dir.display()
            ))
        })?;
        if !canonical.is_dir() {
            return Err(WorkspaceError::NotDirectory(format!(
                "workspace path '{}' is not a directory",
                canonical.display()
            )));
        }
        Ok(Self { root: canonical })
    }

    /// Returns the canonical workspace root path.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Returns the display name of the workspace root folder.
    pub fn name(&self) -> String {
        self.root
            .file_name()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| self.root.display().to_string())
    }

    /// Resolves an existing path inside the workspace, blocking `..` and symlink escapes.
    pub fn resolve_existing(&self, rel_or_abs: &Path) -> Result<PathBuf> {
        let candidate = self.normalize_candidate(rel_or_abs)?;
        let canonical = fs::canonicalize(&candidate).map_err(|err| {
            WorkspaceError::NotFound(format!(
                "path '{}' does not exist: {err}",
                rel_or_abs.display()
            ))
        })?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::PathEscape(format!(
                "path '{}' escapes the workspace root",
                rel_or_abs.display()
            )));
        }
        Ok(canonical)
    }

    /// Resolves a path for creating or overwriting a file/directory inside the workspace.
    pub fn resolve_for_write(&self, rel_or_abs: &Path) -> Result<PathBuf> {
        if rel_or_abs.as_os_str().is_empty() {
            return Err(WorkspaceError::PathEscape(
                "cannot write to empty path".to_string(),
            ));
        }

        let candidate = self.normalize_candidate(rel_or_abs)?;
        if candidate.exists() {
            return self.resolve_existing(rel_or_abs);
        }

        // Walk upward to the nearest existing ancestor and verify it stays inside `root`.
        let mut ancestor = candidate.as_path();
        let mut suffix_parts = Vec::new();
        while !ancestor.exists() {
            let Some(name) = ancestor.file_name() else {
                return Err(WorkspaceError::PathEscape(format!(
                    "path '{}' has no valid ancestor inside workspace",
                    rel_or_abs.display()
                )));
            };
            suffix_parts.push(name.to_os_string());
            ancestor = ancestor.parent().ok_or_else(|| {
                WorkspaceError::PathEscape(format!(
                    "path '{}' escapes the workspace root",
                    rel_or_abs.display()
                ))
            })?;
        }

        let canonical_ancestor = fs::canonicalize(ancestor)?;
        if !canonical_ancestor.starts_with(&self.root) {
            return Err(WorkspaceError::PathEscape(format!(
                "path '{}' escapes the workspace root",
                rel_or_abs.display()
            )));
        }

        let mut resolved = canonical_ancestor;
        for part in suffix_parts.into_iter().rev() {
            resolved.push(part);
        }
        Ok(resolved)
    }

    /// Converts an in-workspace path to a normalized forward-slash relative path.
    pub fn to_relative_string(&self, path: &Path) -> Option<String> {
        let rel = path.strip_prefix(&self.root).ok()?;
        let parts: Vec<String> = rel
            .components()
            .filter_map(|comp| match comp {
                Component::Normal(os) => Some(os.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect();
        Some(parts.join("/"))
    }

    fn normalize_candidate(&self, rel_or_abs: &Path) -> Result<PathBuf> {
        if rel_or_abs.is_absolute() {
            if !rel_or_abs.starts_with(&self.root) {
                return Err(WorkspaceError::PathEscape(format!(
                    "absolute path '{}' is outside workspace",
                    rel_or_abs.display()
                )));
            }
            let rel = rel_or_abs
                .strip_prefix(&self.root)
                .map_err(|_| WorkspaceError::PathEscape("path outside workspace".to_string()))?;
            return self.join_checked_relative(rel);
        }
        self.join_checked_relative(rel_or_abs)
    }

    fn join_checked_relative(&self, rel: &Path) -> Result<PathBuf> {
        let mut depth: i32 = 0;
        let mut out = self.root.clone();
        for component in rel.components() {
            match component {
                Component::CurDir => {}
                Component::Normal(part) => {
                    depth += 1;
                    out.push(part);
                }
                Component::ParentDir => {
                    depth -= 1;
                    if depth < 0 {
                        return Err(WorkspaceError::PathEscape(format!(
                            "relative path '{}' traverses above workspace root",
                            rel.display()
                        )));
                    }
                    out.pop();
                }
                Component::RootDir | Component::Prefix(_) => {
                    return Err(WorkspaceError::PathEscape(format!(
                        "unexpected root component in '{}'",
                        rel.display()
                    )));
                }
            }
        }
        Ok(out)
    }
}
