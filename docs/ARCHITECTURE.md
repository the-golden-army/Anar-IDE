# Anar Architecture

> **Current Status (`v0.2.0`):** Phases 1–8, the `v2.3.0` UI redesign, Windows `CREATE_NO_WINDOW` console suppression, and standalone `.rs` (`rustc`) execution fallback are implemented and verified across `ubuntu-latest`, `macos-latest`, and `windows-latest` CI runners.

---

## 1. Design Principles

1. **Thin React frontend, Rust-first core:** Business logic, process supervision, LSP framing, file watching, search, Git queries, and framework detection live in pure-Rust workspace crates with unit/integration tests. The React + TypeScript frontend handles layout, CodeMirror 6 rendering, xterm.js display, and user interaction.
2. **Tauri-free domain crates:** Only `apps/desktop/src-tauri` depends on `tauri`. All five library crates under `crates/` compile and test standalone without a WebView or GUI runtime.
3. **Cross-platform by construction:** No hardcoded POSIX paths or shell invocations (`/bin/sh`, `cmd.exe`). All external commands (`cargo`, `rusturbo`, `rustc`, `rust-analyzer`, `git`) use explicit argv vectors (`std::process::Command`) configured via `anar_core::configure_background_command` (`CREATE_NO_WINDOW` on Windows).
4. **Least-privilege security:** Scoped workspace filesystem access, minimal Tauri 2 capabilities (`core:default` + `dialog:default`), and zero unrestricted shell execution from the webview.

---

## 2. Workspace Structure & Crate Responsibilities

```text
anar/
├─ Cargo.toml                 # [workspace] (resolver = "2", v0.2.0)
├─ crates/
│  ├─ anar-core/              # Shared domain model, preferences, diagnostics, Windows process flags (no Tauri deps)
│  ├─ anar-lsp/               # rust-analyzer lifecycle + JSON-RPC 2.0 stdio bridge
│  ├─ anar-runner/            # Build/Run/Check/Test pipeline (Cargo + Rusturbo + standalone rustc) & PTY manager
│  ├─ anar-workspace/         # Scoped FS, watcher, search, git operations
│  └─ anar-frameworks/        # Framework detection, templates, run profiles
├─ apps/
│  └─ desktop/                # Vite + React + TypeScript + Tailwind v4 + Tauri 2 shell
│     ├─ src/                 # Frontend UI (CodeMirror 6, xterm.js)
│     └─ src-tauri/           # Tauri binary crate (anar-desktop): IPC, state, capabilities
└─ docs/
```

### Crate Responsibilities

| Crate | Responsibilities | Key Dependencies |
|---|---|---|
| `anar-core` | Project/workspace metadata types, persistent theme/layout/recent-workspace/compiler-backend preferences (`preferences` module), diagnostic model (`DiagnosticItem`, `DiagnosticSpan`, `DiagnosticSeverity`), compiler backend enum (`Cargo`, `Rusturbo`), `configure_background_command`, and typed error definitions. **Never depends on `tauri`.** | `serde`, `serde_json` |
| `anar-workspace` | Canonical path containment (`WorkspaceScope`), directory tree listing, atomic file reads/writes with large-file guard, debounced external `notify` watcher with self-save suppression, workspace text/fuzzy-file search, and Git status/diff/stage/unstage helpers. | `anar-core`, `notify`, `serde` |
| `anar-frameworks` | `Cargo.toml` / workspace-member / `src-tauri/Cargo.toml` / `Cargo.lock` inspection to detect `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, and `clap`; 11 built-in project scaffolding templates; framework-specific run profiles. | `anar-core`, `serde`, `serde_json` |
| `anar-runner` | Subprocess build/run/check/test/stop pipeline for `cargo`, `rusturbo`, and standalone `rustc --error-format=json`; line-buffered stdout/stderr streaming; Cargo & `rustc` JSON diagnostic parsers; process-tree termination (`kill` on Unix, `taskkill /T /F` on Windows); `rusturbo` probing & `analyze --json`; interactive `portable-pty` terminal sessions. | `anar-core`, `portable-pty`, `serde`, `serde_json` |
| `anar-lsp` | `rust-analyzer` binary discovery, child-process lifecycle, `Content-Length` JSON-RPC 2.0 framing over stdio, request/response correlation, document synchronization (`didOpen`, `didChange`, `didSave`, `didClose`), crash detection and bounded auto-restart with open-document replay. | `anar-core`, `serde`, `serde_json` |
| `apps/desktop/src-tauri` | Wires crate services into Tauri `State`, exposes `#[tauri::command]` handlers, bridges streams to Tauri `Channel` / events, configures Tauri 2 capabilities and window management. | `tauri` v2, `tauri-plugin-dialog`, `anar-*` |

