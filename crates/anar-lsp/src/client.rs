//! `rust-analyzer` binary discovery, process lifecycle, and JSON-RPC 2.0 client.

use crate::protocol::{
    parse_completion_response, parse_definition_response, parse_formatting_response,
    parse_hover_response, parse_publish_diagnostics, parse_work_done_progress, read_lsp_message,
    write_lsp_message, LspCompletionItem, LspDiagnosticsEvent, LspHoverInfo, LspLocation,
    LspStatus, LspStatusEvent, LspTextEdit,
};
use crate::uri::path_to_file_uri;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

const MAX_LSP_SYNC_BYTES: usize = 1_048_576;
const INIT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
const FORMAT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_AUTO_RESTARTS: u32 = 2;

#[derive(Debug, Clone)]
struct OpenDocument {
    language_id: String,
    text: String,
    version: i32,
}

type PendingMap = Arc<Mutex<HashMap<i64, mpsc::Sender<Result<Value, String>>>>>;
type StatusCallback = Arc<dyn Fn(LspStatusEvent) + Send + Sync>;
type DiagnosticsCallback = Arc<dyn Fn(LspDiagnosticsEvent) + Send + Sync>;

struct ActiveSession {
    session_id: u64,
    workspace_root: PathBuf,
    writer_tx: mpsc::Sender<Value>,
    pending: PendingMap,
    child: Arc<Mutex<Option<Child>>>,
    shutdown_requested: Arc<AtomicBool>,
}

/// Manages the lifecycle and JSON-RPC communication of `rust-analyzer` for the active workspace.
pub struct LspManager {
    session_seq: AtomicU64,
    next_request_id: AtomicI64,
    status: Mutex<LspStatusEvent>,
    active: Mutex<Option<ActiveSession>>,
    open_docs: Mutex<HashMap<String, OpenDocument>>,
    callbacks: Mutex<Option<(PathBuf, StatusCallback, DiagnosticsCallback)>>,
    restart_count: Mutex<u32>,
}

impl Default for LspManager {
    fn default() -> Self {
        Self::new()
    }
}

impl LspManager {
    /// Creates an idle `LspManager`.
    pub fn new() -> Self {
        Self {
            session_seq: AtomicU64::new(1),
            next_request_id: AtomicI64::new(1),
            status: Mutex::new(LspStatusEvent {
                status: LspStatus::Stopped,
                detail: None,
            }),
            active: Mutex::new(None),
            open_docs: Mutex::new(HashMap::new()),
            callbacks: Mutex::new(None),
            restart_count: Mutex::new(0),
        }
    }

    /// Returns the latest known LSP lifecycle state.
    pub fn current_status(&self) -> LspStatusEvent {
        self.status
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or(LspStatusEvent {
                status: LspStatus::Stopped,
                detail: None,
            })
    }

    /// Starts (or restarts) `rust-analyzer` for `workspace_root`.
    pub fn start<FStatus, FDiag>(
        self: &Arc<Self>,
        workspace_root: &Path,
        on_status: FStatus,
        on_diagnostics: FDiag,
    ) -> Result<(), String>
    where
        FStatus: Fn(LspStatusEvent) + Send + Sync + 'static,
        FDiag: Fn(LspDiagnosticsEvent) + Send + Sync + 'static,
    {
        self.stop_internal(true);

        let status_cb: StatusCallback = Arc::new(on_status);
        let diag_cb: DiagnosticsCallback = Arc::new(on_diagnostics);
        if let Ok(mut guard) = self.callbacks.lock() {
            *guard = Some((
                workspace_root.to_path_buf(),
                Arc::clone(&status_cb),
                Arc::clone(&diag_cb),
            ));
        }
        if let Ok(mut count) = self.restart_count.lock() {
            *count = 0;
        }

        self.launch_process(workspace_root, status_cb, diag_cb)
    }

