use anar_core::preferences::{
    load_preferences, save_preferences, AppPreferences, LayoutState, ThemeMode,
};
use anar_core::CompilerBackend;
use anar_workspace::{
    create_directory, create_file, delete_entry, list_directory, open_workspace, read_document,
    rename_entry, save_document, DocumentContent, FileEntry, SaveResult, WorkspaceFsEvent,
    WorkspaceInfo, WorkspaceScope, WorkspaceWatcher,
};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const PREFERENCES_FILE_NAME: &str = "preferences.json";
const WORKSPACE_FS_EVENT_NAME: &str = "workspace://fs-changed";

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

/// Returns the default compiler backend configured in `anar-core`.
pub fn default_backend() -> CompilerBackend {
    CompilerBackend::default()
}

fn open_workspace_with_optional_emitter(
    root: &Path,
    app: Option<AppHandle>,
    ws_state: &WorkspaceState,
    prefs_state: &PreferencesState,
) -> Result<WorkspaceInfo, String> {
    let scope = WorkspaceScope::open(root).map_err(|e| e.to_string())?;
    let info = open_workspace(&scope).map_err(|e| e.to_string())?;

    let watcher = if let Some(handle) = app {
        let w = WorkspaceWatcher::start(scope.clone(), move |events: Vec<WorkspaceFsEvent>| {
            let _ = handle.emit(WORKSPACE_FS_EVENT_NAME, events);
        })
        .map_err(|e| e.to_string())?;
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
) -> Result<Option<WorkspaceInfo>, String> {
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("Open Rust Project Folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|err| format!("folder dialog task failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("selected folder is not a local filesystem path: {err}"))?;

    let info = open_workspace_with_optional_emitter(&path, Some(app), &ws_state, &prefs_state)?;
    Ok(Some(info))
}

#[tauri::command]
fn open_workspace_folder(
    path: String,
    app: AppHandle,
    ws_state: tauri::State<'_, WorkspaceState>,
    prefs_state: tauri::State<'_, PreferencesState>,
) -> Result<WorkspaceInfo, String> {
    open_workspace_with_optional_emitter(Path::new(&path), Some(app), &ws_state, &prefs_state)
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
            delete_workspace_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anar");
}

#[cfg(test)]
mod tests {
    use super::*;
    use anar_core::preferences::{BottomTab, SidebarTab};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let pid = std::process::id();
        std::env::temp_dir().join(format!("anar-desktop-test-{tag}-{pid}-{nanos}"))
    }

    #[test]
    fn default_backend_is_cargo() {
        assert_eq!(default_backend(), CompilerBackend::Cargo);
    }

    #[test]
    fn preferences_state_persists_theme_and_layout_across_reloads() {
        let dir = unique_temp_dir("prefs");
        let path = dir.join(PREFERENCES_FILE_NAME);
        let state = PreferencesState::load(path.clone());
        assert_eq!(state.current().unwrap().theme, ThemeMode::System);

        let updated = state.set_theme(ThemeMode::Dark).unwrap();
        assert_eq!(updated.theme, ThemeMode::Dark);

        let layout = LayoutState {
            sidebar_open: false,
            sidebar_width: 310,
            active_sidebar_tab: SidebarTab::Search,
            bottom_panel_open: true,
            bottom_panel_height: 220,
            active_bottom_tab: BottomTab::Terminal,
            inspector_open: true,
            inspector_width: 260,
        };
        state.set_layout(layout.clone()).unwrap();

        let reloaded = PreferencesState::load(path);
        let snapshot = reloaded.current().unwrap();
        assert_eq!(snapshot.theme, ThemeMode::Dark);
        assert_eq!(snapshot.layout, layout);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn workspace_state_opens_project_and_records_recent() {
        let base = unique_temp_dir("ws");
        let proj = base.join("sample-crate");
        std::fs::create_dir_all(proj.join("src")).unwrap();
        std::fs::write(proj.join("Cargo.toml"), "[package]\nname = \"sample\"\n").unwrap();
        std::fs::write(proj.join("src/main.rs"), "fn main() {}\n").unwrap();

        let prefs_state = PreferencesState::load(base.join(PREFERENCES_FILE_NAME));
        let ws_state = WorkspaceState::default();

        let info =
            open_workspace_with_optional_emitter(&proj, None, &ws_state, &prefs_state).unwrap();
        assert!(info.is_cargo_project);
        assert_eq!(info.name, "sample-crate");

        let prefs = prefs_state.current().unwrap();
        assert_eq!(prefs.recent_workspaces.len(), 1);
        assert_eq!(prefs.recent_workspaces[0].name, "sample-crate");

        let _ = std::fs::remove_dir_all(&base);
    }
}
