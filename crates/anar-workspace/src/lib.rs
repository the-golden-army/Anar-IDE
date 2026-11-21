//! Workspace filesystem, file watching, project search, and Git operations.
//!
//! Phase 3 provides canonical workspace scoping, directory listing, file CRUD,
//! large-file metadata, and debounced external change detection.

pub mod error;
pub mod files;
pub mod path_scope;
pub mod tree;
pub mod watcher;

pub use error::{Result, WorkspaceError};
pub use files::{
    create_directory, create_file, delete_entry, read_document, rename_entry, save_document,
    DocumentContent, LineEnding, SaveResult, LARGE_FILE_THRESHOLD_BYTES, MAX_FILE_SIZE_BYTES,
};
pub use path_scope::WorkspaceScope;
pub use tree::{
    is_ignored_dir_name, is_ignored_relative_path, list_directory, open_workspace, FileEntry,
    WorkspaceInfo,
};
pub use watcher::{WorkspaceFsEvent, WorkspaceFsEventKind, WorkspaceWatcher};

use std::path::{Component, Path, PathBuf};

/// Checks lexically whether `candidate` stays within `root` without `..` escape.
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
    use std::fs;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn make_temp_workspace(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("anar-ws-{tag}-{pid}-{nanos}"));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("target/debug")).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(
            dir.join("Cargo.toml"),
            "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n",
        )
        .unwrap();
        fs::write(dir.join("src/main.rs"), "fn main() {\n    println!(\"hi\");\n}\n").unwrap();
        fs::write(dir.join("target/debug/junk"), "ignored").unwrap();
        dir
    }

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

    #[test]
    fn workspace_open_lists_entries_and_ignores_target_and_git() {
        let dir = make_temp_workspace("open");
        let scope = WorkspaceScope::open(&dir).unwrap();
        let info = open_workspace(&scope).unwrap();

        assert!(info.is_cargo_project);
        let names: Vec<&str> = info.entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"src"));
        assert!(names.contains(&"Cargo.toml"));
        assert!(!names.contains(&"target"));
        assert!(!names.contains(&".git"));

        let src_entries = list_directory(&scope, Path::new("src")).unwrap();
        assert_eq!(src_entries.len(), 1);
        assert_eq!(src_entries[0].relative_path, "src/main.rs");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn path_scope_rejects_traversal_and_external_paths() {
        let dir = make_temp_workspace("escape");
        let scope = WorkspaceScope::open(&dir).unwrap();

        assert!(matches!(
            scope.resolve_existing(Path::new("../outside.rs")),
            Err(WorkspaceError::PathEscape(_))
        ));
        assert!(matches!(
            scope.resolve_for_write(Path::new("src/../../outside.rs")),
            Err(WorkspaceError::PathEscape(_))
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_and_save_five_mb_rust_file_roundtrips_cleanly() {
        let dir = make_temp_workspace("5mb");
        let scope = WorkspaceScope::open(&dir).unwrap();

        let line = "pub fn sample_fn(x: usize) -> usize { x + 1 }\n";
        let repeat_count = (5 * 1024 * 1024) / line.len() + 1;
        let payload = line.repeat(repeat_count);
        assert!(payload.len() >= 5 * 1024 * 1024);

        let save_res = save_document(&scope, Path::new("src/huge.rs"), &payload).unwrap();
        assert!(save_res.size_bytes >= 5 * 1024 * 1024);

        let doc = read_document(&scope, Path::new("src/huge.rs")).unwrap();
        assert!(doc.is_large_file);
        assert_eq!(doc.content.len(), payload.len());
        assert_eq!(doc.relative_path, "src/huge.rs");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crud_operations_and_binary_guard_work() {
        let dir = make_temp_workspace("crud");
        let scope = WorkspaceScope::open(&dir).unwrap();

        let created = create_file(&scope, Path::new("src/lib.rs")).unwrap();
        assert_eq!(created, "src/lib.rs");

        let renamed =
            rename_entry(&scope, Path::new("src/lib.rs"), Path::new("src/mod.rs")).unwrap();
        assert_eq!(renamed, "src/mod.rs");

        delete_entry(&scope, Path::new("src/mod.rs")).unwrap();
        assert!(!dir.join("src/mod.rs").exists());

        fs::write(dir.join("blob.bin"), [0u8, 159, 146, 150]).unwrap();
        assert!(matches!(
            read_document(&scope, Path::new("blob.bin")),
            Err(WorkspaceError::BinaryOrInvalidUtf8(_))
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn watcher_detects_external_edits_and_suppresses_self_saves() {
        let dir = make_temp_workspace("watch");
        let scope = WorkspaceScope::open(&dir).unwrap();
        let events: Arc<Mutex<Vec<WorkspaceFsEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events_sink = Arc::clone(&events);

        let watcher = WorkspaceWatcher::start(scope.clone(), move |batch| {
            if let Ok(mut guard) = events_sink.lock() {
                guard.extend(batch);
            }
        })
        .unwrap();

        // Give OS watcher a moment to arm, then trigger self-save and external edit.
        std::thread::sleep(Duration::from_millis(250));
        watcher.record_self_save("Cargo.toml");
        save_document(
            &scope,
            Path::new("Cargo.toml"),
            "[package]\nname = \"demo\"\nversion = \"0.1.1\"\n",
        )
        .unwrap();

        fs::write(
            dir.join("src/main.rs"),
            "fn main() { println!(\"external\"); }\n",
        )
        .unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut saw_external = false;
        while std::time::Instant::now() < deadline {
            if let Ok(guard) = events.lock() {
                if guard.iter().any(|e| e.relative_path == "src/main.rs") {
                    saw_external = true;
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }

        assert!(saw_external, "expected watcher to report src/main.rs");
        let recorded = events.lock().unwrap();
        assert!(
            !recorded.iter().any(|e| e.relative_path == "Cargo.toml"),
            "self-saved Cargo.toml should be suppressed"
        );

        drop(watcher);
        let _ = fs::remove_dir_all(&dir);
    }
}
