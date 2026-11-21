# Anar Architecture

> **Phase 2 Status:** `v0.1.0-alpha.1` implements the Phase 2 app shell, semantic design tokens, `dark`/`light`/`system` themes, responsive panel layout, and Rust-backed preferences persistence (`anar-core::preferences` + Tauri commands). Items marked as planned for Phases 3–9 remain unimplemented.

---

## 1. Design Principles

1. **Thin React frontend, Rust-first core:** Business logic, process supervision, LSP framing, file watching, search, and framework detection live in pure-Rust workspace crates with unit/integration tests. The React + TypeScript frontend handles layout, CodeMirror 6 rendering, xterm.js display, and user interaction.
2. **Tauri-free domain crates:** Only `apps/desktop/src-tauri` depends on `tauri`. All five library crates under `crates/` compile and test standalone without a WebView or GUI runtime.
3. **Cross-platform by construction:** No hardcoded POSIX paths or shell invocations (`/bin/sh`, `cmd.exe`). All external commands (`cargo`, `rusturbo`, `rust-analyzer`, `git`) use explicit argv vectors (`std::process::Command` / `tokio::process::Command`).
4. **Least-privilege security:** Scoped workspace filesystem access, minimal Tauri 2 capabilities, and zero unrestricted shell execution from the webview.

---

## 2. Workspace Structure & Crate Responsibilities

```text
anar/
├─ Cargo.toml                 # [workspace] (resolver = "2")
├─ crates/
│  ├─ anar-core/              # Shared domain model, types, errors, config (no Tauri deps)
│  ├─ anar-lsp/               # rust-analyzer lifecycle + JSON-RPC 2.0 stdio bridge
│  ├─ anar-runner/            # Build/Run/Check/Test pipeline (Cargo + Rusturbo)
│  ├─ anar-workspace/         # Scoped FS, watcher, search, git operations
│  └─ anar-frameworks/        # Framework detection, templates, run profiles
├─ apps/
│  └─ desktop/                # Vite + React + TypeScript + Tailwind + Tauri 2 shell
│     ├─ src/                 # Frontend UI (CodeMirror 6, xterm.js added in later phases)
│     └─ src-tauri/           # Tauri binary crate (anar-desktop): IPC, state, capabilities
└─ docs/
```

### Crate Responsibilities

| Crate | Planned Responsibilities | Key Dependencies (Planned) |
|---|---|---|
| `anar-core` | Project/workspace metadata types, persistent theme & layout preferences (`preferences` module), diagnostic model (`Diagnostic`, `Span`, `Severity`), compiler backend enum (`Cargo`, `Rusturbo`), typed error definitions. **Must never depend on `tauri`.** | `serde`, `serde_json` |
| `anar-workspace` | Canonical path containment (preventing path traversal outside opened workspace), atomic file reads/writes, external file change watcher, ripgrep-style text/fuzzy search, Git status/diff queries. | `anar-core`, `notify`, `ignore` (later phases) |
| `anar-frameworks` | `Cargo.toml` / `Cargo.lock` inspection to detect `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, `clap`; project scaffolding templates; framework-specific run profiles (e.g., `dx serve`, `trunk serve`, server ports, health/ready hints). | `anar-core`, `toml` (later phases) |
| `anar-runner` | Subprocess build/run/check/test/stop pipeline for both `cargo` and `rusturbo`; line-buffered stdout/stderr streaming; Cargo JSON diagnostic parser (`--message-format=json`); process-tree termination for long-running servers or infinite loops. | `anar-core`, `tokio` (later phases) |
| `anar-lsp` | `rust-analyzer` binary discovery, child-process lifecycle, `Content-Length` JSON-RPC 2.0 framing over stdio (`tokio`), request/response correlation, cancellation, crash detection and bounded restart backoff. | `anar-core`, `tokio`, `lsp-types` (later phases) |
| `apps/desktop/src-tauri` | Wires crate services into Tauri `State`, exposes `#[tauri::command]` handlers, bridges streams to Tauri `Channel` / events, configures Tauri 2 capabilities and window management. | `tauri` v2, `anar-*` |

