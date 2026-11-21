use anar_core::preferences::{
    load_preferences, save_preferences, AppPreferences, LayoutState, ThemeMode,
};
use anar_core::CompilerBackend;
use anar_lsp::{
    LspCompletionItem, LspHoverInfo, LspLocation, LspManager, LspStatusEvent, LspTextEdit,
};
use anar_runner::{RunnerAction, RunnerEvent, RunnerManager};
use anar_workspace::{
    create_directory, create_file, delete_entry, list_directory, open_workspace, read_document,
    rename_entry, save_document, DocumentContent, FileEntry, SaveResult, WorkspaceInfo,
    WorkspaceScope, WorkspaceWatcher,
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

pub const PREFERENCES_FILE_NAME: &str = "preferences.json";
const WORKSPACE_FS_EVENT_NAME: &str = "workspace://fs-changed";
const LSP_STATUS_EVENT_NAME: &str = "lsp://status";
const LSP_DIAGNOSTICS_EVENT_NAME: &str = "lsp://diagnostics";

/// Thread-safe backend store for persistent UI theme, layout, and recent workspaces.
pub struct PreferencesState {
    path: PathBuf,
    inner: Mutex<AppPreferences>,
}

impl PreferencesState {
    /// Loads preferences from `path` and constructs a managed state instance.
    pub fn load(path: PathBuf) -> Self {
        let initial = load_preferences(&path);
        Self {
            path,
            inner: Mutex::new(initial),
        }
    }

    /// Returns a snapshot of the current preferences.
    pub fn current(&self) -> Result<AppPreferences, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| String::from("preferences lock poisoned"))?;
        Ok(guard.clone())
    }

    /// Updates the active theme mode and persists to disk.
    pub fn set_theme(&self, mode: ThemeMode) -> Result<AppPreferences, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| String::from("preferences lock poisoned"))?;
        let mut next = guard.clone();
        next.theme = mode;
        let saved = save_preferences(&self.path, &next)?;
        *guard = saved.clone();
        Ok(saved)
    }

    /// Updates layout panel visibility/dimensions and persists to disk.
    pub fn set_layout(&self, layout: LayoutState) -> Result<AppPreferences, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| String::from("preferences lock poisoned"))?;
        let mut next = guard.clone();
        next.layout = layout;
        let saved = save_preferences(&self.path, &next)?;
        *guard = saved.clone();
        Ok(saved)
    }

    /// Records a workspace at the top of the recent workspaces list and persists.
    pub fn record_recent(&self, name: &str, path: &str) -> Result<AppPreferences, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| String::from("preferences lock poisoned"))?;
        let mut next = guard.clone();
        next.record_recent_workspace(name, path);
        let saved = save_preferences(&self.path, &next)?;
        *guard = saved.clone();
        Ok(saved)
    }
}

#[derive(Default)]
struct ActiveWorkspace {
    scope: Option<WorkspaceScope>,
    watcher: Option<WorkspaceWatcher>,
}

/// Thread-safe backend state for the currently opened workspace and watcher.
#[derive(Default)]
pub struct WorkspaceState {
    inner: Mutex<ActiveWorkspace>,
}

impl WorkspaceState {
    fn set_active(
        &self,
        scope: WorkspaceScope,
        watcher: Option<WorkspaceWatcher>,
    ) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| String::from("workspace lock poisoned"))?;
        // Drop previous watcher before replacing it.
        guard.watcher = None;
        guard.scope = Some(scope);
        guard.watcher = watcher;
        Ok(())
    }

    fn scope(&self) -> Result<WorkspaceScope, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| String::from("workspace lock poisoned"))?;
        guard
            .scope
            .clone()
            .ok_or_else(|| String::from("no workspace folder is currently open"))
    }

    fn record_self_save(&self, rel_path: &str) {
        if let Ok(guard) = self.inner.lock() {
            if let Some(watcher) = &guard.watcher {
                watcher.record_self_save(rel_path);
            }
        }
    }
}

/// Thread-safe backend state for the active Cargo/Rusturbo runner.
#[derive(Default)]
pub struct RunnerState(pub Arc<RunnerManager>);

/// Thread-safe backend state for the managed `rust-analyzer` LSP bridge.
#[derive(Default)]
pub struct LspState(pub Arc<LspManager>);

/// Returns the default compiler backend configured in `anar-core`.
pub fn default_backend() -> CompilerBackend {
    CompilerBackend::default()
}

fn start_lsp_for_workspace(app: &AppHandle, info: &WorkspaceInfo, lsp_state: &LspState) {
    let manager = Arc::clone(&lsp_state.0);
    if !info.is_cargo_project {
        manager.stop();
        return;
    }

    let root = PathBuf::from(&info.root_path);
    let app_for_status = app.clone();
    let app_for_diags = app.clone();
    std::thread::spawn(move || {
        let _ = manager.start(
            &root,
            move |status| {
                let _ = app_for_status.emit(LSP_STATUS_EVENT_NAME, status);
            },
            move |diags| {
                let _ = app_for_diags.emit(LSP_DIAGNOSTICS_EVENT_NAME, diags);
            },
        );
    });
}

