# Changelog

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
