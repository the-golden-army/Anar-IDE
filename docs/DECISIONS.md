# Architecture & Engineering Decisions

This log records key decisions made when resolving ambiguities or environment constraints, following the project rule: *"If something is ambiguous or blocked: open an issue, choose the most reasonable option, document the decision in `docs/DECISIONS.md`, and continue."*

---

## ADR-001: Tauri 2 IPC Split (Commands vs. Channels vs. Events)

- **Context:** Anar needs request/response RPC (open file, hover, rename), high-throughput ordered streams (compiler output, PTY bytes, search hits), and unsolicited backend pushes (LSP diagnostics, file-watcher events).
- **Decision:** Use Tauri `#[tauri::command]` for RPC, `tauri::ipc::Channel<T>` for invocation-scoped ordered streams, and `app.emit` for workspace-wide asynchronous broadcasts.
- **Consequences:** Avoids serializing high-frequency PTY/compiler chunks through the global event bus while keeping commands strongly typed.

## ADR-002: Minimal Phase 1 Capability & No Broad Shell Plugin

- **Context:** Tauri 2 uses capability-based permissions (`capabilities/*.json`) to expose backend plugins and commands to the webview.
- **Decision:** Enable only `core:default` in `apps/desktop/src-tauri/capabilities/default.json` for Phase 1. Do not add `tauri-plugin-shell` or `tauri-plugin-fs` with unrestricted paths; instead, expose scoped Rust commands in `anar-workspace` and `anar-runner`.
- **Consequences:** Enforces workspace containment and argv-only subprocess spawning in Rust rather than relying on frontend discipline.

## ADR-003: Rusturbo Integration via `CompilerBackend` Abstraction (Not a Direct `rustc` Replacement)

- **Context:** Inspecting `../Rusturbo` (`v0.1.2`) revealed that `rusturbo` is a Cargo wrapper CLI (`init`, `analyze`, `optimize`, `build`, `run`, `benchmark`, `clean`) that buffers/discards Cargo's `stdout` and does not expose `check` or `test`.
- **Decision:** Treat `rusturbo` and `cargo` as two implementations behind an `anar-runner` `CompilerBackend` abstraction. `check`/`test` and structured `--message-format=json` diagnostics remain backed by `cargo` until/unless `rusturbo` supports stdout streaming and `check`/`test`.
- **Consequences:** Preserves full clickable diagnostics and `check`/`test` workflows while still unlocking Rusturbo's shared-target cache and fast-linker acceleration for `build`/`run` in Phase 7.

## ADR-004: Bootstrap Verification Strategy Without Local `rustc`/`cargo` or Display

- **Context:** The Phase 1 sandbox has Node.js/npm (`registry.npmjs.org`) and Git/GitHub CLI (`github.com`), but does not have `rustc`/`cargo`, WebKit2GTK, a display server, or outbound access to `crates.io`.
- **Decision:**
  1. Run all frontend quality gates (`eslint`, `prettier`, `tsc --noEmit`, `vitest`, `vite build`) locally.
  2. Run all Rust + Tauri quality gates (`cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`) on GitHub Actions across `ubuntu-latest`, `macos-latest`, and `windows-latest`.
  3. Defer `Cargo.lock` commitment and interactive `npm run tauri dev` GUI window verification to tracked GitHub issues, and document the unverified items explicitly in the Phase 1 report.
- **Consequences:** Zero fabricated claims ("Never claim something works unless you ran it and saw it work"), full cross-OS CI verification, and every gap tracked as a GitHub issue.

## ADR-005: MIT License & Standard Frontend Quality Stack

- **Context:** The brief requires an open-source license, ESLint, Prettier, `tsc --noEmit`, and frontend tests.
- **Decision:** Adopt the MIT License (matching Rusturbo), ESLint 9 flat config with `typescript-eslint`, Prettier 3, TypeScript strict mode (`tsc --noEmit`), and Vitest for frontend unit tests.
- **Consequences:** Single-command, fast, deterministic frontend verification in both local and CI environments.

## ADR-006: Tracking Risks When Sandbox `GH_TOKEN` Lacks `issues=write` Permission

- **Context:** Calling `gh issue create` and `POST /repos/Nour-yahyaoui/anar/issues` in Phase 1 failed with `HTTP 403 Forbidden` (`Resource not accessible by integration`, `X-Accepted-Github-Permissions: issues=write`).
- **Decision:** Record every Phase 1 risk, unknown, and unverified item in [`docs/PENDING_ISSUES.md`](PENDING_ISSUES.md) and report the permission gap. *(Resolved at the start of Phase 2: `issues=write` was enabled and issues `#3`–`#14` were filed.)*
- **Consequences:** All Phase 1 and Phase 2 risks and unknowns are now tracked as live GitHub issues.

## ADR-007: Dual-Layer Theme & Layout Persistence (Rust Backend + Pre-Paint `localStorage`)

- **Context:** Phase 2 requires theme switching (`dark`, `light`, `system`) to be both **instant** (no flash of wrong theme on startup) and **persistent** via Rust core logic.
- **Decision:** Store canonical preferences (`ThemeMode`, `LayoutState`) in `anar-core::preferences` and persist atomically to `app_config_dir()/preferences.json` via Tauri commands (`get_preferences`, `set_theme_mode`, `update_layout_state`). Mirror the theme key in `localStorage` so an inline script in `index.html` applies `data-theme` synchronously before React mounts.
- **Consequences:** Zero startup theme flash, single source of truth in Rust on desktop, and seamless fallback in Vitest/browser previews without Tauri IPC.

