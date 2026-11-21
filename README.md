# Anar - Rustlang Editor

An open-source desktop code editor built specifically for Rust, powered by **Tauri 2**, **React**, **CodeMirror 6**, **rust-analyzer**, and **Rusturbo**.

> **Status:** `v0.1.0` — Phase 3 (Files & Editor).
> See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/rusturbo-integration.md`](docs/rusturbo-integration.md).

## Architecture Overview

```text
anar/
├─ Cargo.toml                 # Cargo workspace
├─ crates/
│  ├─ anar-core/              # Project model & shared types (no Tauri deps)
│  ├─ anar-lsp/               # rust-analyzer lifecycle & JSON-RPC bridge
│  ├─ anar-runner/            # Build/run pipeline (Cargo + Rusturbo)
│  ├─ anar-workspace/         # Scoped filesystem, watcher, search, git
│  └─ anar-frameworks/        # Framework detection, templates, run profiles
├─ apps/desktop/              # Tauri 2 + React + TypeScript + Vite + Tailwind CSS
└─ docs/                      # Architecture, Rusturbo research, ADRs
```

## Prerequisites

- **Rust:** 1.77+ (`rustup`, `cargo`, `clippy`, `rustfmt`)
- **Node.js:** 20+ and `npm`
- **Tauri 2 OS dependencies:** See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) (on Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`, `libxdo-dev`).

## Development

```bash
# Install frontend dependencies
cd apps/desktop
npm install

# Run desktop app in development mode
npm run tauri dev
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

## Contributing & Security

- Contribution workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- License: [`LICENSE`](LICENSE) (MIT)