---

## 3. Frontend / Backend Communication

Anar uses all three Tauri 2 IPC primitives according to data pattern:

### 3.1 Commands (`invoke`) — Request / Response

Used for discrete user actions that return a typed `Result<T, String>`:
- Preferences & Window: `get_preferences`, `set_theme_mode`, `update_layout_state`, `set_compiler_backend`, `is_window_fullscreen`, `toggle_window_fullscreen`
- Workspace & Git & Search: `pick_workspace_folder`, `open_workspace_folder`, `list_workspace_dir`, `read_workspace_file`, `save_workspace_file`, `create_workspace_file`, `create_workspace_dir`, `rename_workspace_entry`, `delete_workspace_entry`, `search_workspace`, `find_workspace_files`, `git_status`, `git_diff`, `git_stage_file`, `git_unstage_file`
- LSP: `lsp_get_status`, `lsp_restart`, `lsp_did_open`, `lsp_did_change`, `lsp_did_save`, `lsp_did_close`, `lsp_completion`, `lsp_hover`, `lsp_goto_definition`, `lsp_format_document`
- Runner & Rusturbo: `start_cargo_run`, `stop_cargo_run`, `send_run_stdin`, `get_rusturbo_status`, `analyze_rusturbo`, `init_rusturbo_config`
- Frameworks & Templates: `detect_workspace_frameworks`, `list_project_templates`, `pick_parent_folder`, `create_project_from_template`, `start_profile_run`
- Terminal: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`

### 3.2 Channels (`tauri::ipc::Channel<T>`) — Ordered High-Throughput Streams

Used when a specific invocation produces an ordered byte/event stream (avoids global event bus contention and preserves ordering):
- **Build/Run output stream:** `start_cargo_run(..., on_event)` and `start_profile_run(..., on_event)` stream `Started`, `Output`, `Diagnostic`, and `Finished` (`RunnerEvent`).
- **PTY output stream:** `pty_spawn(..., on_event)` streams terminal output bytes and exit events to `@xterm/xterm`.

### 3.3 Events (`app.emit`) — Asynchronous Workspace Broadcasts

Used for unsolicited backend-initiated notifications not tied to a single `invoke`:
- `lsp://diagnostics` — pushed whenever `rust-analyzer` sends `textDocument/publishDiagnostics`
- `lsp://status` — `stopped | starting | indexing | ready | unavailable | error`
- `workspace://fs-changed` — external file modifications from `notify` watcher

---

## 4. Run Pipeline (`anar-runner` + `anar-frameworks`)

```text
[UI Run/Build/Check/Test]
        │
        ▼
[find_cargo_manifest_dir(workspace_root, active_file)]
        │
        ├──▶ Cargo.toml found:
        │      ├─▶ Cargo backend (or Check/Test fallback):
        │      │     cargo build|run|check|test --message-format=json
        │      │     stdout JSON ─▶ DiagnosticItem events
        │      │     stderr / app output ─▶ live Output stream
        │      └─▶ Rusturbo backend (see docs/rusturbo-integration.md):
        │            rusturbo build|run (NO_COLOR=1)
        │            stderr ─▶ fallback rustc diagnostic parser
        │
        └──▶ No Cargo.toml found (standalone .rs folder):
               resolve active `.rs` file (or main.rs / src/main.rs / app.rs / src/app.rs)
               rustc --error-format=json
               ├─▶ Check: rustc --emit=metadata into temp dir
               ├─▶ Build: rustc -o <workspace>/<stem>{EXE_SUFFIX}
               └─▶ Run / Test: compile to temp binary (or --test), then execute with live stdin/stop
        │
        ▼
[anar_core::configure_background_command + Process Termination]
  - Windows: CREATE_NO_WINDOW (0x0800_0000) prevents flashing console windows; Stop uses `taskkill /T /F`
  - Unix: process_group(0) + SIGTERM/SIGKILL cleanup
```

