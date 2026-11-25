# Changelog

All notable changes to **Anar** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-25

### Added

- `anar-core` shared diagnostic types (`DiagnosticItem`, `DiagnosticSpan`, `DiagnosticSeverity`) and `configure_background_command` helper to suppress console flashes (`CREATE_NO_WINDOW`) on Windows background tool spawns (`git`, `rust-analyzer`, `cargo`, `rusturbo`, `rustc`, `taskkill`).
- `anar-runner` streaming Cargo execution (`build`, `run`, `check`, `test`), `--message-format=json` diagnostic parser, interactive `stdin` forwarding, and cross-platform process-tree termination (`process_group` + `kill` on Unix, `taskkill /T /F` on Windows).
- Standalone `.rs` execution fallback in `anar-runner` (`start_run_with_backend_and_file`, `parse_rustc_stderr_line`): workspaces without `Cargo.toml` compile, check, test, and run directly via `rustc --error-format=json`.
- Tauri runner commands (`start_cargo_run`, `stop_cargo_run`, `send_run_stdin`) streaming ordered `RunnerEvent`s over `tauri::ipc::Channel`.
- TitleBar `Run` / `Build` / `Check` / `Test` / `Stop` controls (`F5`, `Shift+F5`, `Ctrl/Cmd+Shift+B`), live streaming **Output** console with interactive `stdin` input, and clickable **Problems** diagnostics that jump directly to the file, line, and column in CodeMirror.
- `anar-lsp` `rust-analyzer` lifecycle manager, `Content-Length` JSON-RPC 2.0 transport, `file://` URI <-> workspace-relative path conversions, document synchronization (`didOpen`, debounced `didChange`, `didSave`, `didClose` with 1 MiB large-file guard), crash detection + bounded auto-restart with open-document replay, and `lsp://status` / `lsp://diagnostics` event emissions.
- CodeMirror 6 language intelligence (`@codemirror/lint` inline diagnostic squiggles & gutter markers, `@codemirror/autocomplete` completions, `hoverTooltip` type/doc popups, `F12` / `Ctrl/Cmd+Click` Go-to-Definition, `Shift+Alt+F` `rustfmt` formatting) plus live `rust-analyzer` status & restart controls in `StatusBar` and `InspectorPanel`.
- `anar-frameworks` Phase 6 framework detector (`Cargo.toml`, workspace members, `src-tauri/Cargo.toml`, `Cargo.lock` across `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, and `clap`), tailored run profiles (`dx serve`, `cargo leptos watch`, `trunk serve`, `cargo tauri dev`, Bevy dynamic linking, Clap CLI, and server port/tool checks), and 11 project scaffolding templates.
- Tauri framework & template commands (`detect_workspace_frameworks`, `list_project_templates`, `pick_parent_folder`, `create_project_from_template`, `start_profile_run`) plus `NewProjectModal`, live **Framework Profile** / **Run Profiles** controls in `InspectorPanel`, and framework badges in `StatusBar`.
- `anar-core::preferences` persistent `compilerBackend` (`Cargo` | `Rusturbo`) with `set_compiler_backend` Tauri command.
- `anar-runner::rusturbo` Phase 7 Rusturbo integration: PATH/version probing (requiring both a binary and valid `--version` output), `rusturbo.toml` inspection, `rusturbo init` & `rusturbo analyze --json` parsing, `NO_COLOR=1` subprocess execution for `build`/`run` with automatic Cargo fallback for `check`/`test`, and fallback `rustc` stderr diagnostic parsing.
- **Compiler Backend** switcher (`Cargo` / `Rusturbo`), `Analyze`, `Init rusturbo.toml`, and dependency-graph/linker/sccache/cache readout in `InspectorPanel`, plus live backend status in `StatusBar` and `TitleBar`.
- `anar-workspace::search` and `anar-workspace::git` Phase 8 workspace text/fuzzy-file search (`search_workspace`, `find_workspace_files`) and Git status, unified diff, stage, and unstage commands (`git_status`, `git_diff`, `git_stage_file`, `git_unstage_file`).
- `anar-runner::pty` cross-platform interactive PTY terminal manager backed by `portable-pty` (`pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`) and `@xterm/xterm` + `@xterm/addon-fit` UI (`TerminalView`, `SearchView`, `GitView`).
- Desktop IDE UI redesign (`v2.3.0` UI shell): redesigned `TitleBar`, `ActivityRail`, `SidebarPanel`, `BottomPanel`, `InspectorPanel`, `ExtensionsView`, smooth panel resizing, `Ctrl+/-/0` zoom scaling, fullscreen toggle, increased UI/editor/terminal typography scale, and non-truncating error banners.

### Fixed

- Drop Windows ConPTY master after child process exit before joining PTY reader thread to avoid shutdown hangs.
- Treat broken `rusturbo` shims/wrappers (missing valid `--version` output) as unavailable in `probe_rusturbo_status` and surface install hints in `InspectorPanel`.
- Prevent Windows `cmd` console windows from flashing open on background CLI invocations.
- Support running/building/checking standalone `.rs` files without requiring a `Cargo.toml`.

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

[Unreleased]: https://github.com/the-golden-army/Anar-IDE/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/the-golden-army/Anar-IDE/releases/tag/v0.2.0
[0.1.0]: https://github.com/the-golden-army/Anar-IDE/releases/tag/v0.1.0
[0.1.0-alpha.1]: https://github.com/the-golden-army/Anar-IDE/releases/tag/v0.1.0-alpha.1
[0.0.1]: https://github.com/the-golden-army/Anar-IDE/releases/tag/v0.0.1
