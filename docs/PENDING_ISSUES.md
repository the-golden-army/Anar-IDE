# Phase 1 Issues Status

> **Resolved:** GitHub `issues=write` permission was enabled at the start of Phase 2, and all 12 Phase 1 items below were filed as live GitHub issues (`#3`–`#14`). Phase 2 verification items are filed as `#15`.

- `#3` — Rusturbo buffers and discards Cargo stdout, breaking live `--message-format=json` diagnostics
- `#4` — Rusturbo lacks `check` and `test` subcommands
- `#5` — Rusturbo `profile.jobs` is computed and persisted but never forwarded to Cargo
- `#6` — Verify Rusturbo shared-target hard links on Windows NTFS and non-Linux benchmark support
- `#7` — Verify `rusturbo` binary execution in live environment
- `#8` — Verify interactive `npm run tauri dev` window launch on Linux, macOS, and Windows
- `#9` — Generate and commit `Cargo.lock` for reproducible `--locked` CI and release builds
- `#10` — Cross-platform process-group termination needed to stop spawned servers and infinite loops
- `#11` — Ensure CodeMirror 6 and LSP sync remain responsive on 5 MB+ Rust files
- `#12` — Design `rust-analyzer` crash recovery, indexing progress, and memory bounds for large workspaces
- `#13` — Diverse framework toolchains (`dx`, `trunk`, `cargo-tauri`) require custom run profiles
- `#14` — Verify Linux WebKitGTK / Wayland rendering and cross-platform PTY compatibility
- `#15` — Verify Phase 2 theme persistence, OS system-theme sync, and small-window resizing in live Tauri WebView
