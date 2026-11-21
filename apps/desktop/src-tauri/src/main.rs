#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    anar_desktop_lib::run();
}

#[cfg(test)]
mod tests {
    use anar_core::preferences::{BottomTab, LayoutState, SidebarTab, ThemeMode};
    use anar_core::CompilerBackend;
    use anar_desktop_lib::*;
    use std::path::PathBuf;
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
            zoom_percent: 110,
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
        let cargo_toml = "[package]\nname = \"sample\"\n";
        std::fs::write(proj.join("Cargo.toml"), cargo_toml).unwrap();
        std::fs::write(proj.join("src/main.rs"), "fn main() {}\n").unwrap();

        let prefs_state = PreferencesState::load(base.join(PREFERENCES_FILE_NAME));
        let ws_state = WorkspaceState::default();

        let open_res = open_workspace_with_optional_emitter(&proj, None, &ws_state, &prefs_state);
        let info = open_res.unwrap();
        assert!(info.is_cargo_project);
        assert_eq!(info.name, "sample-crate");

        let prefs = prefs_state.current().unwrap();
        assert_eq!(prefs.recent_workspaces.len(), 1);
        assert_eq!(prefs.recent_workspaces[0].name, "sample-crate");

        let _ = std::fs::remove_dir_all(&base);
    }
}