---

## 5. LSP Bridge (`anar-lsp`)

```text
[CodeMirror 6] ──(debounce / user action)──▶ [Tauri Command]
                                                    │
                                                    ▼
                                            [LspManager State]
                                                    │
         ┌──────────────────────────────────────────┴─────────────────────────┐
         ▼                                                                    ▼
[Writer Thread]                                                 [Reader Thread (BufReader)]
  - serializes JSON-RPC 2.0                                       - parses Content-Length headers
  - writes `Content-Length: N\r\n\r\n<json>`                      - routes responses by `id`
  - feeds `rust-analyzer` stdin                                   - emits notifications (`publishDiagnostics`)
         │                                                                    ▲
         └──────────────────────▶ [rust-analyzer child process] ──────────────┘
```

Key lifecycle invariants:
- `didOpen` / `didChange` / `didClose` / `didSave` keep in-memory editor buffers synchronized with `rust-analyzer` using monotonically increasing document versions and a 1 MiB large-file guard.
- If `rust-analyzer` exits unexpectedly, `LspManager` emits `lsp://status`, fails pending waiters cleanly, restarts with bounded backoff, and replays open documents.

---

## 6. Security Model

1. **Minimal Tauri 2 capabilities (`apps/desktop/src-tauri/capabilities/default.json`):**
   - Enables only `core:default` and `dialog:default`. Broad webview plugins (`tauri-plugin-shell`, unrestricted `tauri-plugin-fs`) are not enabled.
2. **Workspace-scoped filesystem access:**
   - All file read/write/create/rename/delete/search commands in `anar-workspace` canonicalize paths and verify `canonical_path.starts_with(&canonical_workspace_root)` before touching disk, blocking symlink and `..` traversal escapes.
3. **No shell interpolation:**
   - Subprocesses (`cargo`, `rusturbo`, `rustc`, `rust-analyzer`, `git`, user project binaries) are spawned directly via `Command::new(exe).args(argv)` without invoking `/bin/sh` or `cmd.exe`.
   - PTY (`portable-pty`) runs the user's configured login shell only inside the sandboxed terminal panel, never accepting command strings from workspace metadata files (`Cargo.toml` / `rusturbo.toml`).
4. **Content Security Policy (CSP):**
   - Configured in `tauri.conf.json` to disallow remote script execution (`default-src 'self'; style-src 'self' 'unsafe-inline'`).

---

## 7. Tracked Risks & Environment Notes

Issues `#3`–`#18` in `the-golden-army/Anar-IDE` were filed and resolved across Phases 2–8 (`docs/PENDING_ISSUES.md`). Remaining operational notes:

1. **Headless sandbox vs. live desktop GUI:** Automated CI verifies ESLint, Prettier, `tsc --noEmit`, Vitest, Vite build, `cargo fmt`, `cargo clippy -- -D warnings`, and `cargo test` across Linux, macOS, and Windows, while interactive WebView window behavior is verified by maintainers on desktop targets.
2. **Missing `Cargo.lock` in repository:** `Cargo.lock` is not committed in the headless CI-only workflow (`--locked` builds require generating `Cargo.lock` locally with Cargo).
3. **GitHub Releases ship source tags (no automated release binaries yet):** Windows/macOS/Linux installers or `anar-desktop.exe` are built locally with `npm run tauri build` until a release-binary workflow is added.