/// Opens a workspace directory, starts a watcher when `app` is provided, and updates recents.
pub fn open_workspace_with_optional_emitter(
    root: &Path,
    app: Option<AppHandle>,
    ws_state: &WorkspaceState,
    prefs_state: &PreferencesState,
) -> Result<WorkspaceInfo, String> {
    let scope = WorkspaceScope::open(root).map_err(|e| e.to_string())?;
    let info = open_workspace(&scope).map_err(|e| e.to_string())?;

    let watcher = if let Some(handle) = app {
        let watcher_res = WorkspaceWatcher::start(scope.clone(), move |events| {
            let _ = handle.emit(WORKSPACE_FS_EVENT_NAME, events);
        });
        let w = watcher_res.map_err(|e| e.to_string())?;
        Some(w)
    } else {
        None
    };

    ws_state.set_active(scope, watcher)?;
    let _ = prefs_state.record_recent(&info.name, &info.root_path);
    Ok(info)
}

#[tauri::command]
fn get_preferences(state: tauri::State<'_, PreferencesState>) -> Result<AppPreferences, String> {
    state.current()
}

#[tauri::command]
fn set_theme_mode(
    mode: ThemeMode,
    state: tauri::State<'_, PreferencesState>,
) -> Result<AppPreferences, String> {
    state.set_theme(mode)
}

#[tauri::command]
fn update_layout_state(
    layout: LayoutState,
    state: tauri::State<'_, PreferencesState>,
) -> Result<AppPreferences, String> {
    state.set_layout(layout)
}

