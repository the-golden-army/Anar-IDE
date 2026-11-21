# Changelog

All notable changes to **Anar** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-21

### Added

- `anar-workspace` crate (`path_scope`, `tree`, `files`, `watcher`, `error`) with canonical workspace path containment, ignored-dir filtering (`.git`, `target`, `node_modules`), UTF-8/binary/50 MiB safety guards, `1 MiB` large-file detection, atomic file writes, CRUD operations, and debounced `notify` external change watching with self-save suppression.
- `anar-core::preferences` `RecentWorkspace` history (`record_recent_workspace`, capped at 8, backwards-compatible `#[serde(default)]`).
- Tauri commands (`pick_workspace_folder`, `open_workspace_folder`, `list_workspace_dir`, `read_workspace_file`, `save_workspace_file`, `create_workspace_file`, `create_workspace_dir`, `rename_workspace_entry`, `delete_workspace_entry`) and `workspace://fs-changed` event emission via `tauri-plugin-dialog`.
- CodeMirror 6 editor integration (`CodeMirrorEditor`, `codemirrorTheme`) with Rust/JSON/Markdown syntax highlighting synced to Dark/Light/System themes, imperative per-tab `EditorState` cache, `O(1)` `Text.eq` dirty detection, and large-file mode tuning (`>= 1 MiB`) so 5 MB files stay responsive.
- Multi-file `TabBar`, collapsible `ExplorerView` with Cargo badge and inline create/rename/delete, recent workspaces on `WelcomeScreen`, cursor/language/line-ending `StatusBar`, and non-destructive external-change reload/conflict banner.

## [0.1.0-alpha.1] - 2026-11-21

### Added

- `anar-core::preferences` module with `ThemeMode` (`dark`, `light`, `system`), `LayoutState`, dimension clamping, and atomic `preferences.json` persistence with unit tests.
- Tauri commands (`get_preferences`, `set_theme_mode`, `update_layout_state`) and managed `PreferencesState` in `apps/desktop/src-tauri`.
- Semantic design tokens (`src/styles/tokens.css`) supporting instant, flicker-free Dark, Light, and System themes with live OS `prefers-color-scheme` tracking.
- Responsive IDE app shell (`TitleBar`, `ActivityRail`, resizable/collapsible `SidebarPanel`, `BottomPanel`, `InspectorPanel`, `StatusBar`, and `WelcomeScreen`) adapting cleanly down to `420x360` windows, with keyboard shortcuts (`Ctrl/Cmd+B`, `Ctrl/Cmd+J`, `Ctrl/Cmd+Shift+I`).

## [0.0.1] - 2026-11-21

### Added

- Cargo workspace structure with five domain crates (`anar-core`, `anar-lsp`, `anar-runner`, `anar-workspace`, `anar-frameworks`) and unit tests.
- Tauri 2 + React + TypeScript + Vite + Tailwind CSS desktop shell in `apps/desktop`.
- Rusturbo integration research (`docs/rusturbo-integration.md`), system architecture (`docs/ARCHITECTURE.md`), and engineering decisions log (`docs/DECISIONS.md`).
- Repository hygiene files (`README.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, `.gitignore`, `.editorconfig`, `rustfmt.toml`, issue/PR templates).
- GitHub Actions CI workflow running frontend and Rust quality gates across Linux, macOS, and Windows.

[0.1.0]: https://github.com/Nour-yahyaoui/anar/releases/tag/v0.1.0
[0.1.0-alpha.1]: https://github.com/Nour-yahyaoui/anar/releases/tag/v0.1.0-alpha.1
[0.0.1]: https://github.com/Nour-yahyaoui/anar/releases/tag/v0.0.1
