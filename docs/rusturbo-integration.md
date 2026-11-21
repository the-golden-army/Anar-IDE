# Rusturbo Integration Analysis

> **Scope & Verification Status:** Every factual claim in Sections 1–5 below was verified directly by reading the upstream repository [`the-golden-army/Rusturbo`](https://github.com/the-golden-army/Rusturbo) (checked out at `../Rusturbo`, version `0.1.2`, `Cargo.toml`, `README.md`, `docs/DESIGN.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `packaging/npm/package.json`, and `src/*.rs`). Nothing in `../Rusturbo` was compiled or executed in this sandbox because `rustc`/`cargo` and `crates.io` are not available locally; runtime unknowns and platform gaps are explicitly listed in Section 6.

---

## 1. What Rusturbo Is (Verified)

**Rusturbo** (package name `rusturbo`, branded **RustTurbo**, current version `0.1.2`, MIT license, MSRV Rust `1.74`, edition `2021`) is an **external Cargo compilation accelerator CLI** — **not** a standalone `rustc` replacement or independent compiler front-end.

Its core responsibilities, as implemented in `src/*.rs`, are:

1. **Dependency-graph analysis (`src/metadata.rs`, `src/planner.rs`):** Shells out to `cargo metadata` (via `cargo_metadata = "0.18"`), computes heuristic compile-cost weights, critical path, parallel build waves, duplicate crate versions, broad features (e.g., `tokio/full`), and `actix-web` dependency classification.
2. **Fingerprinted dependency artifact caching (`src/fingerprint.rs`, `src/cache.rs`, `src/cacheops.rs`):** Computes a domain-separated SHA-256 cache key (`rusturbo-artifact-v1`) and reuses dependency build products across rebuilds and across separate projects with matching dependency graphs.
3. **Profile presets without manifest mutation (`src/presets.rs`):** Translates `balanced`, `fastest`, `safe`, and Actix-tuned dependency `debug=0` rules into `cargo --config ...` CLI arguments without modifying `Cargo.toml`.
4. **Linker selection (`src/hardware.rs`):** Probes `mold` and `lld` (including `rust-lld` in sysroot) by test-linking a small C file with `$CC -fuse-ld=...`, then injects `-C link-arg=-fuse-ld=<linker>` into `RUSTFLAGS` on supported ELF/Apple targets (refused on MSVC and `wasm32`).
5. **Optional `sccache` wrapping (`src/hardware.rs`, `src/main.rs`):** Sets `RUSTC_WRAPPER` to `sccache` when installed and configured (`auto` or `on`).
6. **Hardware-aware benchmarking (`src/benchmark.rs`):** Runs up to five compilation/startup scenarios and samples `/proc` every 100 ms for peak RSS and CPU seconds.

### Correctness Contract (`README.md`, `src/presets.rs`)

- **Never edits `Cargo.toml`:** All profile overrides are passed via `cargo --config`.
- **Never alters `opt-level`, `lto`, or `panic`:** Enforced by unit test `presets::tests::dev_args_never_touch_opt_level`. Release builds only trim debuginfo (`profile.release.debug`).
- **Argv-only process invocation (`src/process.rs`):** No shell (`sh -c` / `cmd /C`) is ever used.

---

## 2. Installation & CLI Surface (Verified)

### Installation Methods (`README.md`, `packaging/npm/package.json`)

- From Cargo/Git: `cargo install --git https://github.com/the-golden-army/Rusturbo --locked` (or `cargo install --path .`).
- From npm: `npm install -g rusturbo` (downloads the matching GitHub Release binary via `install.js`; npm 12+ blocks `postinstall` by default and requires `--allow-scripts=rusturbo` or running the `rusturbo:install` script).
- Required host tools: Rust `1.74+` and `cargo`. Optional: `sccache`, `mold`, or `lld`.

### CLI Flags & Subcommands (`src/main.rs`)

Global flags:

- `--manifest-dir <DIR>`: Cargo project root (defaults to current working directory; requires `<DIR>/Cargo.toml`).
- `--quiet` / `-q`: Suppress progress output.
- `--version` / `--help`.

Subcommands:

| Subcommand | Flags | Purpose |
|---|---|---|
| `init` | `--preset <auto\|actix>`, `--force`, `--profile <balanced\|fastest\|safe>`, `--dry-run` | Writes `rusturbo.toml`; auto-detects `actix-web`. |
| `analyze` | `--json`, `--dev`, `--output <FILE>` | Hardware, toolchain, linker, graph, critical path, recommendations, cache hit/miss prediction. |
| `optimize` | `--dry-run` | Updates `rusturbo.toml` with Actix preset and RAM-capped `jobs` (note: see Section 6 regarding `jobs`). |
| `build` | `--profile <dev\|release>`, `--bin <NAME>`, `--no-cache`, `--dry-run`, `--explain`, `--cargo-arg <ARG>` | Accelerated `cargo build`. |
| `run` | Same as `build`, plus `-- <PROGRAM_ARG>...` | Accelerated `cargo run` (or `cargo build` + direct binary `exec` when `<PROGRAM_ARG>` is non-empty). |
| `benchmark` | `--scenarios <list\|all>`, `--out <DIR>`, `--isolated-cargo-home`, `--app-arg <ARG>`, `--skip-cold` | Runs real cold/warm scenarios; outputs `report.json` and `report.md`. |
| `clean` | `--target`, `--cache`, `--all` | Removes project `target/` and/or RustTurbo cache. |
| `host` (hidden) | trailing args | Internal proxy marker referenced by help docs. |

**Important CLI constraints observed in `src/main.rs`:**

- `rusturbo` does **not** expose `check`, `test`, `clippy`, or `doc` subcommands.
- `--cargo-arg <ARG>` must appear **before** `--`; anything after `--` is captured as `program_args`.
- Because `cmd_build` hardcodes `"run"` or `"build"` as the first Cargo argument (`src/main.rs:487`), `--cargo-arg` cannot substitute a different Cargo subcommand cleanly.

### Configuration (`rusturbo.toml`, `src/config.rs`)

`Config` uses `#[serde(default, deny_unknown_fields)]`, so unknown keys fail parsing loudly:

- `[profile]`: `preset` (`"balanced"` | `"fastest"` | `"safe"`), `dep_debug` (`0..=2`), `debug` (`0..=2`), `jobs` (`0` = auto), `incremental` (`bool`), `parallel_codegen` (`bool`).
- `[cache]`: `enabled`, `dir` (`""` -> `$RUSTURBO_CACHE_DIR` -> `$XDG_CACHE_HOME/rusturbo` -> `~/.cache/rusturbo` or `%USERPROFILE%\.cache\rusturbo`), `shared_targets` (`bool`), `max_size_gb`, `sccache` (`"auto"` | `"on"` | `"off"`), `build_scripts` (`"strict"` | `"warn"` | `"off"`).
- `[linker]`: `mode` (`"auto"` | `"default"` | `"lld"` | `"mold"`), `extra_flags` (`Vec<String>`).
- `[actix]`: `preset` (`"auto"` | `"off"`), `tuned_profiles` (`bool`).
- `[run]`: `profile` (`"dev"` | `"release"`).

---

## 3. Relationship to `cargo` and `rustc` (Verified)

Rusturbo sits **above `cargo`**, not between `cargo` and `rustc` (except optionally setting `RUSTC_WRAPPER=sccache`):

1. Invokes `cargo metadata` to resolve the dependency graph and find binary targets (`choose_bin`).
2. Computes the `CacheKey` (`rusturbo-artifact-v1`) from:
   - `rustc -vV` verbatim (`vv_raw`), `cargo --version`, target triple (`host`), `profile`,
   - sorted non-workspace `(name, version, sorted features)` graph fingerprint,
   - `dep_debug`, `parallel_codegen`, `preset`, sorted `extra_rustflags`,
   - sorted relevant environment variables (`RUSTFLAGS`, `CARGO_ENCODED_RUSTFLAGS`, `RUSTC`, `RUSTC_WRAPPER`, `RUSTC_WORKSPACE_WRAPPER`, `CARGO_BUILD_TARGET`, `CARGO_BUILD_RUSTFLAGS`, `CC`, `CXX`, `AR`, `CFLAGS`, `CXXFLAGS`, `PKG_CONFIG_PATH`, `MACOSX_DEPLOYMENT_TARGET`, `OPENSSL_*`, `SQLITE_MAX_VARIABLE_NUMBER`, `PROTOC`, `ZSTD_SYS_USE_PKG_CONFIG`; `CARGO_TARGET_DIR` is deliberately excluded).
3. Chooses a reuse strategy (`src/cacheops.rs`):
   - **Shared target directory (default when `shared_targets = true`):** If `~/.cache/rusturbo/shared/<short_key>/.rusturbo-ready` exists, sets `CARGO_TARGET_DIR` to that directory. Cargo's own `.fingerprint` files mark dependencies fresh, and only the workspace crate compiles/links. Note: the compiled binary therefore lands in `<shared_dir>/<debug|release>/<bin>`, **not** `<project>/target/...`.
   - **Portable entry fallback:** If `entries/<short_key>/meta.json` exists, hard-links (or copies) artifacts into `<project>/target/<profile>` before running Cargo.
   - **Cold build:** Runs Cargo in the project target directory, then copies `<target>/<profile>` into both `shared/<short_key>/<debug|release>` and `entries/<short_key>`, and runs LRU eviction.
4. Builds Cargo argv:
   - `cargo build|run --profile <dev|release> [--config ...] [--bin <name>] [<cargo_args>...]`
   - Invokes `$CARGO` (fallback `"cargo"`).

---

## 4. Output, Errors, and Diagnostics Format (Verified)

### Machine-Readable Output (`analyze --json`)

`rusturbo analyze --json` prints a pretty-printed JSON object to `stdout` (or `--output <FILE>`) containing:
- `rusturbo_version`, `config_found`, `config`, `hardware`, `toolchain`, `linker`, `sccache`, `graph`, `schedule`, `advice`, and `cache` (`key`, `reuse`, `decision`, `stats`).

### Build/Run Output and Diagnostics (`src/main.rs`, `src/cacheops.rs`, `src/process.rs`)

**Critical finding from reading `src/process.rs:148-174` and `src/cacheops.rs:256-267`:**

1. `rusturbo` prints its own status header, echoed command (`» cargo ...`), cache verdict (`cache hit:` / `cache miss:`), build-script policy warnings (`! ...`), and publish/timing summaries to **`stderr`**.
2. `cacheops::run_cargo` calls `process::capture_streaming`, which:
   - Reads **only `stderr`** line-by-line (printing each line to `stderr` via `eprintln!("{}", util::dim(line))` when `!quiet`).
   - Leaves **`stdout` unread until `child.wait_with_output()`** after the child process exits.
   - In `cmd_build`, `captured.stdout` is **completely ignored/discarded** on both success and failure.
3. On Cargo failure, `cmd_build` returns an `anyhow::Error` containing the exit code, argv, cwd, and the middle-truncated tail (max 4,000 chars) of `captured.stderr`, which `main()` prints to `stderr` prefixed with `error: ` and exits with code `1`.
4. Colorization bug/quirk (`src/util.rs:36-44`): `color_enabled()` checks `std::io::stdout().is_terminal()` even when `eprintln!` writes ANSI codes to `stderr`. Setting `NO_COLOR=1` disables RustTurbo's ANSI wrapping.

### Implications for Anar's Diagnostics Pipeline

Because `cargo`'s `--message-format=json` emits structured compiler diagnostic JSON lines on **`stdout`**, passing `--cargo-arg=--message-format=json` to `rusturbo build` currently:
- **Does not stream** diagnostics live (stdout is buffered until exit), and
- **Discards** the JSON diagnostics completely (because `cmd_build` ignores `captured.stdout`).

Therefore, until Rusturbo supports stdout streaming/JSON diagnostic passthrough (or Anar handles it explicitly), Anar cannot rely on `rusturbo build --cargo-arg=--message-format=json` alone for clickable Problems-panel diagnostics.

---

## 5. How Anar Will Integrate Rusturbo (Design Target for Phase 4 & Phase 7)

1. **Runner abstraction (`anar-runner`):** Define a `CompilerBackend` trait (`Cargo` vs `Rusturbo`) with capability flags (`supports_check`, `supports_test`, `supports_json_diagnostics`).
2. **Detection (`Phase 7`):** Probe `rusturbo --version` on `PATH` (or configured path) and parse `rusturbo.toml` / `rusturbo analyze --json` for hardware/cache/critical-path insights in the UI.
3. **Environment hygiene:** Pass `NO_COLOR=1` (or strip ANSI escapes) when capturing `rusturbo` output, and resolve the output executable path via `shared_targets` awareness (`<cache_dir>/shared/<key>/<profile>/<bin>` vs `target/<profile>/<bin>`).
4. **Diagnostics workaround:** Either run `cargo check --message-format=json` alongside/separately for structured diagnostics, parse human-readable `rustc` stderr diagnostics as fallback, or request/implement `--message-format=json` stdout passthrough upstream in Rusturbo.

---

## 6. Unknowns, Gaps, and Risks (Not Verified by Execution)

The following items were **not** verified by running `rusturbo` locally and/or represent concrete integration risks (each tracked as a GitHub issue):

1. **No `rusturbo` binary execution in sandbox:** Neither `rusturbo` nor `cargo` could be compiled or run locally (sandbox lacks `rustc`/`cargo` and `crates.io` access). All behaviors above are verified from Rusturbo's source code (`0.1.2`), not local execution.
2. **Stdout buffering & discard blocks `--message-format=json`:** `process::capture_streaming` buffers stdout and `cmd_build` discards it, preventing live structured JSON compiler diagnostics from `rusturbo build` / `rusturbo run`.
3. **Missing `check` and `test` subcommands:** `rusturbo` only supports `build` and `run`, so Anar's Check and Test toolbar actions must fall back to `cargo check` / `cargo test` (or wait for upstream support).
4. **`jobs` setting not forwarded to Cargo:** `src/config.rs` and `src/main.rs` compute and persist `profile.jobs`, and print it in `build`/`analyze`, but `cmd_build` never passes `-j <jobs>` or `CARGO_BUILD_JOBS` to `cargo`.
5. **Windows shared-target hard-link behavior unverified:** Rusturbo's own `docs/DESIGN.md` notes that Windows compiles and unit-tests in CI, but real builds and NTFS hard-link behavior in `shared_targets` mode are unverified on Windows.
6. **Linux-only `/proc` benchmark sampler:** `src/benchmark.rs` reads `/proc` for RSS/CPU metrics; non-Linux behavior degrades or returns `None`.
7. **Framework scope mismatch:** Rusturbo only includes a built-in preset for `actix-web` (`[actix]`). Anar targets `axum`, `actix-web`, `rocket`, `dioxus`, `leptos`, `yew`, `tauri`, `bevy`, and `clap`.
8. **Binary path indirection in `SharedTarget` mode:** External tools expecting binaries under `<project>/target/debug/` will not find them when `shared_targets = true`.
9. **Interactive stdin / process group termination:** When `rusturbo run -- <args>` spawns the user binary via `process::run_inherit`, Anar must manage process-group termination (especially on Windows and for long-running servers) so stopping a run from the UI does not leave orphaned child processes.
