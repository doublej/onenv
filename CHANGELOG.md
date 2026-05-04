# Changelog

## 0.2.0 — 2026-05-04

### Fixed

- **`onenv` CLI: zero-prompt service-account flow.** When `OP_SERVICE_ACCOUNT_TOKEN` was set as a `op://...` reference (the documented form for keeping the literal token off disk), the CLI passed it straight to `op`, which only accepts literal `ops_eyJ...` tokens. The malformed value was ignored and `op` fell back to Touch ID on every spawn. Consumers running `onenv export` / `onenv run` saw a biometric prompt per invocation.

### Changed

- **`onenv` CLI now resolves `op://...` references on first use and caches the literal** at `~/.config/onenv-manager/op-token` (mode 0600). First call costs one biometric prompt; subsequent calls are silent. Mirrors the existing `onenv-api` startup resolver.
- **Self-healing cache**: when `op` reports the cached service-account token as invalid / unauthorized / expired (e.g. after rotation), `execOp` clears the cache file. The next CLI invocation re-resolves the reference. Manual `rm` of the cache file also works.
- Docs (`README.md`, `INSTALL.md`, `docs/guides/service-account-setup.md`) updated to cover the CLI surface, cache location, and rotation flow.

## 0.1.0 — 2026-04-30

Initial public release.

### Features

- **`onenv-manager`** — CLI + interactive TUI for managing 1Password-backed secrets.
- **`onenv-api`** — local HTTP API for agent-driven access with permission brokering (desktop AppleScript, Telegram).
- Service Account token support (`OP_SERVICE_ACCOUNT_TOKEN`) for headless / no-prompt operation. Accepts literal token or `op://...` reference resolved at startup.
- Batched secret reads via `op inject` — single subprocess per `listValues` call instead of N.
- Graceful shutdown (SIGTERM/SIGINT), JSON request logging, per-token rate limiting on `onenv-api`.
- 8 detailed guides in `docs/guides/` covering migration, multi-env, CI, rotation.
- `docs/CLAUDE-onenv.md` — drop-in CLAUDE.md include for projects using onenv.
- `docs/examples/onenv-api.plist` — launchd unit for macOS daemon use.

### Tested

- 19 unit + integration tests across both packages.
- CI on GitHub Actions: lint, typecheck, test for every push and PR.
