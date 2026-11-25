# Anar - Rustlang Editor

An open-source desktop code editor built specifically for Rust, powered by **Tauri 2**, **React**, **CodeMirror 6**, **rust-analyzer**, and **Rusturbo**.

> **Status:** `v0.2.0` — Full Rust IDE workbench (CodeMirror 6 editor, `rust-analyzer` LSP, Cargo / Rusturbo / standalone `rustc` runner, framework detection & scaffolding, workspace search, Git status/diff/staging, integrated PTY terminal, and Dark/Light/System themes).
> See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), and [`docs/rusturbo-integration.md`](docs/rusturbo-integration.md).

## Key Features

- **Workspace & CodeMirror 6 Editor:** Scoped folder explorer with file/directory CRUD, external `notify` file-change watcher with self-save suppression, recent workspaces, multi-file tabs, imperative per-tab `EditorState` caching, and `>= 1 MiB` large-file tuning.
- **`rust-analyzer` Language Intelligence:** Automatic `rust-analyzer` lifecycle with bounded crash recovery, inline diagnostics, completions, hover tooltips, `F12` / `Ctrl/Cmd+Click` Go-to-Definition, and `Shift+Alt+F` formatting.
- **Build, Run, Check & Test Pipeline:** Streaming output with interactive `stdin`, clickable **Problems** diagnostics, cross-platform process-tree termination, automatic fallback to **`rustc --error-format=json`** for standalone `.rs` folders without a `Cargo.toml`, and Windows `CREATE_NO_WINDOW` suppression for background tools.
- **Rusturbo Integration:** Switch between `Cargo` and `Rusturbo` backends, inspect `rusturbo.toml`, run `rusturbo init` and `rusturbo analyze --json`, and detect broken wrapper installations accurately.
- **Framework Detection & Templates:** Auto-detects `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, and `clap` with tailored run profiles and 11 built-in project templates.
- **Search, Git & Integrated PTY Terminal:** Workspace text and fuzzy file search, Git status / unified diff / stage / unstage controls, and a real cross-platform interactive PTY terminal (`portable-pty` + `@xterm/xterm`).
- **Adaptive Desktop Workbench:** Dark, Light, and System themes, smooth resizable panels, `Ctrl/Cmd` zoom scaling, and responsive layout down to `420x360`.

## Architecture Overview

```text
anar/
├─ Cargo.toml                 # Cargo workspace (v0.2.0)
├─ crates/
│  ├─ anar-core/              # Project model, preferences, shared types & Windows process flags (no Tauri deps)
│  ├─ anar-lsp/               # rust-analyzer lifecycle & JSON-RPC 2.0 stdio bridge
│  ├─ anar-runner/            # Build/run pipeline (Cargo + Rusturbo + standalone rustc) & PTY manager
│  ├─ anar-workspace/         # Scoped filesystem, watcher, search & git helpers
│  └─ anar-frameworks/        # Framework detection, templates & run profiles
├─ apps/desktop/              # Tauri 2 + React + TypeScript + Vite + Tailwind CSS v4
└─ docs/                      # Architecture, Rusturbo research, ADRs & issue status
```

## Prerequisites

- **Rust:** 1.77+ (`rustup`, `cargo`, `clippy`, `rustfmt`)
- **Node.js:** 20+ and `npm`
- **Optional Tools:** `rust-analyzer` (LSP intelligence), `rusturbo` (fast Cargo wrapper), `git` (Source Control panel)
- **Tauri 2 OS dependencies:** See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) (on Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`, `libxdo-dev`).

## Development & Building

```bash
# Install frontend dependencies
cd apps/desktop
npm install

# Run desktop app in development mode
npm run tauri dev

# Build a release desktop binary (outputs target/release/anar-desktop or anar-desktop.exe)
npm run tauri build -- --no-bundle
```

## Quality Gates

Every pull request runs the full Rust and frontend quality gates across Linux, macOS, and Windows:

```bash
# Frontend (from apps/desktop)
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build

# Rust (from repo root, after `npm run build` in apps/desktop)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
```

## Contributing, Releases & Security

- Contribution workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- GitHub Releases: [`the-golden-army/Anar-IDE/releases`](https://github.com/the-golden-army/Anar-IDE/releases)
- Security policy: [`SECURITY.md`](SECURITY.md)
- License: [`LICENSE`](LICENSE) (MIT)
