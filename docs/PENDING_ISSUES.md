# Pending GitHub Issues (Phase 1 Risks & Unknowns)

> **Why this file exists:** Running `gh issue create` in the Phase 1 sandbox returned `HTTP 403 Forbidden (Resource not accessible by integration)` with `X-Accepted-Github-Permissions: issues=write` (see `docs/DECISIONS.md` ADR-006). Every risk, unknown, and unverified check from Tasks 1 & 2 is documented below and ready to file once `issues=write` is granted.

---

## 1. Rusturbo buffers and discards Cargo stdout, breaking live `--message-format=json` diagnostics
- **Labels:** `rusturbo`, `bug`
- **Source:** `docs/rusturbo-integration.md` (verified in `../Rusturbo/src/process.rs:148-174` & `src/main.rs`)
- **Expected vs Actual:** Passing `--cargo-arg=--message-format=json` should stream structured diagnostics live on stdout; instead `capture_streaming` buffers stdout until exit and `cmd_build` discards it.

## 2. Rusturbo lacks `check` and `test` subcommands
- **Labels:** `rusturbo`, `feature`
- **Source:** `docs/rusturbo-integration.md` (verified in `../Rusturbo/src/main.rs`)
- **Expected vs Actual:** Runner backend should support `check` and `test`; `rusturbo` hardcodes `build` or `run`.

## 3. Rusturbo `profile.jobs` is computed and persisted but never forwarded to Cargo
- **Labels:** `rusturbo`, `bug`
- **Source:** `docs/rusturbo-integration.md` (verified in `../Rusturbo/src/main.rs`, `src/config.rs`)
- **Expected vs Actual:** `rusturbo optimize` pins `profile.jobs` and `cmd_build` prints `jobs: N`, but neither `-j` nor `CARGO_BUILD_JOBS` is passed to `cargo`.

## 4. Verify Rusturbo shared-target hard links on Windows NTFS and non-Linux benchmark support
- **Labels:** `rusturbo`, `blocked`
- **Source:** `docs/rusturbo-integration.md`, `../Rusturbo/docs/DESIGN.md`, `../Rusturbo/src/benchmark.rs`
- **Expected vs Actual:** Real Windows shared-target NTFS behavior and non-Linux `/proc` metrics are unverified.

## 5. `rusturbo` could not be compiled or executed in Phase 1 sandbox
- **Labels:** `rusturbo`, `blocked`
- **Source:** `docs/rusturbo-integration.md`
- **Expected vs Actual:** Live invocation of `rusturbo init`, `analyze --json`, `build`, and `run` could not be verified locally because the sandbox lacks `rustc`/`cargo` and `crates.io` access.

## 6. Verify interactive `npm run tauri dev` window launch on Linux, macOS, and Windows
- **Labels:** `ci`, `blocked`
- **Source:** `docs/ARCHITECTURE.md`
- **Expected vs Actual:** `npm run tauri dev` should open the desktop window; unverified in headless sandbox (no display, no WebKit2GTK, no `rustc`/`cargo`).

## 7. Generate and commit `Cargo.lock` for reproducible `--locked` CI and release builds
- **Labels:** `ci`, `good first issue`
- **Source:** `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (ADR-004)
- **Expected vs Actual:** `Cargo.lock` should be committed for reproducible builds; deferred because sandbox lacks `cargo` and `crates.io`.

## 8. Cross-platform process-group termination for spawned servers and infinite loops
- **Labels:** `feature`, `frameworks`
- **Source:** `docs/ARCHITECTURE.md` (Section 4 & 7)
- **Risk:** Stopping `cargo run` or `rusturbo run` via child PID alone can orphan grandchild server processes on Unix/Windows; requires process groups (`killpg`) and Windows Job Objects.

## 9. Keep CodeMirror 6 and `rust-analyzer` sync responsive on 5 MB+ Rust files
- **Labels:** `ui`, `rust-analyzer`
- **Source:** `docs/ARCHITECTURE.md` (Section 7)
- **Risk:** Large files can stall WebView rendering or saturate `didChange` LSP traffic if not debounced/bounded.

## 10. Design `rust-analyzer` crash recovery, indexing progress, and memory bounds
- **Labels:** `rust-analyzer`, `feature`
- **Source:** `docs/ARCHITECTURE.md` (Section 5 & 7)
- **Risk:** Large workspaces (`bevy`, `tauri`) trigger heavy proc-macro memory usage and unexpected LSP exits requiring bounded restart backoff and document replay.

## 11. Diverse framework toolchains (`dx`, `trunk`, `cargo-tauri`) require custom run profiles
- **Labels:** `frameworks`, `feature`
- **Source:** `docs/ARCHITECTURE.md` (Section 7)
- **Risk:** Web/WASM and desktop frameworks differ from HTTP servers in CLI wrappers, dev ports, and readiness signals.

## 12. Verify Linux WebKitGTK / Wayland rendering and cross-platform PTY (`portable-pty`) behavior
- **Labels:** `ui`, `bug`
- **Source:** `docs/ARCHITECTURE.md` (Section 7)
- **Risk:** WebKitGTK 4.1 DMA-BUF rendering on Linux Wayland/Nvidia and Windows ConPTY resize/CRLF handling need per-OS validation.
