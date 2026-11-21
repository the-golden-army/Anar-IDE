//! `rust-analyzer` lifecycle management and LSP JSON-RPC 2.0 bridge for Anar.

pub mod client;
pub mod protocol;
pub mod uri;

pub use client::{find_rust_analyzer, LspManager};
pub use protocol::{
    LspCompletionItem, LspDiagnosticsEvent, LspHoverInfo, LspLocation, LspPosition, LspRange,
    LspStatus, LspStatusEvent, LspTextEdit,
};
