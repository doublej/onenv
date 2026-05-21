# Changelog

## 0.7.0 — 2026-05-22

### Removed

- **`onenv-api` package deleted.** The Express HTTP server is gone — the repository is now a single CLI binary (`onenv`). External-consumer audit turned up zero callers (no running processes, no launchctl entries, no LaunchAgents, no references across `~/Documents/development` or `~/.config`). The dedicated `docs/guides/agent-api.md` and `docs/examples/onenv-api.plist` are removed too, along with the api job in `.github/workflows/ci.yml`. The single distinguishing capability — desktop permission gating — has been ported to the CLI (see below).

### Added

- **`ONENV_CONFIRM_MUTATIONS=1` opt-in confirm-on-write.** When enabled, `onenv set`, `edit`, `unset`, and `import` display a macOS AppleScript dialog before writing to 1Password. Deny or timeout (default 120000ms; tune via `PERMISSION_TIMEOUT_MS`) raises `PERMISSION_DENIED` and nothing changes. macOS only; the CLI errors with `PERMISSION_UNSUPPORTED` if the flag is set on Linux or Windows. Off by default — existing scripts and pipelines see no change.
- **Primer `<permission>` section** replaces the old `<api>` section in `onenv prime` (XML, Markdown, and JSON), documenting the trigger env var, gated commands, and error code.

### Changed

- **`install.ts` is simpler.** Drops the `onenv-api` install/build/configure steps and the `AGENT_API_TOKEN` prompt. Outro now nudges `ONENV_CONFIRM_MUTATIONS=1` instead of pointing at `curl http://127.0.0.1:4317/health`.
- **`README.md`, `INSTALL.md`, `CLAUDE.md`, `AGENTS.md`, `docs/CLAUDE-onenv.md`, and the docs landing page** are all single-binary now — no more two-piece architecture diagrams or HTTP endpoint tables.

## 0.5.0 — 2026-05-15

### Changed

- **`onenv prime` emits Markdown by default when piped.** Previously piped consumers received JSON; now they receive a Markdown document with the same content. `--json` still forces JSON; TTY default remains XML. Agents that parsed the JSON envelope must opt in with `--json`.
- **XML primer restructured to flt-style.** Root element renamed from `<onenv>` to `<onenv-agent-guide>`; sections collapsed into `<role>`, `<rules priority="critical">` (TOKEN / STORAGE / NAMING / REFS / STATE FILES), `<commands>` (categorized CORE / RUN-EXPORT / GROUPED-FILES / OTHER), `<workflow strict="true">`, `<errors>`, `<output>`, `<api>`. Breaking for consumers parsing the previous tag layout.

### Added

- **`onenv prime` Markdown renderer (`prime-md.ts`).** Produces `# / ## / ###`-structured output mirroring the XML layout, suitable for piping into agents that prefer plain text.
- **ASCII key logo header.** Both XML and Markdown outputs are now prefixed with a small key-in-profile banner labelled `1Password / onenv primer`; JSON output is unchanged.

## 0.4.0 — 2026-05-13

### Changed

- **Tag scheme is now `onenv:<namespace>`** — every onenv-managed 1Password item carries an `onenv:` prefix on its tag (instead of just the bare namespace), so the vault can hold non-onenv items without confusion and the CLI's filter is unambiguous about ownership. Existing items need a one-time tag rewrite (write-via-template; `op item edit --tags` appends silently rather than replacing).
- **Item create/edit now uses `--template <file>`** instead of stdin (`-`). 1Password CLI 2.24+ silently ignores stdin templates passed through Node's `child_process` pipes, creating empty default-category items with no error. Switched both code paths to write a `0600` tempfile and pass `--template`.

### Added

- **`onenv import <ns> <file>`** — flatten a JSON file into one onenv key per leaf, with reassembly metadata (`group`, `path`, `type`) stored as 1Password STRING fields on each item. `--group` overrides the default (filename without extension); `--keys upper-snake|leaf` controls key naming; `--prefix` disambiguates collisions; `--dry-run` prints the plan without writing. Empty objects/arrays are preserved via sentinel entries so round-trips are exact.
- **`onenv build-file <ns> --group <name>`** — reassemble the grouped JSON from onenv keys, casting each leaf back to its JSON type. Optional `--out <path>` writes the file (default: stdout); `--indent <n>` controls formatting. Errors loudly on missing array indices or type mismatches.
- **`onenv run --file <group:VAR>`** — repeatable: materializes the rebuilt JSON for a group into a `0600` tempfile under `XDG_RUNTIME_DIR` (fallback: OS tmpdir) and exposes its absolute path as the named env var. Cleans up on child exit, SIGINT, and SIGTERM. Group names must be unique across the project's namespaces.
- **`onenv list <ns> --groups`** — bucket keys by their reassembly group, with `(ungrouped)` for flat secrets. Uses per-item metadata fetches; documented as slower than the bare list.

## 0.3.0 — 2026-05-08

### Changed

- **`onenv prime` is now a complete agent primer.** Rewrote the output to cover what a blank agent actually needs to use the CLI and API on first try: service-account token forms, vault/category config, namespace + key regexes, the bare-key injection footgun for `export`/`run`, `@`-ref syntax, every command's output shape, the full `errors` envelope with all codes, every state file, and the full `onenv-api` surface (auth header, rate limits, every endpoint with request/response shape, error responses, blocking permission semantics).
- **`onenv prime` is JSON-aware.** Emits XML by default; emits a structured JSON object with the same content when `--json` is set or stdout is not a TTY, so piped consumers don't get an XML payload they can't parse.
- **Version is read from `package.json` at runtime.** `onenv --version` and `<onenv version="...">` in the primer now read from the manifest, eliminating the previous hardcoded literal that drifted on releases.

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
- **`onenv-api`** — local HTTP API for agent-driven access with desktop AppleScript permission prompts.
- Service Account token support (`OP_SERVICE_ACCOUNT_TOKEN`) for headless / no-prompt operation. Accepts literal token or `op://...` reference resolved at startup.
- Batched secret reads via `op inject` — single subprocess per `listValues` call instead of N.
- Graceful shutdown (SIGTERM/SIGINT), JSON request logging, per-token rate limiting on `onenv-api`.
- 8 detailed guides in `docs/guides/` covering migration, multi-env, CI, rotation.
- `docs/CLAUDE-onenv.md` — drop-in CLAUDE.md include for projects using onenv.
- `docs/examples/onenv-api.plist` — launchd unit for macOS daemon use.

### Tested

- 19 unit + integration tests across both packages.
- CI on GitHub Actions: lint, typecheck, test for every push and PR.