    /// Restarts `rust-analyzer` for the last configured workspace, if any.
    pub fn restart(self: &Arc<Self>) -> Result<(), String> {
        let saved = self
            .callbacks
            .lock()
            .map_err(|_| "LSP state lock poisoned".to_string())?
            .clone();
        let Some((root, status_cb, diag_cb)) = saved else {
            return Err("No workspace is currently open for rust-analyzer".to_string());
        };
        self.stop_internal(false);
        if let Ok(mut count) = self.restart_count.lock() {
            *count = 0;
        }
        self.launch_process(&root, status_cb, diag_cb)
    }

    /// Stops any active `rust-analyzer` session and clears tracked documents.
    pub fn stop(&self) {
        self.stop_internal(true);
    }

    fn stop_internal(&self, clear_docs: bool) {
        let prev = self.active.lock().ok().and_then(|mut guard| guard.take());

        if let Some(session) = prev {
            session.shutdown_requested.store(true, Ordering::SeqCst);
            let _ = session.writer_tx.send(json!({
                "jsonrpc": "2.0",
                "id": self.next_id(),
                "method": "shutdown",
                "params": Value::Null
            }));
            let _ = session.writer_tx.send(json!({
                "jsonrpc": "2.0",
                "method": "exit",
                "params": Value::Null
            }));
            if let Ok(mut pending) = session.pending.lock() {
                for (_, tx) in pending.drain() {
                    let _ = tx.send(Err("rust-analyzer session stopped".to_string()));
                }
            }
            if let Ok(mut child_guard) = session.child.lock() {
                if let Some(mut child) = child_guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }

        if clear_docs {
            if let Ok(mut docs) = self.open_docs.lock() {
                docs.clear();
            }
            if let Ok(mut cbs) = self.callbacks.lock() {
                *cbs = None;
            }
        }

        self.set_status_only(LspStatus::Stopped, None);
    }

    fn launch_process(
        self: &Arc<Self>,
        workspace_root: &Path,
        status_cb: StatusCallback,
        diag_cb: DiagnosticsCallback,
    ) -> Result<(), String> {
        let Some(binary) = find_rust_analyzer() else {
            self.emit_status(
                &status_cb,
                LspStatus::Unavailable,
                Some("rust-analyzer not found on PATH".to_string()),
            );
            return Ok(());
        };

        self.emit_status(&status_cb, LspStatus::Starting, None);

        let mut command = Command::new(&binary);
        command
            .current_dir(workspace_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                let msg = format!("failed to start rust-analyzer: {err}");
                self.emit_status(&status_cb, LspStatus::Unavailable, Some(msg.clone()));
                return Err(msg);
            }
        };

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to capture rust-analyzer stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "failed to capture rust-analyzer stdout".to_string())?;
        if let Some(stderr) = child.stderr.take() {
            // Drain stderr so rust-analyzer never blocks on a full OS pipe buffer.
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for _ in reader.lines() {}
            });
        }

        self.connect_streams(
            workspace_root,
            stdin,
            stdout,
            Some(child),
            status_cb,
            diag_cb,
            true,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn connect_streams<W, R>(
        self: &Arc<Self>,
        workspace_root: &Path,
        mut writer: W,
        reader: R,
        child: Option<Child>,
        status_cb: StatusCallback,
        diag_cb: DiagnosticsCallback,
        allow_auto_restart: bool,
    ) -> Result<(), String>
    where
        W: Write + Send + 'static,
        R: Read + Send + 'static,
    {
        let session_id = self.session_seq.fetch_add(1, Ordering::SeqCst);
        let (writer_tx, writer_rx) = mpsc::channel::<Value>();
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let shutdown_requested = Arc::new(AtomicBool::new(false));
        let child_arc = Arc::new(Mutex::new(child));

        {
            let mut active = self
                .active
                .lock()
                .map_err(|_| "LSP active lock poisoned".to_string())?;
            *active = Some(ActiveSession {
                session_id,
                workspace_root: workspace_root.to_path_buf(),
                writer_tx: writer_tx.clone(),
                pending: Arc::clone(&pending),
                child: Arc::clone(&child_arc),
                shutdown_requested: Arc::clone(&shutdown_requested),
            });
        }

        // Dedicated writer thread serializes JSON-RPC frames in order.
        thread::spawn(move || {
            for payload in writer_rx {
                if write_lsp_message(&mut writer, &payload).is_err() {
                    break;
                }
            }
        });

        // Dedicated reader thread parses incoming responses, server requests, and notifications.
        let manager = Arc::clone(self);
        let root_buf = workspace_root.to_path_buf();
        let pending_reader = Arc::clone(&pending);
        let writer_for_acks = writer_tx.clone();
        let shutdown_flag = Arc::clone(&shutdown_requested);
        let status_cb_reader = Arc::clone(&status_cb);
        let diag_cb_reader = Arc::clone(&diag_cb);

        thread::spawn(move || {
            let mut buf_reader = BufReader::new(reader);
            loop {
                match read_lsp_message(&mut buf_reader) {
                    Ok(Some(msg)) => {
                        Self::dispatch_incoming(
                            &msg,
                            &root_buf,
                            &pending_reader,
                            &writer_for_acks,
                            &manager,
                            &status_cb_reader,
                            &diag_cb_reader,
                        );
                    }
                    Ok(None) | Err(_) => break,
                }
            }

            if let Ok(mut guard) = pending_reader.lock() {
                for (_, tx) in guard.drain() {
                    let _ = tx.send(Err("rust-analyzer exited unexpectedly".to_string()));
                }
            }

            if shutdown_flag.load(Ordering::SeqCst) {
                return;
            }

            let still_current = manager
                .active
                .lock()
                .map(|g| g.as_ref().is_some_and(|s| s.session_id == session_id))
                .unwrap_or(false);
            if !still_current {
                return;
            }

            if let Ok(mut guard) = manager.active.lock() {
                if guard.as_ref().is_some_and(|s| s.session_id == session_id) {
                    *guard = None;
                }
            }

            manager.emit_status(
                &status_cb_reader,
                LspStatus::Crashed,
                Some("rust-analyzer exited unexpectedly".to_string()),
            );

            if allow_auto_restart {
                manager.maybe_auto_restart();
            }
        });

        let root_uri = path_to_file_uri(workspace_root);
        let init_params = json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "workspaceFolders": [{
                "uri": root_uri,
                "name": workspace_root
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("workspace")
            }],
            "capabilities": {
                "window": {
                    "workDoneProgress": true
                },
                "textDocument": {
                    "synchronization": {
                        "didSave": true,
                        "dynamicRegistration": false
                    },
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false,
                            "documentationFormat": ["markdown", "plaintext"]
                        }
                    },
                    "hover": {
                        "contentFormat": ["markdown", "plaintext"]
                    },
                    "definition": {
                        "linkSupport": true
                    },
                    "publishDiagnostics": {
                        "relatedInformation": false
                    }
                }
            }
        });

        let init_res = self.send_request_with_timeout("initialize", init_params, INIT_TIMEOUT);
        if let Err(err) = init_res {
            self.emit_status(&status_cb, LspStatus::Crashed, Some(err.clone()));
            self.stop_internal(false);
            return Err(err);
        }

        self.send_notification("initialized", json!({}))?;
        self.emit_status(&status_cb, LspStatus::Ready, None);
        self.replay_open_documents();
        Ok(())
    }

    fn maybe_auto_restart(self: &Arc<Self>) {
        let attempt = {
            let Ok(mut guard) = self.restart_count.lock() else {
                return;
            };
            if *guard >= MAX_AUTO_RESTARTS {
                return;
            }
            *guard += 1;
            *guard
        };

        let delay = Duration::from_millis(400 * u64::from(attempt));
        thread::sleep(delay);

        let saved = self.callbacks.lock().ok().and_then(|g| g.clone());
        if let Some((root, status_cb, diag_cb)) = saved {
            let _ = self.launch_process(&root, status_cb, diag_cb);
        }
    }

    fn dispatch_incoming(
        msg: &Value,
        workspace_root: &Path,
        pending: &PendingMap,
        writer_tx: &mpsc::Sender<Value>,
        manager: &LspManager,
        status_cb: &StatusCallback,
        diag_cb: &DiagnosticsCallback,
    ) {
        let method = msg.get("method").and_then(Value::as_str);
        let id = msg.get("id");

        match (method, id) {
            // Response to an outgoing client request.
            (None, Some(req_id)) => {
                let Some(num_id) = req_id.as_i64() else {
                    return;
                };
                let waiter = pending.lock().ok().and_then(|mut map| map.remove(&num_id));
                if let Some(tx) = waiter {
                    if let Some(err) = msg.get("error") {
                        let err_msg = err
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("LSP request failed")
                            .to_string();
                        let _ = tx.send(Err(err_msg));
                    } else {
                        let result = msg.get("result").cloned().unwrap_or(Value::Null);
                        let _ = tx.send(Ok(result));
                    }
                }
            }
            // Server-to-client request: reply immediately so rust-analyzer never stalls.
            (Some(req_method), Some(req_id)) => {
                let result = if req_method == "workspace/configuration" {
                    let count = msg
                        .get("params")
                        .and_then(|p| p.get("items"))
                        .and_then(Value::as_array)
                        .map_or(0, Vec::len);
                    Value::Array(vec![Value::Null; count])
                } else {
                    Value::Null
                };
                let _ = writer_tx.send(json!({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result
                }));
            }
            // Server-to-client notification.
            (Some(notif_method), None) => {
                let params = msg.get("params").unwrap_or(&Value::Null);
                if notif_method == "textDocument/publishDiagnostics" {
                    if let Some(event) = parse_publish_diagnostics(params, workspace_root) {
                        diag_cb(event);
                    }
                } else if notif_method == "$/progress" {
                    if let Some((status, detail)) = parse_work_done_progress(params) {
                        manager.emit_status(status_cb, status, detail);
                    }
                }
            }
            (None, None) => {}
        }
    }

    fn replay_open_documents(&self) {
        let docs: Vec<(String, OpenDocument)> = self
            .open_docs
            .lock()
            .map(|g| g.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default();
        for (rel_path, doc) in docs {
            if let Some(uri) = self.uri_for_relative(&rel_path) {
                let _ = self.send_notification(
                    "textDocument/didOpen",
                    json!({
                        "textDocument": {
                            "uri": uri,
                            "languageId": doc.language_id,
                            "version": doc.version,
                            "text": doc.text,
                        }
                    }),
                );
            }
        }
    }

    /// Sends `textDocument/didOpen` (unless the file exceeds `MAX_LSP_SYNC_BYTES`).
    pub fn did_open(
        &self,
        relative_path: &str,
        language_id: &str,
        text: &str,
    ) -> Result<(), String> {
        if text.len() > MAX_LSP_SYNC_BYTES {
            return Ok(());
        }
        let doc = OpenDocument {
            language_id: language_id.to_string(),
            text: text.to_string(),
            version: 1,
        };
        if let Ok(mut docs) = self.open_docs.lock() {
            docs.insert(relative_path.to_string(), doc.clone());
        }
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(());
        };
        self.send_notification(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": doc.language_id,
                    "version": doc.version,
                    "text": doc.text,
                }
            }),
        )
    }

    /// Sends `textDocument/didChange` with full document text and bumped version.
    pub fn did_change(&self, relative_path: &str, text: &str) -> Result<(), String> {
        if text.len() > MAX_LSP_SYNC_BYTES {
            return Ok(());
        }
        let version = {
            let Ok(mut docs) = self.open_docs.lock() else {
                return Ok(());
            };
            let entry = docs
                .entry(relative_path.to_string())
                .or_insert_with(|| OpenDocument {
                    language_id: "rust".to_string(),
                    text: String::new(),
                    version: 0,
                });
            entry.version += 1;
            entry.text = text.to_string();
            entry.version
        };
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(());
        };
        self.send_notification(
            "textDocument/didChange",
            json!({
                "textDocument": {
                    "uri": uri,
                    "version": version,
                },
                "contentChanges": [{ "text": text }]
            }),
        )
    }

    /// Sends `textDocument/didSave`.
    pub fn did_save(&self, relative_path: &str) -> Result<(), String> {
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(());
        };
        self.send_notification(
            "textDocument/didSave",
            json!({ "textDocument": { "uri": uri } }),
        )
    }

    /// Sends `textDocument/didClose` and removes the buffer from replay tracking.
    pub fn did_close(&self, relative_path: &str) -> Result<(), String> {
        if let Ok(mut docs) = self.open_docs.lock() {
            docs.remove(relative_path);
        }
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(());
        };
        self.send_notification(
            "textDocument/didClose",
            json!({ "textDocument": { "uri": uri } }),
        )
    }

    /// Queries `textDocument/completion` at a 0-based `(line, col)` cursor position.
    pub fn completion(
        &self,
        relative_path: &str,
        line: u32,
        col: u32,
    ) -> Result<Vec<LspCompletionItem>, String> {
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(Vec::new());
        };
        let result = self.send_request_with_timeout(
            "textDocument/completion",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": col }
            }),
            REQUEST_TIMEOUT,
        )?;
        Ok(parse_completion_response(&result))
    }

    /// Queries `textDocument/hover` at a 0-based `(line, col)` position.
    pub fn hover(
        &self,
        relative_path: &str,
        line: u32,
        col: u32,
    ) -> Result<Option<LspHoverInfo>, String> {
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(None);
        };
        let result = self.send_request_with_timeout(
            "textDocument/hover",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": col }
            }),
            REQUEST_TIMEOUT,
        )?;
        Ok(parse_hover_response(&result))
    }

    /// Queries `textDocument/definition` and returns workspace-scoped locations.
    pub fn goto_definition(
        &self,
        relative_path: &str,
        line: u32,
        col: u32,
    ) -> Result<Vec<LspLocation>, String> {
        let Some((uri, root)) = self.uri_and_root(relative_path) else {
            return Ok(Vec::new());
        };
        let result = self.send_request_with_timeout(
            "textDocument/definition",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": col }
            }),
            REQUEST_TIMEOUT,
        )?;
        Ok(parse_definition_response(&result, &root))
    }

    /// Queries `textDocument/formatting` (`rustfmt` via `rust-analyzer`).
    pub fn format_document(&self, relative_path: &str) -> Result<Vec<LspTextEdit>, String> {
        let Some(uri) = self.uri_for_relative(relative_path) else {
            return Ok(Vec::new());
        };
        let result = self.send_request_with_timeout(
            "textDocument/formatting",
            json!({
                "textDocument": { "uri": uri },
                "options": {
                    "tabSize": 4,
                    "insertSpaces": true
                }
            }),
            FORMAT_TIMEOUT,
        )?;
        Ok(parse_formatting_response(&result))
    }

    fn uri_for_relative(&self, relative_path: &str) -> Option<String> {
        self.uri_and_root(relative_path).map(|(uri, _)| uri)
    }

    fn uri_and_root(&self, relative_path: &str) -> Option<(String, PathBuf)> {
        let guard = self.active.lock().ok()?;
        let session = guard.as_ref()?;
        let abs = session.workspace_root.join(relative_path);
        Some((path_to_file_uri(&abs), session.workspace_root.clone()))
    }

    fn next_id(&self) -> i64 {
        self.next_request_id.fetch_add(1, Ordering::SeqCst)
    }

    fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
        let tx = self
            .active
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|s| s.writer_tx.clone()));
        let Some(writer_tx) = tx else {
            return Ok(());
        };
        writer_tx
            .send(json!({
                "jsonrpc": "2.0",
                "method": method,
                "params": params
            }))
            .map_err(|_| "rust-analyzer writer channel closed".to_string())
    }

    fn send_request_with_timeout(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let (writer_tx, pending) = {
            let guard = self
                .active
                .lock()
                .map_err(|_| "LSP active lock poisoned".to_string())?;
            let Some(session) = guard.as_ref() else {
                return Err("rust-analyzer is not running".to_string());
            };
            (session.writer_tx.clone(), Arc::clone(&session.pending))
        };

        let id = self.next_id();
        let (tx, rx) = mpsc::channel();
        {
            let mut map = pending
                .lock()
                .map_err(|_| "LSP pending lock poisoned".to_string())?;
            map.insert(id, tx);
        }

        if writer_tx
            .send(json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": params
            }))
            .is_err()
        {
            if let Ok(mut map) = pending.lock() {
                map.remove(&id);
            }
            return Err("rust-analyzer writer channel closed".to_string());
        }

        match rx.recv_timeout(timeout) {
            Ok(res) => res,
            Err(_) => {
                if let Ok(mut map) = pending.lock() {
                    map.remove(&id);
                }
                Err(format!("LSP request `{method}` timed out"))
            }
        }
    }

    fn set_status_only(&self, status: LspStatus, detail: Option<String>) {
        if let Ok(mut guard) = self.status.lock() {
            *guard = LspStatusEvent { status, detail };
        }
    }

    fn emit_status(&self, cb: &StatusCallback, status: LspStatus, detail: Option<String>) {
        let evt = LspStatusEvent { status, detail };
        if let Ok(mut guard) = self.status.lock() {
            *guard = evt.clone();
        }
        cb(evt);
    }
}

