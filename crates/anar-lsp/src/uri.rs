//! Cross-platform `file://` URI <-> workspace-relative path conversions.

use std::path::{Component, Path, PathBuf};

/// Converts an absolute filesystem path into a RFC 8089 `file://` URI.
pub fn path_to_file_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let normalized = if raw.starts_with('/') {
        raw
    } else {
        // Windows drive letter path such as `C:/workspace/src/main.rs`.
        format!("/{raw}")
    };

    let mut encoded = String::from("file://");
    for byte in normalized.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'.'
            | b'_'
            | b'~'
            | b'/'
            | b':' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

/// Parses a `file://` URI into a local `PathBuf`, returning `None` for non-file URIs.
pub fn file_uri_to_path(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix("file://")?;
    let path_part = if let Some(stripped) = rest.strip_prefix("localhost/") {
        format!("/{stripped}")
    } else if rest.starts_with('/') {
        rest.to_string()
    } else {
        // UNC-style host or bare path.
        format!("/{rest}")
    };

    let decoded = percent_decode(&path_part)?;

    // On Windows URIs look like `/C:/Users/...`; strip the leading `/` before a drive letter.
    let clean = strip_windows_leading_slash(&decoded);
    Some(PathBuf::from(clean))
}

/// Converts a `file://` URI into a `/` -separated workspace-relative path when inside `root`.
pub fn uri_to_relative_path(uri: &str, workspace_root: &Path) -> Option<String> {
    let path = file_uri_to_path(uri)?;
    strip_workspace_prefix(&path, workspace_root)
}

fn strip_windows_leading_slash(raw: &str) -> &str {
    let b = raw.as_bytes();
    if b.len() >= 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' {
        &raw[1..]
    } else {
        raw
    }
}

fn strip_workspace_prefix(path: &Path, workspace_root: &Path) -> Option<String> {
    let path_norm = normalize_slashes(&path.to_string_lossy());
    let root_norm = normalize_slashes(&workspace_root.to_string_lossy());
    let root_trimmed = root_norm.trim_end_matches('/');

    if path_norm == root_trimmed {
        return Some(String::new());
    }

    let prefix = format!("{root_trimmed}/");
    if let Some(rel) = path_norm.strip_prefix(&prefix) {
        return Some(rel.to_string());
    }

    // Handle Windows drive letter casing differences (`c:/...` vs `C:/...`).
    if cfg!(windows) {
        let path_lower = path_norm.to_ascii_lowercase();
        let prefix_lower = prefix.to_ascii_lowercase();
        if path_lower.starts_with(&prefix_lower) {
            return Some(path_norm[prefix.len()..].to_string());
        }
    }

    // Fallback via component comparison when canonical paths are provided.
    let mut path_comps = path.components().peekable();
    for root_comp in workspace_root.components() {
        let next = path_comps.next()?;
        if next != root_comp {
            return None;
        }
    }
    let rel_parts: Vec<String> = path_comps
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    if rel_parts.is_empty() {
        None
    } else {
        Some(rel_parts.join("/"))
    }
}

fn normalize_slashes(raw: &str) -> String {
    let replaced = raw.replace('\\', "/");
    replaced
        .strip_prefix("//?/")
        .unwrap_or(&replaced)
        .to_string()
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_val(bytes[i + 1])?;
            let lo = hex_val(bytes[i + 2])?;
            out.push((hi << 4) | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_unix_paths_and_uris_roundtrip() {
        let root = Path::new("/tmp/my workspace");
        let file = Path::new("/tmp/my workspace/src/main.rs");
        let uri = path_to_file_uri(file);
        assert_eq!(uri, "file:///tmp/my%20workspace/src/main.rs");
        assert_eq!(
            uri_to_relative_path(&uri, root).as_deref(),
            Some("src/main.rs")
        );
    }

    #[test]
    fn parses_encoded_windows_drive_uri() {
        let parsed = file_uri_to_path("file:///c%3A/Users/dev/anar/src/lib.rs").unwrap();
        assert_eq!(parsed, PathBuf::from("c:/Users/dev/anar/src/lib.rs"));
    }

    #[test]
    fn rejects_external_uris_outside_workspace() {
        let root = Path::new("/home/user/project");
        let rel = uri_to_relative_path("file:///etc/passwd", root);
        assert_eq!(rel, None);
    }
}
