//! Persistent user preferences for theme and workspace panel layout.
//!
//! Kept free of Tauri dependencies so unit tests run standalone and any host
//! (desktop app, CLI, or tests) can load and validate preferences identically.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const PREFERENCES_SCHEMA_VERSION: u32 = 1;
pub const MIN_SIDEBAR_WIDTH: u16 = 180;
pub const MAX_SIDEBAR_WIDTH: u16 = 480;
pub const DEFAULT_SIDEBAR_WIDTH: u16 = 260;

pub const MIN_BOTTOM_HEIGHT: u16 = 120;
pub const MAX_BOTTOM_HEIGHT: u16 = 480;
pub const DEFAULT_BOTTOM_HEIGHT: u16 = 200;

pub const MIN_INSPECTOR_WIDTH: u16 = 200;
pub const MAX_INSPECTOR_WIDTH: u16 = 480;
pub const DEFAULT_INSPECTOR_WIDTH: u16 = 280;

/// User-selected UI theme mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeMode {
    Dark,
    Light,
    #[default]
    System,
}

/// Active tab inside the primary left sidebar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SidebarTab {
    #[default]
    Explorer,
    Search,
    Git,
}

/// Active tab inside the bottom utility panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BottomTab {
    #[default]
    Output,
    Problems,
    Terminal,
}

/// Persistent panel visibility, active tabs, and dimensions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LayoutState {
    pub sidebar_open: bool,
    pub sidebar_width: u16,
    pub active_sidebar_tab: SidebarTab,
    pub bottom_panel_open: bool,
    pub bottom_panel_height: u16,
    pub active_bottom_tab: BottomTab,
    pub inspector_open: bool,
    pub inspector_width: u16,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            sidebar_open: true,
            sidebar_width: DEFAULT_SIDEBAR_WIDTH,
            active_sidebar_tab: SidebarTab::Explorer,
            bottom_panel_open: true,
            bottom_panel_height: DEFAULT_BOTTOM_HEIGHT,
            active_bottom_tab: BottomTab::Output,
            inspector_open: false,
            inspector_width: DEFAULT_INSPECTOR_WIDTH,
        }
    }
}

impl LayoutState {
    /// Clamps panel dimensions into safe, usable ranges.
    pub fn sanitized(mut self) -> Self {
        self.sidebar_width = self
            .sidebar_width
            .clamp(MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        self.bottom_panel_height = self
            .bottom_panel_height
            .clamp(MIN_BOTTOM_HEIGHT, MAX_BOTTOM_HEIGHT);
        self.inspector_width = self
            .inspector_width
            .clamp(MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH);
        self
    }
}

/// Persistent application preferences stored on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppPreferences {
    pub version: u32,
    pub theme: ThemeMode,
    pub layout: LayoutState,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            version: PREFERENCES_SCHEMA_VERSION,
            theme: ThemeMode::default(),
            layout: LayoutState::default(),
        }
    }
}

impl AppPreferences {
    /// Normalizes schema version and clamps layout dimensions.
    pub fn sanitized(mut self) -> Self {
        self.version = PREFERENCES_SCHEMA_VERSION;
        self.layout = self.layout.sanitized();
        self
    }
}

/// Loads preferences from `path`, falling back to defaults if missing or malformed.
pub fn load_preferences(path: &Path) -> AppPreferences {
    let Ok(raw) = fs::read_to_string(path) else {
        return AppPreferences::default();
    };
    serde_json::from_str::<AppPreferences>(&raw)
        .map(AppPreferences::sanitized)
        .unwrap_or_default()
}

/// Saves `prefs` atomically to `path` after sanitizing dimensions.
pub fn save_preferences(path: &Path, prefs: &AppPreferences) -> Result<AppPreferences, String> {
    let clean = prefs.clone().sanitized();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create preferences directory: {err}"))?;
    }
    let json = serde_json::to_string_pretty(&clean)
        .map_err(|err| format!("failed to serialize preferences: {err}"))?;

    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, json.as_bytes())
        .map_err(|err| format!("failed to write temporary preferences file: {err}"))?;

    if let Err(rename_err) = fs::rename(&tmp_path, path) {
        // On some platforms/filesystems, rename over an existing file can fail; fall back cleanly.
        if fs::write(path, json.as_bytes()).is_err() {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("failed to persist preferences file: {rename_err}"));
        }
        let _ = fs::remove_file(&tmp_path);
    }

    Ok(clean)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir()
            .join(format!("anar-prefs-test-{}-{nanos}", std::process::id()))
            .join(name)
    }

    #[test]
    fn defaults_and_clamping_keep_dimensions_bounded() {
        let layout = LayoutState {
            sidebar_width: 10,
            bottom_panel_height: 9_999,
            inspector_width: 5,
            ..LayoutState::default()
        }
        .sanitized();

        assert_eq!(layout.sidebar_width, MIN_SIDEBAR_WIDTH);
        assert_eq!(layout.bottom_panel_height, MAX_BOTTOM_HEIGHT);
        assert_eq!(layout.inspector_width, MIN_INSPECTOR_WIDTH);
    }

    #[test]
    fn missing_or_corrupt_file_returns_defaults() {
        let missing = unique_temp_path("missing.json");
        assert_eq!(load_preferences(&missing), AppPreferences::default());

        let corrupt = unique_temp_path("corrupt.json");
        fs::create_dir_all(corrupt.parent().unwrap()).unwrap();
        fs::write(&corrupt, "{not valid json").unwrap();
        assert_eq!(load_preferences(&corrupt), AppPreferences::default());
        let _ = fs::remove_dir_all(corrupt.parent().unwrap());
    }

    #[test]
    fn save_and_load_roundtrip_preserves_theme_and_layout() {
        let path = unique_temp_path("preferences.json");
        let prefs = AppPreferences {
            version: 1,
            theme: ThemeMode::Light,
            layout: LayoutState {
                sidebar_open: false,
                sidebar_width: 320,
                active_sidebar_tab: SidebarTab::Git,
                bottom_panel_open: true,
                bottom_panel_height: 240,
                active_bottom_tab: BottomTab::Problems,
                inspector_open: true,
                inspector_width: 300,
            },
        };

        let saved = save_preferences(&path, &prefs).expect("save preferences");
        assert_eq!(saved, prefs);
        let loaded = load_preferences(&path);
        assert_eq!(loaded, prefs);

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn partial_json_uses_serde_defaults() {
        let path = unique_temp_path("partial.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"theme":"dark"}"#).unwrap();

        let loaded = load_preferences(&path);
        assert_eq!(loaded.theme, ThemeMode::Dark);
        assert!(loaded.layout.sidebar_open);
        assert_eq!(loaded.layout.sidebar_width, DEFAULT_SIDEBAR_WIDTH);

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
