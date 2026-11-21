# Contributing to Anar

Thank you for contributing to **Anar**!

## Development Workflow

1. **Branching:** Create a focused feature branch from `main`.
2. **Commits:** Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`).
3. **Issues:** Reference related GitHub issue numbers in commit messages and pull requests (`Refs #12`, `Closes #12`). Every known bug, missing feature, risk, or unverified behavior must be tracked as a GitHub issue.
4. **Rust-first logic:** Keep business logic in `crates/anar-*` with unit tests. Keep `apps/desktop/src/` thin.
5. **No Tauri in core crates:** `crates/anar-core` (and domain crates where possible) must never depend on `tauri`.
6. **Cross-platform:** Avoid hardcoded paths or shell invocations (`sh -c`, `cmd /C`).

## Quality Gates (Required Before PR)

Run all frontend checks in `apps/desktop/`:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Run all Rust checks from the repository root:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
```
