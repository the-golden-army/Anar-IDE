# Changelog

All notable changes to **Anar** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-11-21

### Added

- Cargo workspace structure with five domain crates (`anar-core`, `anar-lsp`, `anar-runner`, `anar-workspace`, `anar-frameworks`) and unit tests.
- Tauri 2 + React + TypeScript + Vite + Tailwind CSS desktop shell in `apps/desktop`.
- Rusturbo integration research (`docs/rusturbo-integration.md`), system architecture (`docs/ARCHITECTURE.md`), and engineering decisions log (`docs/DECISIONS.md`).
- Repository hygiene files (`README.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, `.gitignore`, `.editorconfig`, `rustfmt.toml`, issue/PR templates).
- GitHub Actions CI workflow running frontend and Rust quality gates across Linux, macOS, and Windows.

[0.0.1]: https://github.com/Nour-yahyaoui/anar/releases/tag/v0.0.1