---

## 3. Frontend / Backend Communication

Anar uses all three Tauri 2 IPC primitives according to data pattern:

### 3.1 Commands (`invoke`) — Request / Response

Used for discrete user actions that return a typed `Result<T, SerializableError>`:
- Preferences (Phase 2): `get_preferences`, `set_theme_mode`, `update_layout_state`
- Workspace: `open_workspace`, `read_file`, `write_file`, `list_tree`, `search_files`, `git_status`
- LSP: `lsp_completion`, `lsp_hover`, `lsp_goto_definition`, `lsp_references`, `lsp_rename`, `lsp_format`
- Runner: `start_run`, `stop_run`, `detect_frameworks`, `list_run_profiles`
- Terminal: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`

### 3.2 Channels (`tauri::ipc::Channel<T>`) — Ordered High-Throughput Streams

Used when a specific invocation produces an ordered byte/line stream (avoids global event bus contention and preserves ordering):
- **Build/Run output stream:** `start_run(..., on_event: Channel<RunnerEvent>)` streams `StdoutLine`, `StderrLine`, `Diagnostic`, `StateChanged`, and `Exited`.
- **PTY output stream:** `pty_spawn(..., on_data: Channel<Vec<u8>>)` streams raw terminal bytes to `xterm.js`.
- **Search results stream:** Streams incremental file/text matches for large repositories.

### 3.3 Events (`app.emit`) — Asynchronous Workspace Broadcasts

Used for unsolicited backend-initiated notifications not tied to a single `invoke`:
- `lsp://diagnostics` — pushed whenever `rust-analyzer` sends `textDocument/publishDiagnostics`
- `lsp://status` — `starting | indexing | ready | crashed | restarted`
- `workspace://fs-changed` — external file modifications from `notify` watcher

---

## 4. Run Pipeline (`anar-runner` + `anar-frameworks`)

```text
[UI Run/Check/Test]
        │
        ▼
[anar-frameworks] ──▶ resolves FrameworkKind + RunProfile (args, env, readiness hint)
        │
        ▼
[anar-runner] ──▶ selects CompilerBackend (Cargo | Rusturbo)
        │
        ├──▶ Cargo backend:
        │      cargo build|run|check|test --message-format=json-diagnostic-rendered-ansi
        │      stdout = JSON artifacts & diagnostics ─▶ parsed into Diagnostic structs
        │      stderr = Cargo progress / user binary output ─▶ streamed to console
        │
        └──▶ Rusturbo backend (see docs/rusturbo-integration.md):
               rusturbo build|run [--profile ...] [--cargo-arg ...] [-- <app_args>]
               note: rusturbo buffers/discards stdout, so structured diagnostics
                     require fallback or separate `cargo check --message-format=json`
        │
        ▼
[ProcessSupervisor] ──▶ tracks PID / process group (Unix setsid/PGID, Windows Job Object)
                        enables reliable Stop on servers & infinite loops
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
[Writer Task (tokio::mpsc)]                                     [Reader Task (BufReader)]
  - serializes JSON-RPC 2.0                                       - parses Content-Length headers
  - writes `Content-Length: N\r\n\r\n<json>`                      - routes responses by `id` via oneshot
  - feeds `rust-analyzer` stdin                                   - emits notifications (`publishDiagnostics`)
         │                                                                    ▲
         └──────────────────────▶ [rust-analyzer child process] ──────────────┘
```

Key lifecycle invariants:
- `didOpen` / `didChange` / `didClose` / `didSave` keep in-memory editor buffers synchronized with `rust-analyzer` using monotonically increasing document versions.
- If `rust-analyzer` exits unexpectedly, `LspManager` notifies the frontend (`lsp://status = crashed`), clears pending `oneshot` waiters with a structured error, restarts with bounded exponential backoff, and replays open documents.

