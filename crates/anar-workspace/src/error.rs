use serde::Serialize;
use std::fmt;
use std::io;

pub type Result<T> = std::result::Result<T, WorkspaceError>;

/// Errors produced by workspace filesystem and watcher operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "kebab-case")]
pub enum WorkspaceError {
    NotFound(String),
    NotDirectory(String),
    NotFile(String),
    PathEscape(String),
    TooLarge(String),
    BinaryOrInvalidUtf8(String),
    AlreadyExists(String),
    Io(String),
    Watcher(String),
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(msg)
            | Self::NotDirectory(msg)
            | Self::NotFile(msg)
            | Self::PathEscape(msg)
            | Self::TooLarge(msg)
            | Self::BinaryOrInvalidUtf8(msg)
            | Self::AlreadyExists(msg)
            | Self::Io(msg)
            | Self::Watcher(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for WorkspaceError {}

impl From<io::Error> for WorkspaceError {
    fn from(err: io::Error) -> Self {
        match err.kind() {
            io::ErrorKind::NotFound => Self::NotFound(err.to_string()),
            io::ErrorKind::AlreadyExists => Self::AlreadyExists(err.to_string()),
            _ => Self::Io(err.to_string()),
        }
    }
}
