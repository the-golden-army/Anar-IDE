# Security Policy

## Supported Versions

Anar is currently in pre-1.0 development (`v0.0.1`). Security fixes are applied to the active development branch and included in the next versioned release.

## Security Architecture

- **Minimal Tauri 2 capabilities:** Only explicitly required permissions are granted in `apps/desktop/src-tauri/capabilities/`.
- **Scoped filesystem access:** Workspace commands enforce path canonicalization and workspace-root containment before reading or writing files.
- **No unrestricted shell execution:** Backend runners spawn explicit executables (`cargo`, `rusturbo`, `rust-analyzer`, `git`) using argv arrays without shell interpolation.
- **Content Security Policy (CSP):** Restricted in `apps/desktop/src-tauri/tauri.conf.json`.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, report vulnerabilities privately via GitHub Security Advisories for `Nour-yahyaoui/anar` (Security tab -> Advisories -> Report a vulnerability) or contact the repository maintainer directly. Include:

- Affected version / commit hash
- Reproduction steps or proof of concept
- Impact assessment (filesystem escape, command injection, webview RCE, etc.)
