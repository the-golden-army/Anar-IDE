//! Workspace filesystem, file watching, project search, and Git operations.
//!
//! Full directory tree browsing, file I/O, and external change detection are
//! scheduled for Phase 3; search and Git integration are scheduled for Phase 8.

use std::path::{Component, Path, PathBuf};

/// Checks lexically whether `candidate` stays within `root` without `..` escape.
///
/// Phase 3 will pair this with canonicalized path checks on real filesystem entries.
pub fn is_lexically_within(root: &Path, candidate: &Path) -> bool {
    let mut depth: i32 = 0;
    let rel = match candidate.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => candidate,
    };
    if candidate.is_absolute() && candidate.strip_prefix(root).is_err() {
        return false;
    }
    for component in rel.components() {
        match component {
            Component::ParentDir => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            Component::Normal(_) => depth += 1,
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => return false,
        }
    }
    true
}

/// Joins a relative path onto `root` only if it does not escape `root`.
pub fn scoped_join(root: &Path, relative: &Path) -> Option<PathBuf> {
    if relative.is_absolute() || !is_lexically_within(root, relative) {
        return None;
    }
    Some(root.join(relative))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scoped_join_blocks_parent_traversal() {
        let root = Path::new("/workspace/anar");
        assert_eq!(
            scoped_join(root, Path::new("src/main.rs")),
            Some(PathBuf::from("/workspace/anar/src/main.rs"))
        );
        assert_eq!(scoped_join(root, Path::new("../secret.txt")), None);
        assert_eq!(scoped_join(root, Path::new("/etc/passwd")), None);
    }
}
