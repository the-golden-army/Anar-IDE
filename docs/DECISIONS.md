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


