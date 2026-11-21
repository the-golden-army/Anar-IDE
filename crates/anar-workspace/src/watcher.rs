use crate::error::{Result, WorkspaceError};
use crate::path_scope::WorkspaceScope;
use crate::tree::is_ignored_relative_path;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const DEBOUNCE_WINDOW: Duration = Duration::from_millis(120);
const SELF_SAVE_SUPPRESSION_WINDOW: Duration = Duration::from_millis(1_500);

/// High-level filesystem change kind emitted to the IDE frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceFsEventKind {
    Created,
    Modified,
    Removed,
}

/// Normalized filesystem change inside the opened workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFsEvent {
    pub relative_path: String,
    pub kind: WorkspaceFsEventKind,
}

/// Watches an opened workspace recursively for external file changes.
pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
    self_saves: Arc<Mutex<HashMap<String, Instant>>>,
    stop_tx: Option<std::sync::mpsc::Sender<()>>,
    worker: Option<thread::JoinHandle<()>>,
}

impl WorkspaceWatcher {
    /// Starts watching `scope.root()`, invoking `on_events` with debounced external changes.
    pub fn start<F>(scope: WorkspaceScope, mut on_events: F) -> Result<Self>
    where
        F: FnMut(Vec<WorkspaceFsEvent>) + Send + 'static,
    {
        let (raw_tx, raw_rx) = std::sync::mpsc::channel::<notify::Result<Event>>();
        let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
        let self_saves = Arc::new(Mutex::new(HashMap::<String, Instant>::new()));
        let self_saves_worker = Arc::clone(&self_saves);
        let root_clone = scope.root().to_path_buf();

        let watcher_res = notify::recommended_watcher(move |res| {
            let _ = raw_tx.send(res);
        });
        let mut watcher = watcher_res.map_err(|err| {
            WorkspaceError::Watcher(format!("failed to initialize watcher: {err}"))
        })?;

        watcher
            .watch(scope.root(), RecursiveMode::Recursive)
            .map_err(|err| {
                WorkspaceError::Watcher(format!(
                    "failed to watch '{}': {err}",
                    scope.root().display()
                ))
            })?;

        let worker = thread::spawn(move || {
            let mut pending: BTreeMap<String, WorkspaceFsEventKind> = BTreeMap::new();
            let mut last_event_at: Option<Instant> = None;

            loop {
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                match raw_rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(Ok(event)) => {
                        if let Some(kind) = map_event_kind(&event.kind) {
                            for path in event.paths {
                                if let Some(rel) = normalize_event_path(&root_clone, &path) {
                                    if rel.is_empty() || is_ignored_relative_path(&rel) {
                                        continue;
                                    }
                                    if is_temp_save_file(&rel) {
                                        continue;
                                    }
                                    if is_suppressed(&self_saves_worker, &rel) {
                                        continue;
                                    }
                                    pending.insert(rel, kind);
                                    last_event_at = Some(Instant::now());
                                }
                            }
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }

                if let Some(ts) = last_event_at {
                    if ts.elapsed() >= DEBOUNCE_WINDOW && !pending.is_empty() {
                        let batch: Vec<WorkspaceFsEvent> = std::mem::take(&mut pending)
                            .into_iter()
                            .map(|(relative_path, kind)| WorkspaceFsEvent {
                                relative_path,
                                kind,
                            })
                            .collect();
                        last_event_at = None;
                        on_events(batch);
                    }
                }
            }
        });

        Ok(Self {
            _watcher: watcher,
            self_saves,
            stop_tx: Some(stop_tx),
            worker: Some(worker),
        })
    }

    /// Marks `relative_path` as recently saved by Anar so the watcher suppresses
    /// the self-triggered OS notification.
    pub fn record_self_save(&self, relative_path: &str) {
        let normalized = relative_path.replace('\\', "/");
        if let Ok(mut guard) = self.self_saves.lock() {
            guard.insert(normalized, Instant::now());
        }
    }
}

impl Drop for WorkspaceWatcher {
    fn drop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
    }
}

fn map_event_kind(kind: &EventKind) -> Option<WorkspaceFsEventKind> {
    match kind {
        EventKind::Create(_) => Some(WorkspaceFsEventKind::Created),
        EventKind::Modify(_) => Some(WorkspaceFsEventKind::Modified),
        EventKind::Remove(_) => Some(WorkspaceFsEventKind::Removed),
        _ => None,
    }
}

fn normalize_event_path(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    Some(parts.join("/"))
}

fn is_temp_save_file(rel: &str) -> bool {
    rel.rsplit('/').next().is_some_and(|name| {
        name.contains(".anar-tmp-") || name.ends_with(".swp") || name.ends_with('~')
    })
}

fn is_suppressed(self_saves: &Arc<Mutex<HashMap<String, Instant>>>, rel: &str) -> bool {
    let Ok(mut guard) = self_saves.lock() else {
        return false;
    };
    let now = Instant::now();
    guard.retain(|_, ts| now.duration_since(*ts) <= SELF_SAVE_SUPPRESSION_WINDOW);
    guard.contains_key(rel)
}
