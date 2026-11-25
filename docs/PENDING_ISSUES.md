# Tracked Issues & Release Notes Status

> **Status (`v0.2.0`):** All Phase 1–3 tracked GitHub issues (`#3`–`#15`, `#17`, `#18`) in `the-golden-army/Anar-IDE` have been resolved and closed across Phases 2–8 and PRs `#19`–`#28`.

## Closed Historical Issues (`#3`–`#18`)

- `#3` — Rusturbo buffers and discards Cargo stdout (`v0.2.0` uses Cargo fallback for `check`/`test` & `rustc` stderr parser)
- `#4` — Rusturbo lacks `check` and `test` subcommands (handled via Cargo fallback in `anar-runner`)
- `#5` — Rusturbo `profile.jobs` forwarding (documented in `docs/rusturbo-integration.md`)
- `#6`, `#7` — Rusturbo live execution & broken wrapper shim detection (`available: binary.is_some() && version.is_some()`)
- `#8`, `#15`, `#17` — Desktop WebView shell, theme persistence, folder dialog, watcher, and large-file editing verification
- `#9` — Reproducible `Cargo.lock` note (tracked in `docs/ARCHITECTURE.md`)
- `#10` — Cross-platform process-tree termination (`process_group` + `kill` on Unix, `taskkill /T /F` on Windows)
- `#11` — CodeMirror 6 and LSP 1 MiB large-file tuning
- `#12` — `rust-analyzer` crash recovery, indexing status, and restart controls
- `#13` — Framework detection (`axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, `clap`) & run profiles
- `#14` — Cross-platform PTY (`portable-pty` + `@xterm/xterm`) and Windows ConPTY cleanup
- `#18` — Confirmation prompts before deleting workspace entries or discarding dirty tabs

## Remaining Operational Notes

- **Prebuilt binary releases:** GitHub Releases currently provide source tags (`v0.0.1` through `v0.2.0`); desktop binaries (`anar-desktop.exe`, `.dmg`, `.AppImage`) are built via `cd apps/desktop && npm run tauri build`.
- **`Cargo.lock`:** Not committed in the repository (`cargo build` / `cargo test` resolves dependencies cleanly from `Cargo.toml`).
