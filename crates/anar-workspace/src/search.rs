use crate::error::Result;
use crate::path_scope::WorkspaceScope;
use crate::tree::is_ignored_dir_name;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_SEARCHABLE_FILE_BYTES: u64 = 2 * 1024 * 1024;
const DEFAULT_MAX_MATCHES: usize = 200;

/// Single line hit returned by [`search_workspace_text`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u32,
    pub col: u32,
    pub line_text: String,
    pub match_start: usize,
    pub match_end: usize,
}

/// Grouped matches within one workspace file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileMatches {
    pub relative_path: String,
    pub matches: Vec<SearchMatch>,
}

/// Complete response from a workspace text search.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResult {
    pub query: String,
    pub files: Vec<SearchFileMatches>,
    pub total_matches: usize,
    pub truncated: bool,
}

/// Searches all non-ignored UTF-8 text files inside `scope` for `query`.
pub fn search_workspace_text(
    scope: &WorkspaceScope,
    query: &str,
    case_sensitive: bool,
    max_matches: Option<usize>,
) -> Result<WorkspaceSearchResult> {
    if query.is_empty() {
        return Ok(WorkspaceSearchResult {
            query: String::new(),
            files: Vec::new(),
            total_matches: 0,
            truncated: false,
        });
    }

    let limit = max_matches.unwrap_or(DEFAULT_MAX_MATCHES).clamp(1, 2000);
    let mut files_to_scan = Vec::new();
    collect_workspace_files(scope, scope.root(), &mut files_to_scan);
    files_to_scan.sort();

    let needle_lower = query.to_lowercase();
    let needle_ascii = query.to_ascii_lowercase();
    let mut file_groups = Vec::new();
    let mut total_matches = 0usize;
    let mut truncated = false;

    for rel_path in files_to_scan {
        if total_matches >= limit {
            truncated = true;
            break;
        }
        let full_path = scope.root().join(&rel_path);
        let Ok(meta) = fs::metadata(&full_path) else {
            continue;
        };
        if meta.len() > MAX_SEARCHABLE_FILE_BYTES {
            continue;
        }
        let Ok(bytes) = fs::read(&full_path) else {
            continue;
        };
        if bytes.contains(&0) {
            continue;
        }
        let Ok(text) = String::from_utf8(bytes) else {
            continue;
        };

        let mut matches = Vec::new();
        for (idx, raw_line) in text.lines().enumerate() {
            if total_matches >= limit {
                truncated = true;
                break;
            }
            let line_num = u32::try_from(idx + 1).unwrap_or(u32::MAX);
            if let Some((start, end, col)) = find_line_match(
                raw_line,
                query,
                &needle_lower,
                &needle_ascii,
                case_sensitive,
            ) {
                matches.push(SearchMatch {
                    line: line_num,
                    col,
                    line_text: truncate_preview(raw_line, 240),
                    match_start: start,
                    match_end: end,
                });
                total_matches += 1;
            }
        }

        if !matches.is_empty() {
            file_groups.push(SearchFileMatches {
                relative_path: rel_path,
                matches,
            });
        }
    }

    Ok(WorkspaceSearchResult {
        query: query.to_string(),
        files: file_groups,
        total_matches,
        truncated,
    })
}

/// Finds workspace-relative file paths matching a fuzzy or substring `query`.
pub fn find_workspace_files(
    scope: &WorkspaceScope,
    query: &str,
    max_results: Option<usize>,
) -> Result<Vec<String>> {
    let limit = max_results.unwrap_or(50).clamp(1, 500);
    let mut all_files = Vec::new();
    collect_workspace_files(scope, scope.root(), &mut all_files);
    all_files.sort();

    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        all_files.truncate(limit);
        return Ok(all_files);
    }

    let mut scored: Vec<(usize, String)> = all_files
        .into_iter()
        .filter_map(|path| fuzzy_score(&path, &needle).map(|score| (score, path)))
        .collect();
    scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    scored.truncate(limit);
    Ok(scored.into_iter().map(|(_, p)| p).collect())
}

