# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`onenv` is a single TypeScript CLI that manages secrets stored in 1Password via the `op` CLI. Source lives in `onenv-manager/` (the published binary is named `onenv`). `install.ts` at the repo root is an interactive setup wizard.

The legacy `onenv-api/` HTTP server is being retired and should not be referenced in user-facing docs or new features. Code may still exist on disk pending removal — leave it alone unless explicitly asked.

## Commands

```bash
cd onenv-manager
just check          # loc-check + lint + typecheck + test (preferred)
just lint-fix       # auto-fix lint/format
just typecheck      # bunx tsc --noEmit
just test           # bun run test
bun run dev         # dev with watch
bun run build       # tsc → dist/
```

Single test: `bun run vitest run src/lib/state-store.test.ts`

### Installer

```bash
bun run install.ts    # interactive setup wizard (requires op CLI)
```

## Architecture

```
src/lib/onenv-client.ts    → spawns `op` CLI, CRUD on 1Password items
    ↓
src/lib/manager-service.ts → orchestration: combines onenv-client + state-store
    ↓                         (exported functions consumed by every CLI command)
src/lib/state-store.ts     → disabled-key tracking (~/.config/onenv-manager/state.json)
```

### 1Password data model

- Vault: configurable via `ONENV_VAULT` (default `onenv`)
- Category: `API Credential` (configurable via `ONENV_CATEGORY`)
- Item title: `namespace/KEY` (e.g. `aws/AWS_SECRET_KEY`)
- Item tag: `onenv:<namespace>` (the `onenv:` prefix marks the item as managed and is what the CLI filters on)
- Secret stored in the `credential` field
- Imported JSON files (via `onenv import`) carry extra STRING fields `group`, `path`, `type` per leaf for round-trip via `onenv build-file`

### Source layout

- `src/cli.ts` — Commander-based CLI entry point; each command is extracted into `src/commands/<name>.ts` and wired via a `registerXCommand(program)` function. Commands wired: prime, tui, list, get, set, edit, unset, check, disable, enable, import, build-file, init, run, export.
- `src/commands/set.ts` / `edit.ts` / `unset.ts` / `get.ts` / `check.ts` — extracted single-key commands (each exports an action + `registerXCommand`)
- `src/commands/_prompt.ts` — `assertValue`, `readValueFromPrompt`, `readValueFromStdin` shared by `set` and `edit`
- `src/commands/tui.ts` — interactive @clack/prompts TUI loop
- `src/commands/prime.ts` — agent primer dispatcher (XML on TTY, Markdown when piped, JSON with `--json`)
- `src/commands/prime-data.ts` + `prime-data-cli.ts` + `prime-data-api.ts` — primer data shape
- `src/commands/prime-xml.ts` / `prime-md.ts` — XML and Markdown renderers; `prime-logo.ts` holds the ASCII key banner
- `src/commands/import.ts` — flatten a JSON file (or stdin) into onenv keys with `group`/`path`/`type` metadata; supports `--overwrite` with atomic snapshot/rollback and `--from-stdin`
- `src/commands/build-file.ts` — reassemble a grouped JSON file from stored leaves
- `src/commands/run-files.ts` — `--file group:VAR` materialization + child-process cleanup helpers
- `src/lib/fingerprint.ts` — `sha256:<hex>` helper used by `get --fingerprint` and `check`
- `src/lib/json-flatten.ts` — pure flatten/unflatten with empty-container sentinels
- `src/lib/materialize.ts` — write rebuilt JSON to a `0600` tempfile under `XDG_RUNTIME_DIR`
- `src/lib/manager-service.ts` — orchestration; includes `exportEnabledValuesStrict` (hard-errors on cross-namespace key collisions) and `getNamespaceVarsWithFingerprints`
- `src/lib/project-config.ts` — `.onenv.json` read/write for per-project setup
- `src/lib/errors.ts` — structured CLI error types
- `src/lib/output.ts` — JSON/text output formatting
- `src/lib/ref-store.ts` — @-ref shorthand storage (positional: `@1`, `@2`, `@last`)
- `src/lib/op-token.ts` — `op://` reference resolution + cache at `~/.config/onenv-manager/op-token`
- `src/lib/validation.ts` — namespace + key regex/length validation
- `src/lib/version.ts` — reads version from `package.json` at runtime
- `src/lib/types.ts` — shared `NamespaceVar` (with optional `fingerprint`), `StateFile`, and `JsonLeafType` types

## Conventions

- Bun runtime, ES modules (`"type": "module"`)
- Biome for linting/formatting (not ESLint/Prettier)
- Vitest for testing, co-located test files (`*.test.ts`)
- Strict TypeScript, `.js` extensions in imports
- State file path: `~/.config/onenv-manager/state.json` (or `$XDG_CONFIG_HOME`). The directory name is historical — do not introduce a parallel `~/.config/onenv/` location.