impl Drop for LspManager {
    fn drop(&mut self) {
        self.stop_internal(true);
    }
}

/// Locates `rust-analyzer` via `ANAR_RUST_ANALYZER`, `PATH`, or `~/.cargo/bin`.
pub fn find_rust_analyzer() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("ANAR_RUST_ANALYZER") {
        let p = PathBuf::from(explicit);
        if p.is_file() {
            return Some(p);
        }
    }

    if let Ok(output) = Command::new("rust-analyzer").arg("--version").output() {
        if output.status.success() {
            return Some(PathBuf::from("rust-analyzer"));
        }
    }

    let bin_name = if cfg!(windows) {
        "rust-analyzer.exe"
    } else {
        "rust-analyzer"
    };

    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        let candidate = PathBuf::from(home).join(".cargo").join("bin").join(bin_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::io;
    use std::sync::Condvar;

    struct BytePipe {
        buf: Mutex<(VecDeque<u8>, bool)>,
        cv: Condvar,
    }

    impl BytePipe {
        fn pair() -> (PipeWriter, PipeReader) {
            let pipe = Arc::new(Self {
                buf: Mutex::new((VecDeque::new(), false)),
                cv: Condvar::new(),
            });
            (
                PipeWriter {
                    pipe: Arc::clone(&pipe),
                },
                PipeReader { pipe },
            )
        }
    }

    struct PipeWriter {
        pipe: Arc<BytePipe>,
    }

    impl Write for PipeWriter {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            let mut guard = self.pipe.buf.lock().unwrap();
            guard.0.extend(data);
            self.pipe.cv.notify_all();
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Drop for PipeWriter {
        fn drop(&mut self) {
            let mut guard = self.pipe.buf.lock().unwrap();
            guard.1 = true;
            self.pipe.cv.notify_all();
        }
    }

    struct PipeReader {
        pipe: Arc<BytePipe>,
    }

    impl Read for PipeReader {
        fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
            let mut guard = self.pipe.buf.lock().unwrap();
            while guard.0.is_empty() && !guard.1 {
                guard = self.pipe.cv.wait(guard).unwrap();
            }
            let mut n = 0;
            while n < out.len() {
                let Some(byte) = guard.0.pop_front() else {
                    break;
                };
                out[n] = byte;
                n += 1;
            }
            Ok(n)
        }
    }

    #[test]
    fn lsp_manager_completes_hover_diagnostics_and_definition_over_json_rpc() {
        let root = std::env::temp_dir().join("anar-lsp-mock-ws");
        let target_uri = path_to_file_uri(&root.join("src/main.rs"));

        let (c2s_writer, c2s_reader) = BytePipe::pair();
        let (mut s2c_writer, s2c_reader) = BytePipe::pair();

        let server_thread = thread::spawn(move || {
            let mut reader = BufReader::new(c2s_reader);
            while let Ok(Some(req)) = read_lsp_message(&mut reader) {
                let method = req.get("method").and_then(Value::as_str).unwrap_or("");
                let id = req.get("id").cloned();

                match method {
                    "initialize" => {
                        let resp = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": { "capabilities": {} }
                        });
                        write_lsp_message(&mut s2c_writer, &resp).unwrap();
                    }
                    "textDocument/didOpen" => {
                        let diag = json!({
                            "jsonrpc": "2.0",
                            "method": "textDocument/publishDiagnostics",
                            "params": {
                                "uri": target_uri,
                                "diagnostics": [{
                                    "range": {
                                        "start": { "line": 1, "character": 4 },
                                        "end": { "line": 1, "character": 9 }
                                    },
                                    "severity": 2,
                                    "message": "unused variable: `count`"
                                }]
                            }
                        });
                        write_lsp_message(&mut s2c_writer, &diag).unwrap();
                    }
                    "textDocument/completion" => {
                        let resp = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "items": [{ "label": "println!", "kind": 15 }]
                            }
                        });
                        write_lsp_message(&mut s2c_writer, &resp).unwrap();
                    }
                    "textDocument/hover" => {
                        let resp = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "contents": { "kind": "markdown", "value": "fn helper()" }
                            }
                        });
                        write_lsp_message(&mut s2c_writer, &resp).unwrap();
                    }
                    "textDocument/definition" => {
                        let resp = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": [{
                                "uri": target_uri,
                                "range": {
                                    "start": { "line": 4, "character": 3 },
                                    "end": { "line": 4, "character": 9 }
                                }
                            }]
                        });
                        write_lsp_message(&mut s2c_writer, &resp).unwrap();
                    }
                    "shutdown" => {
                        let resp = json!({ "jsonrpc": "2.0", "id": id, "result": null });
                        write_lsp_message(&mut s2c_writer, &resp).unwrap();
                    }
                    "exit" => break,
                    _ => {}
                }
            }
        });

        let statuses = Arc::new(Mutex::new(Vec::new()));
        let diags = Arc::new(Mutex::new(Vec::new()));
        let statuses_cb = Arc::clone(&statuses);
        let diags_cb = Arc::clone(&diags);

        let manager = Arc::new(LspManager::new());
        manager
            .connect_streams(
                &root,
                c2s_writer,
                s2c_reader,
                None,
                Arc::new(move |evt| statuses_cb.lock().unwrap().push(evt.status)),
                Arc::new(move |evt| diags_cb.lock().unwrap().push(evt)),
                false,
            )
            .unwrap();

        manager
            .did_open("src/main.rs", "rust", "fn main() {}")
            .unwrap();

        let completions = manager.completion("src/main.rs", 0, 5).unwrap();
        assert_eq!(completions.len(), 1);
        assert_eq!(completions[0].label, "println!");

        let hover = manager.hover("src/main.rs", 0, 5).unwrap().unwrap();
        assert_eq!(hover.contents, "fn helper()");

        let defs = manager.goto_definition("src/main.rs", 0, 5).unwrap();
        assert_eq!(
            defs,
            vec![LspLocation {
                relative_path: "src/main.rs".to_string(),
                line: 5,
                col: 4,
            }]
        );

        thread::sleep(Duration::from_millis(40));
        let captured_diags = diags.lock().unwrap();
        assert!(!captured_diags.is_empty());
        assert_eq!(captured_diags[0].relative_path, "src/main.rs");

        manager.stop();
        server_thread.join().unwrap();
        assert!(statuses.lock().unwrap().contains(&LspStatus::Ready));
    }
}
