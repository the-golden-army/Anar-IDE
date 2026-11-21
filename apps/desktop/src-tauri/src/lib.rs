use anar_core::preferences::{
    load_preferences, save_preferences, AppPreferences, LayoutState, ThemeMode,
};
use anar_core::CompilerBackend;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const PREFERENCES_FILE_NAME: &str = "preferences.json";

/// Thread-safe backend store for persistent UI theme and layout preferences.
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
}

/// Returns the default compiler backend configured in `anar-core`.
pub fn default_backend() -> CompilerBackend {
    CompilerBackend::default()
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

/// Entry point for the Anar desktop application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("anar"));
            let prefs_path = config_dir.join(PREFERENCES_FILE_NAME);
            app.manage(PreferencesState::load(prefs_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_preferences,
            set_theme_mode,
            update_layout_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anar");
}

#[cfg(test)]
mod tests {
    use super::*;
    use anar_core::preferences::{BottomTab, SidebarTab};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_prefs_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir()
            .join(format!("anar-desktop-test-{}-{nanos}", std::process::id()))
            .join(PREFERENCES_FILE_NAME)
    }

    #[test]
    fn default_backend_is_cargo() {
        assert_eq!(default_backend(), CompilerBackend::Cargo);
    }

    #[test]
    fn preferences_state_persists_theme_and_layout_across_reloads() {
        let path = temp_prefs_path();
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

        let reloaded = PreferencesState::load(path.clone());
        let snapshot = reloaded.current().unwrap();
        assert_eq!(snapshot.theme, ThemeMode::Dark);
        assert_eq!(snapshot.layout, layout);

        if let Some(parent) = path.parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }
}