## ADR-008: Prerelease SemVer Tag `v0.1.0-alpha.1` for Phase 2 (`v0.1.0` Part 1)

- **Context:** The roadmap specifies `v0.1.0 (part 1)` for Phase 2 and `v0.1.0` for Phase 3, while requiring every phase to end with a git tag and GitHub Release.
- **Decision:** Tag Phase 2 as `v0.1.0-alpha.1` (SemVer prerelease), reserving `v0.1.0` for Phase 3 completion.
- **Consequences:** Preserves monotonic SemVer ordering across Phase 1 (`v0.0.1`), Phase 2 (`v0.1.0-alpha.1`), and Phase 3 (`v0.1.0`).

## ADR-009: Imperative CodeMirror 6 `EditorState` Cache & Large-File Tuning (`>= 1 MiB`)

- **Context:** Storing full document strings in React state on every keystroke causes multi-megabyte string copies and re-renders on 5 MB Rust files, freezing the UI.
- **Decision:** Keep a single mounted CodeMirror `EditorView` and cache each open tab's `EditorState`, `savedDoc: Text`, and scroll offsets in an imperative `Map` inside `CodeMirrorEditor`. Use `state.doc.eq(savedDoc)` for structural `O(1)` dirty checks without calling `.toString()` per keystroke, and disable whole-document `foldGutter`/`bracketMatching`/`highlightSelectionMatches` for files `>= 1 MiB` (`LARGE_FILE_THRESHOLD_BYTES`).
- **Consequences:** Tab switching preserves undo/redo history and scroll position with zero React re-renders per keystroke, while 5 MB files load and edit responsively.

## ADR-010: Rust-Side Native Folder Picker & Scoped Workspace Access

- **Context:** Phase 3 needs folder selection and filesystem CRUD while preserving ADR-002's minimal webview capabilities (`core:default`).
- **Decision:** Invoke `tauri-plugin-dialog` (`app.dialog().file().blocking_pick_folder()`) inside the Rust `pick_workspace_folder` command rather than granting broad frontend `@tauri-apps/plugin-dialog` or `@tauri-apps/plugin-fs` capabilities. All subsequent reads, writes, renames, deletes, and `notify` watches are canonicalized and confined to the active `WorkspaceScope`.
- **Consequences:** `capabilities/default.json` remains minimal (`core:default`, `dialog:default`), and path traversal or symlink escape from the webview is rejected in Rust.

## ADR-011: Windows `CREATE_NO_WINDOW` Flag on All Background Subprocesses

- **Context:** On Windows, `anar-desktop.exe` compiles with `windows_subsystem = "windows"` and has no parent console. Spawning background CLI tools (`git`, `rust-analyzer`, `cargo`, `rusturbo`, `rustc`, `taskkill`) with default `std::process::Command` flags caused Windows to flash visible `cmd` console windows open and closed during normal IDE interactions.
- **Decision:** Centralize `anar_core::configure_background_command(&mut Command)` in `crates/anar-core`, applying `.creation_flags(0x0800_0000)` (`CREATE_NO_WINDOW`) on `#[cfg(windows)]` targets, and call it before spawning every non-PTY background process across `anar-lsp`, `anar-runner`, and `anar-workspace`.
- **Consequences:** Eliminates Windows console flashes across Git polling, LSP startup/probing, runner actions, and process cancellation while keeping interactive PTY sessions in `portable-pty` unaffected.

## ADR-012: Standalone `.rs` Fallback via `rustc` When `Cargo.toml` Is Absent

- **Context:** Users frequently open single-file Rust folders (e.g., `src/app.rs` or `main.rs`) without initializing a Cargo package. Unconditionally running `cargo run --message-format=json` failed with `could not find 'Cargo.toml'`.
- **Decision:** Search ancestor directories from the active editor file up to `workspace_root` for `Cargo.toml`. When none exists, `RunnerManager::start_rustc_run` resolves the active `.rs` file (or standard entrypoints `main.rs`, `src/main.rs`, `app.rs`, `src/app.rs`) and runs `rustc --error-format=json` directly (`--emit=metadata` for Check, `<stem>{EXE_SUFFIX}` for Build, temp binary execution with live `stdin`/Stop for Run and `--test` for Test), parsing `rustc` JSON stderr diagnostics with `parse_rustc_stderr_line`.
- **Consequences:** Both Cargo workspaces and standalone `.rs` scratch folders work seamlessly with Run, Build, Check, Test, and clickable Problems diagnostics.

## ADR-013: Cross-Platform PTY Terminal & Scoped Git/Search Helpers

- **Context:** Phase 8 requires an integrated terminal alongside workspace search and Git source control without weakening ADR-002's security model.
- **Decision:** Back the interactive terminal in `anar-runner::pty` with `portable-pty` (`PtyManager`, dropping Windows ConPTY master handles cleanly after child exit before joining reader threads) paired with `@xterm/xterm` + `@xterm/addon-fit` (`TerminalView`), and implement `search_workspace`, `find_workspace_files`, `git_status`, `git_diff`, `git_stage_file`, and `git_unstage_file` inside `anar-workspace` confined to `WorkspaceScope`.
- **Consequences:** Terminal sessions run only when the Terminal tab is active, and all search and Git operations stay strictly scoped to the opened workspace root.