---

## 6. Security Model

1. **Minimal Tauri 2 capabilities (`apps/desktop/src-tauri/capabilities/default.json`):**
   - Phase 1 enables only `core:default` (window/app core permissions). No arbitrary shell plugin (`tauri-plugin-shell`) with broad scopes will ever be enabled for the webview.
2. **Workspace-scoped filesystem access:**
   - All file read/write commands in `anar-workspace` canonicalize paths and verify `canonical_path.starts_with(&canonical_workspace_root)` before touching disk, blocking symlink and `..` traversal escapes.
3. **No shell interpolation:**
   - Subprocesses (`cargo`, `rusturbo`, `rust-analyzer`, `git`, user project binaries) are spawned directly via `Command::new(exe).args(argv)` without invoking `/bin/sh` or `cmd.exe`.
   - PTY (`portable-pty` in Phase 8) runs an explicit user-configured login shell only inside the sandboxed terminal panel, never accepting hidden command injection from workspace metadata files (`Cargo.toml` / `rusturbo.toml`).
4. **Content Security Policy (CSP):**
   - Configured in `tauri.conf.json` to disallow remote script execution (`default-src 'self'`).

---

## 7. Foreseen Risks & Unknowns

Each risk below is tracked as a GitHub issue in `Nour-yahyaoui/anar`:

1. **Local Rust/Tauri verification gap in bootstrap sandbox:** The Phase 1 development sandbox lacks `rustc`, `cargo`, WebKit2GTK, a display server, and `crates.io` network access. Rust compilation, tests, and `npm run tauri dev` window opening cannot be verified locally in this environment (CI on GitHub Actions verifies build/clippy/tests across Linux, macOS, and Windows; interactive window opening remains unverified).
2. **Missing `Cargo.lock` until generated with Cargo access:** Reproducible `--locked` builds require a generated `Cargo.lock` once an environment with Cargo + `crates.io` creates it.
3. **Rusturbo stdout buffering/discard breaks `--message-format=json`:** Verified in `../Rusturbo/src/process.rs` and `src/main.rs` (see `docs/rusturbo-integration.md`).
4. **Rusturbo lacks `check`/`test` subcommands and ignores `profile.jobs` during `build`/`run`:** Requires fallback/workaround in `anar-runner`.
5. **Cross-platform process-tree termination:** Stopping a spawned web server or infinite loop (`cargo run` -> child binary, or `rusturbo run` -> child binary) requires Unix process groups (`killpg`) and Windows Job Objects (`AssignProcessToJobObject`) so child processes are not orphaned.
6. **Large-file UI responsiveness (5 MB+ Rust files):** CodeMirror 6 viewport virtualization vs. synchronous Rust syntax/LSP `didChange` payloads could freeze the webview or saturate `rust-analyzer` if not debounced/bounded.
7. **`rust-analyzer` startup/memory overhead and crash recovery:** Large workspaces (e.g., `bevy`, `tauri`) consume significant RAM and time during initial proc-macro/build-script indexing.
8. **Framework run-profile diversity:** Web/WASM frameworks (`dioxus`, `leptos`, `yew`) and GUI/game frameworks (`tauri`, `bevy`) have different CLI tools (`dx`, `trunk`, `cargo-tauri`), stdout readiness markers, and port bindings compared to `axum`/`actix-web`/`rocket`.
9. **PTY (`portable-pty`) Windows ConPTY vs. Unix PTY differences:** Terminal resize, CRLF translation, and signal delivery differ across Windows ConPTY, macOS, and Linux.
10. **Linux WebKitGTK / Wayland rendering & sandbox quirks:** Tauri 2 on Linux depends on `webkit2gtk-4.1` and can encounter blank rendering or GPU/DMA-BUF issues on certain Wayland/Nvidia setups.
