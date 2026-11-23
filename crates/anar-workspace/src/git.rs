use crate::error::{Result, WorkspaceError};
use crate::is_lexically_within;
use crate::path_scope::WorkspaceScope;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Single changed or untracked entry reported by `git status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub relative_path: String,
    pub index_status: String,
    pub worktree_status: String,
    pub staged: bool,
    pub untracked: bool,
}

/// Summary of the workspace Git repository status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusReport {
    pub git_available: bool,
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub entries: Vec<GitChangedFile>,
    pub error: Option<String>,
}

/// Unified diff output for a single file in the workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub relative_path: String,
    pub staged: bool,
    pub diff: String,
}

fn validate_rel_path(scope: &WorkspaceScope, rel_path: &str) -> Result<String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        let msg = String::from("relative path cannot be empty");
        return Err(WorkspaceError::Io(msg));
    }
    let path = Path::new(trimmed);
    if path.is_absolute() || !is_lexically_within(scope.root(), path) {
        return Err(WorkspaceError::PathEscape(trimmed.to_string()));
    }
    Ok(trimmed.to_string())
}

/// Queries `git status --porcelain=v1 -b -uall` inside `scope`.
pub fn git_status(scope: &WorkspaceScope) -> GitStatusReport {
    let mut cmd = Command::new("git");
    anar_core::configure_background_command(&mut cmd);
    let output = match cmd
        .args(["status", "--porcelain=v1", "-b", "-uall"])
        .current_dir(scope.root())
        .output()
    {
        Ok(out) => out,
        Err(err) => {
            return GitStatusReport {
                git_available: false,
                is_git_repo: false,
                branch: None,
                ahead: 0,
                behind: 0,
                entries: Vec::new(),
                error: Some(format!("git unavailable: {err}")),
            };
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        let not_repo = msg.contains("not a git repository");
        return GitStatusReport {
            git_available: true,
            is_git_repo: false,
            branch: None,
            ahead: 0,
            behind: 0,
            entries: Vec::new(),
            error: if not_repo || msg.is_empty() {
                None
            } else {
                Some(msg.to_string())
            },
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_git_porcelain_v1(&stdout)
}

/// Parses `git status --porcelain=v1 -b` output into a [`GitStatusReport`].
pub fn parse_git_porcelain_v1(raw: &str) -> GitStatusReport {
    let mut branch: Option<String> = None;
    let mut ahead: u32 = 0;
    let mut behind: u32 = 0;
    let mut entries = Vec::new();

    for line in raw.lines() {
        if let Some(header) = line.strip_prefix("## ") {
            let (parsed_branch, a, b) = parse_branch_header(header);
            branch = parsed_branch;
            ahead = a;
            behind = b;
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        let mut chars = line.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        if chars.next() != Some(' ') {
            continue;
        }
        let path_part = &line[3..];
        let rel = if let Some((_, renamed_to)) = path_part.split_once(" -> ") {
            renamed_to
        } else {
            path_part
        };
        let clean_path = rel.trim().trim_matches('"').replace('\\', "/");
        if clean_path.is_empty() {
            continue;
        }

        let untracked = x == '?' && y == '?';
        if x != ' ' && x != '?' {
            entries.push(GitChangedFile {
                relative_path: clean_path.clone(),
                index_status: x.to_string(),
                worktree_status: y.to_string(),
                staged: true,
                untracked: false,
            });
        }
        if y != ' ' || untracked {
            entries.push(GitChangedFile {
                relative_path: clean_path,
                index_status: x.to_string(),
                worktree_status: y.to_string(),
                staged: false,
                untracked,
            });
        }
    }

    GitStatusReport {
        git_available: true,
        is_git_repo: true,
        branch,
        ahead,
        behind,
        entries,
        error: None,
    }
}

fn parse_branch_header(header: &str) -> (Option<String>, u32, u32) {
    let trimmed = header.trim();
    if let Some(rest) = trimmed.strip_prefix("No commits yet on ") {
        return (Some(rest.trim().to_string()), 0, 0);
    }
    if let Some(rest) = trimmed.strip_prefix("Initial commit on ") {
        return (Some(rest.trim().to_string()), 0, 0);
    }
    if trimmed.starts_with("HEAD (no branch)") {
        return (Some(String::from("HEAD (detached)")), 0, 0);
    }

    let mut ahead = 0u32;
    let mut behind = 0u32;
    let main_part = if let Some((left, bracket)) = trimmed.split_once(" [") {
        let info = bracket.trim_end_matches(']');
        for segment in info.split(',') {
            let seg = segment.trim();
            if let Some(n) = seg.strip_prefix("ahead ") {
                ahead = n.trim().parse().unwrap_or(0);
            } else if let Some(n) = seg.strip_prefix("behind ") {
                behind = n.trim().parse().unwrap_or(0);
            }
        }
        left
    } else {
        trimmed
    };

    let branch_name = main_part
        .split("...")
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    (branch_name, ahead, behind)
}

/// Returns the unified diff for `rel_path` (or synthetic preview if untracked).
pub fn git_diff(scope: &WorkspaceScope, rel_path: &str, staged: bool) -> Result<GitDiffResult> {
    let clean = validate_rel_path(scope, rel_path)?;
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&clean);

    let mut cmd = Command::new("git");
    anar_core::configure_background_command(&mut cmd);
    let output = cmd
        .args(&args)
        .current_dir(scope.root())
        .output()
        .map_err(|e| WorkspaceError::Io(format!("failed to invoke git diff: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("git diff failed: {}", stderr.trim());
        return Err(WorkspaceError::Io(msg));
    }

    let mut diff = String::from_utf8_lossy(&output.stdout).into_owned();
    if diff.trim().is_empty() && !staged {
        if let Ok(resolved) = scope.resolve_existing(Path::new(&clean)) {
            if let Ok(bytes) = fs::read(&resolved) {
                if !bytes.contains(&0) {
                    if let Ok(text) = String::from_utf8(bytes) {
                        let lines: Vec<String> =
                            text.lines().take(500).map(|l| format!("+{l}")).collect();
                        if !lines.is_empty() {
                            let count = lines.len();
                            diff = format!(
                                "--- /dev/null\n+++ b/{clean}\n@@ -0,0 +1,{count} @@\n{}",
                                lines.join("\n")
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(GitDiffResult {
        relative_path: clean,
        staged,
        diff,
    })
}

/// Stages a single file inside the workspace via `git add -- <rel_path>`.
pub fn git_stage_file(scope: &WorkspaceScope, rel_path: &str) -> Result<GitStatusReport> {
    let clean = validate_rel_path(scope, rel_path)?;
    let mut cmd = Command::new("git");
    anar_core::configure_background_command(&mut cmd);
    let output = cmd
        .args(["add", "--", &clean])
        .current_dir(scope.root())
        .output()
        .map_err(|e| WorkspaceError::Io(format!("failed to invoke git add: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("git add failed: {}", stderr.trim());
        return Err(WorkspaceError::Io(msg));
    }
    Ok(git_status(scope))
}

/// Unstages a single file inside the workspace via `git reset HEAD -- <rel_path>`.
pub fn git_unstage_file(scope: &WorkspaceScope, rel_path: &str) -> Result<GitStatusReport> {
    let clean = validate_rel_path(scope, rel_path)?;
    let mut cmd = Command::new("git");
    anar_core::configure_background_command(&mut cmd);
    let output = cmd
        .args(["reset", "HEAD", "--", &clean])
        .current_dir(scope.root())
        .output()
        .map_err(|e| WorkspaceError::Io(format!("failed to invoke git reset: {e}")))?;

    if !output.status.success() {
        // Fallback for unborn HEAD repositories (`git rm --cached`).
        let mut fallback_cmd = Command::new("git");
        anar_core::configure_background_command(&mut fallback_cmd);
        let fallback = fallback_cmd
            .args(["rm", "--cached", "--", &clean])
            .current_dir(scope.root())
            .output()
            .map_err(|e| WorkspaceError::Io(format!("git unstage failed: {e}")))?;
        if !fallback.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let msg = format!("git unstage failed: {}", stderr.trim());
            return Err(WorkspaceError::Io(msg));
        }
    }
    Ok(git_status(scope))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_porcelain_branch_ahead_behind_and_entries() {
        let raw = concat!(
            "## main...origin/main [ahead 2, behind 1]\n",
            " M src/main.rs\n",
            "A  src/new.rs\n",
            "MM Cargo.toml\n",
            "?? notes.txt\n",
        );
        let report = parse_git_porcelain_v1(raw);
        assert!(report.is_git_repo);
        assert_eq!(report.branch.as_deref(), Some("main"));
        assert_eq!(report.ahead, 2);
        assert_eq!(report.behind, 1);
        assert_eq!(report.entries.len(), 5);
        assert!(report
            .entries
            .iter()
            .any(|e| e.relative_path == "src/new.rs" && e.staged));
        assert!(report
            .entries
            .iter()
            .any(|e| e.relative_path == "notes.txt" && e.untracked));
    }

    #[test]
    fn git_status_diff_stage_and_unstage_work_in_temp_repo() {
        if Command::new("git").arg("--version").output().is_err() {
            return;
        }
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-git-{}-{nanos}", std::process::id());
        let dir: PathBuf = std::env::temp_dir().join(dir_name);
        fs::create_dir_all(dir.join("src")).unwrap();

        let run_git = |args: &[&str]| {
            let status = Command::new("git")
                .args(args)
                .current_dir(&dir)
                .status()
                .expect("run git");
            assert!(status.success(), "git {args:?} failed");
        };

        run_git(&["init", "-b", "main"]);
        run_git(&["config", "user.name", "Anar Test"]);
        run_git(&["config", "user.email", "anar@example.com"]);
        fs::write(dir.join("Cargo.toml"), "[package]\nname = \"demo\"\n").unwrap();
        run_git(&["add", "Cargo.toml"]);
        run_git(&["commit", "-m", "init"]);

        fs::write(dir.join("Cargo.toml"), "[package]\nname = \"demo2\"\n").unwrap();
        fs::write(dir.join("src/extra.rs"), "pub fn x() {}\n").unwrap();

        let scope = WorkspaceScope::open(&dir).unwrap();
        let status = git_status(&scope);
        assert!(status.is_git_repo);
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert!(status
            .entries
            .iter()
            .any(|e| e.relative_path == "Cargo.toml" && !e.staged));
        assert!(status
            .entries
            .iter()
            .any(|e| e.relative_path == "src/extra.rs" && e.untracked));

        let unstaged_diff = git_diff(&scope, "Cargo.toml", false).unwrap();
        assert!(unstaged_diff.diff.contains("-name = \"demo\""));
        assert!(unstaged_diff.diff.contains("+name = \"demo2\""));

        let untracked_diff = git_diff(&scope, "src/extra.rs", false).unwrap();
        assert!(untracked_diff.diff.contains("+pub fn x() {}"));

        let staged_status = git_stage_file(&scope, "Cargo.toml").unwrap();
        assert!(staged_status
            .entries
            .iter()
            .any(|e| e.relative_path == "Cargo.toml" && e.staged));

        let staged_diff = git_diff(&scope, "Cargo.toml", true).unwrap();
        assert!(staged_diff.diff.contains("+name = \"demo2\""));

        let unstaged_again = git_unstage_file(&scope, "Cargo.toml").unwrap();
        assert!(unstaged_again
            .entries
            .iter()
            .any(|e| e.relative_path == "Cargo.toml" && !e.staged));

        let _ = fs::remove_dir_all(&dir);
    }
}