fn collect_workspace_files(scope: &WorkspaceScope, dir: &Path, out: &mut Vec<String>) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<PathBuf> = read_dir.flatten().map(|e| e.path()).collect();
    entries.sort();

    for entry_path in entries {
        let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Ok(canonical) = fs::canonicalize(&entry_path) else {
            continue;
        };
        if !canonical.starts_with(scope.root()) {
            continue;
        }
        if canonical.is_dir() {
            if is_ignored_dir_name(name) {
                continue;
            }
            collect_workspace_files(scope, &canonical, out);
        } else if canonical.is_file() {
            if let Some(rel) = scope.to_relative_string(&canonical) {
                out.push(rel);
            }
        }
    }
}

fn find_line_match(
    line: &str,
    query: &str,
    needle_lower: &str,
    needle_ascii: &str,
    case_sensitive: bool,
) -> Option<(usize, usize, u32)> {
    if case_sensitive {
        let byte_idx = line.find(query)?;
        let col = u32::try_from(line[..byte_idx].chars().count() + 1).unwrap_or(1);
        let char_start = line[..byte_idx].chars().count();
        let char_end = char_start + query.chars().count();
        return Some((char_start, char_end, col));
    }

    if line.is_ascii() && needle_ascii.is_ascii() {
        let lower = line.to_ascii_lowercase();
        let byte_idx = lower.find(needle_ascii)?;
        let col = u32::try_from(byte_idx + 1).unwrap_or(1);
        return Some((byte_idx, byte_idx + needle_ascii.len(), col));
    }

    if line.to_lowercase().contains(needle_lower) {
        return Some((0, 0, 1));
    }
    None
}

fn truncate_preview(line: &str, max_chars: usize) -> String {
    let count = line.chars().count();
    if count <= max_chars {
        return line.to_string();
    }
    let mut out: String = line.chars().take(max_chars).collect();
    out.push('…');
    out
}

fn fuzzy_score(path: &str, needle: &str) -> Option<usize> {
    let lower = path.to_lowercase();
    if let Some(pos) = lower.find(needle) {
        return Some(pos);
    }
    let mut needle_chars = needle.chars();
    let mut current = needle_chars.next()?;
    let mut gap_penalty = 100usize;
    for ch in lower.chars() {
        if ch == current {
            if let Some(next) = needle_chars.next() {
                current = next;
            } else {
                return Some(gap_penalty);
            }
        } else {
            gap_penalty += 1;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_search_workspace() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-search-{}-{nanos}", std::process::id());
        let dir = std::env::temp_dir().join(dir_name);
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("target/debug")).unwrap();
        let main_rs = "fn main() {\n    let Greeting = \"Hello Anar\";\n}\n";
        fs::write(dir.join("src/main.rs"), main_rs).unwrap();
        fs::write(dir.join("src/lib.rs"), "pub fn helper() {}\n").unwrap();
        fs::write(dir.join("target/debug/out.txt"), "Hello ignored\n").unwrap();
        dir
    }

    #[test]
    fn text_search_respects_case_and_ignores_target() {
        let dir = make_search_workspace();
        let scope = WorkspaceScope::open(&dir).unwrap();

        let insensitive = search_workspace_text(&scope, "greeting", false, None).unwrap();
        assert_eq!(insensitive.total_matches, 1);
        assert_eq!(insensitive.files[0].relative_path, "src/main.rs");
        assert_eq!(insensitive.files[0].matches[0].line, 2);

        let sensitive = search_workspace_text(&scope, "greeting", true, None).unwrap();
        assert_eq!(sensitive.total_matches, 0);

        let ignored = search_workspace_text(&scope, "ignored", false, None).unwrap();
        assert_eq!(ignored.total_matches, 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_search_ranks_substring_and_fuzzy_matches() {
        let dir = make_search_workspace();
        let scope = WorkspaceScope::open(&dir).unwrap();

        let exact = find_workspace_files(&scope, "main", None).unwrap();
        assert_eq!(exact, vec!["src/main.rs"]);

        let fuzzy = find_workspace_files(&scope, "slr", None).unwrap();
        assert!(fuzzy.contains(&String::from("src/lib.rs")));

        let _ = fs::remove_dir_all(&dir);
    }
}