#[tauri::command]
async fn pick_workspace_folder(
    app: AppHandle,
    ws_state: tauri::State<'_, WorkspaceState>,
    prefs_state: tauri::State<'_, PreferencesState>,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<Option<WorkspaceInfo>, String> {
    let app_for_dialog = app.clone();
    let dialog_handle = tauri::async_runtime::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("Open Rust Project Folder")
            .blocking_pick_folder()
    });
    let picked = dialog_handle
        .await
        .map_err(|err| format!("folder dialog task failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("selected folder is not a local filesystem path: {err}"))?;

    let info = open_workspace_with_optional_emitter(
        &path,
        Some(app.clone()),
        &ws_state,
        &prefs_state,
    )?;
    start_lsp_for_workspace(&app, &info, &lsp_state);
    Ok(Some(info))
}

#[tauri::command]
fn open_workspace_folder(
    path: String,
    app: AppHandle,
    ws_state: tauri::State<'_, WorkspaceState>,
    prefs_state: tauri::State<'_, PreferencesState>,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<WorkspaceInfo, String> {
    let info = open_workspace_with_optional_emitter(
        Path::new(&path),
        Some(app.clone()),
        &ws_state,
        &prefs_state,
    )?;
    start_lsp_for_workspace(&app, &info, &lsp_state);
    Ok(info)
}

#[tauri::command]
fn list_workspace_dir(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<Vec<FileEntry>, String> {
    let scope = ws_state.scope()?;
    list_directory(&scope, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_workspace_file(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<DocumentContent, String> {
    let scope = ws_state.scope()?;
    read_document(&scope, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_workspace_file(
    rel_path: String,
    content: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<SaveResult, String> {
    let scope = ws_state.scope()?;
    ws_state.record_self_save(&rel_path);
    save_document(&scope, Path::new(&rel_path), &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_workspace_file(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<String, String> {
    let scope = ws_state.scope()?;
    ws_state.record_self_save(&rel_path);
    create_file(&scope, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_workspace_dir(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<String, String> {
    let scope = ws_state.scope()?;
    create_directory(&scope, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_workspace_entry(
    from: String,
    to: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<String, String> {
    let scope = ws_state.scope()?;
    ws_state.record_self_save(&from);
    ws_state.record_self_save(&to);
    rename_entry(&scope, Path::new(&from), Path::new(&to)).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_workspace_entry(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
) -> Result<(), String> {
    let scope = ws_state.scope()?;
    ws_state.record_self_save(&rel_path);
    delete_entry(&scope, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_window_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_window_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn start_cargo_run(
    action: RunnerAction,
    on_event: tauri::ipc::Channel<RunnerEvent>,
    ws_state: tauri::State<'_, WorkspaceState>,
    runner_state: tauri::State<'_, RunnerState>,
) -> Result<u64, String> {
    let scope = ws_state.scope()?;
    runner_state
        .0
        .start_cargo_run(scope.root(), action, move |evt| {
            let _ = on_event.send(evt);
        })
}

#[tauri::command]
fn stop_cargo_run(runner_state: tauri::State<'_, RunnerState>) -> Result<bool, String> {
    runner_state.0.stop()
}

#[tauri::command]
fn send_run_stdin(
    input: String,
    runner_state: tauri::State<'_, RunnerState>,
) -> Result<(), String> {
    runner_state.0.write_stdin(&input)
}

#[tauri::command]
fn lsp_get_status(lsp_state: tauri::State<'_, LspState>) -> LspStatusEvent {
    lsp_state.0.current_status()
}

#[tauri::command]
async fn lsp_restart(lsp_state: tauri::State<'_, LspState>) -> Result<(), String> {
    let manager = Arc::clone(&lsp_state.0);
    tauri::async_runtime::spawn_blocking(move || manager.restart())
        .await
        .map_err(|err| format!("LSP restart task failed: {err}"))?
}

#[tauri::command]
fn lsp_did_open(
    rel_path: String,
    language_id: String,
    content: String,
    ws_state: tauri::State<'_, WorkspaceState>,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let scope = ws_state.scope()?;
    let _ = scope
        .resolve_existing(Path::new(&rel_path))
        .map_err(|e| e.to_string())?;
    lsp_state.0.did_open(&rel_path, &language_id, &content)
}

#[tauri::command]
fn lsp_did_change(
    rel_path: String,
    content: String,
    ws_state: tauri::State<'_, WorkspaceState>,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let scope = ws_state.scope()?;
    let _ = scope
        .resolve_existing(Path::new(&rel_path))
        .map_err(|e| e.to_string())?;
    lsp_state.0.did_change(&rel_path, &content)
}

#[tauri::command]
fn lsp_did_save(
    rel_path: String,
    ws_state: tauri::State<'_, WorkspaceState>,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let scope = ws_state.scope()?;
    let _ = scope
        .resolve_existing(Path::new(&rel_path))
        .map_err(|e| e.to_string())?;
    lsp_state.0.did_save(&rel_path)
}

#[tauri::command]
fn lsp_did_close(rel_path: String, lsp_state: tauri::State<'_, LspState>) -> Result<(), String> {
    lsp_state.0.did_close(&rel_path)
}

#[tauri::command]
async fn lsp_completion(
    rel_path: String,
    line: u32,
    col: u32,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<Vec<LspCompletionItem>, String> {
    let manager = Arc::clone(&lsp_state.0);
    tauri::async_runtime::spawn_blocking(move || manager.completion(&rel_path, line, col))
        .await
        .map_err(|err| format!("LSP completion task failed: {err}"))?
}

#[tauri::command]
async fn lsp_hover(
    rel_path: String,
    line: u32,
    col: u32,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<Option<LspHoverInfo>, String> {
    let manager = Arc::clone(&lsp_state.0);
    tauri::async_runtime::spawn_blocking(move || manager.hover(&rel_path, line, col))
        .await
        .map_err(|err| format!("LSP hover task failed: {err}"))?
}

#[tauri::command]
async fn lsp_goto_definition(
    rel_path: String,
    line: u32,
    col: u32,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<Vec<LspLocation>, String> {
    let manager = Arc::clone(&lsp_state.0);
    tauri::async_runtime::spawn_blocking(move || manager.goto_definition(&rel_path, line, col))
        .await
        .map_err(|err| format!("LSP definition task failed: {err}"))?
}

#[tauri::command]
async fn lsp_format_document(
    rel_path: String,
    lsp_state: tauri::State<'_, LspState>,
) -> Result<Vec<LspTextEdit>, String> {
    let manager = Arc::clone(&lsp_state.0);
    tauri::async_runtime::spawn_blocking(move || manager.format_document(&rel_path))
        .await
        .map_err(|err| format!("LSP format task failed: {err}"))?
}

/// Entry point for the Anar desktop application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("anar"));
            let prefs_path = config_dir.join(PREFERENCES_FILE_NAME);
            app.manage(PreferencesState::load(prefs_path));
            app.manage(WorkspaceState::default());
            app.manage(RunnerState::default());
            app.manage(LspState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_preferences,
            set_theme_mode,
            update_layout_state,
            pick_workspace_folder,
            open_workspace_folder,
            list_workspace_dir,
            read_workspace_file,
            save_workspace_file,
            create_workspace_file,
            create_workspace_dir,
            rename_workspace_entry,
            delete_workspace_entry,
            is_window_fullscreen,
            toggle_window_fullscreen,
            start_cargo_run,
            stop_cargo_run,
            send_run_stdin,
            lsp_get_status,
            lsp_restart,
            lsp_did_open,
            lsp_did_change,
            lsp_did_save,
            lsp_did_close,
            lsp_completion,
            lsp_hover,
            lsp_goto_definition,
            lsp_format_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anar");
}
