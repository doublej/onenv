# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Monorepo with two independent TypeScript sub-projects that manage secrets stored in 1Password via the `op` CLI. A shared `install.ts` bootstraps both.

- **onenv-manager** — CLI + interactive TUI for managing secrets (Commander, @clack/prompts)
- **onenv-api** — HTTP API (Express) for agent-driven secret access with permission brokering

Both have a parallel `onenv-client.ts` / `manager-service.ts` / `state-store.ts` architecture (duplicated, not shared as a package — copies have diverged).

## Commands

### onenv-manager

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

### onenv-api

```bash
cd onenv-api
bun run biome check --write src/   # lint + format
bunx tsc --noEmit                  # typecheck
bun run test                       # tests (vitest)
bun run dev                        # dev with watch
bun run build                      # tsc → dist/
```

Single test: `bun run vitest run src/lib/config.test.ts`

### Installer

```bash
bun run install.ts    # interactive setup wizard (requires op CLI)
```

## Architecture

```
onenv-client.ts       → spawns `op` CLI, CRUD on 1Password items
    ↓
manager-service.ts    → orchestration: combines onenv-client + state-store
    ↓                    (exported functions consumed by CLI/API routes)
state-store.ts        → disabled-key tracking (~/.config/onenv-manager/state.json)
```

### 1Password data model

- Vault: configurable via `ONENV_VAULT` (default `onenv`)
- Category: `API Credential` (configurable via `ONENV_CATEGORY`)
- Item title: `namespace/KEY` (e.g. `aws/AWS_SECRET_KEY`)
- Item tag: `onenv:<namespace>` (the `onenv:` prefix marks the item as managed and is what the CLI filters on)
- Secret stored in the `credential` field
- Imported JSON files (via `onenv import`) carry extra STRING fields `group`, `path`, `type` per leaf for round-trip via `onenv build-file`

### onenv-api specifics

- `src/server.ts` — Express routes, Zod validation, auth middleware (`x-onenv-token` header), pre-auth (per-IP, all methods) and post-auth (per-token, mutating only) rate limiters
- `src/lib/permission.ts` — macOS AppleScript permission dialog
- `src/lib/config.ts` — loads env vars with defaults; `AGENT_API_TOKEN` is required
- All mutating endpoints require permission approval before executing

### onenv-manager specifics

- `src/cli.ts` — Commander-based CLI entry point (set, edit, unset, list [--groups], disable, enable, init, run [--file], export, import, build-file, prime, tui)
- `src/commands/tui.ts` — interactive @clack/prompts TUI loop
- `src/commands/prime.ts` — agent primer; XML by default, JSON when `--json` or piped
- `src/commands/prime-data.ts` + `prime-data-cli.ts` + `prime-data-api.ts` — primer data shape
- `src/commands/prime-xml.ts` — flat XML renderer (top-level tags with prose bodies)
- `src/commands/import.ts` — flatten a JSON file into onenv keys with `group`/`path`/`type` metadata
- `src/commands/build-file.ts` — reassemble a grouped JSON file from stored leaves
- `src/commands/run-files.ts` — `--file group:VAR` materialization + child-process cleanup helpers
- `src/lib/json-flatten.ts` — pure flatten/unflatten with empty-container sentinels
- `src/lib/materialize.ts` — write rebuilt JSON to a `0600` tempfile under `XDG_RUNTIME_DIR`
- `src/lib/project-config.ts` — `.onenv.json` read/write for per-project setup
- `src/lib/errors.ts` — structured CLI error types
- `src/lib/output.ts` — JSON/text output formatting
- `src/lib/ref-store.ts` — @-ref shorthand storage (positional: `@1`, `@2`, `@last`)
- `src/lib/op-token.ts` — `op://` reference resolution + cache at `~/.config/onenv-manager/op-token`
- `src/lib/validation.ts` — namespace + key regex/length validation
- `src/lib/version.ts` — reads version from `package.json` at runtime
- `src/lib/types.ts` — shared `NamespaceVar`, `StateFile`, and `JsonLeafType` types

## Conventions

- Bun runtime, ES modules (`"type": "module"`)
- Biome for linting/formatting (not ESLint/Prettier)
- Vitest for testing, co-located test files (`*.test.ts`)
- Strict TypeScript, `.js` extensions in imports
- `onenv-client.ts` is duplicated across both projects (not a shared package; copies have diverged)
- State file path: `~/.config/onenv-manager/state.json` (or `$XDG_CONFIG_HOME`)
