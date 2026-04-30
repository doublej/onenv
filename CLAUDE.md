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
bun run test run                   # tests (vitest)
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
- Item tag: namespace name (for filtering)
- Secret stored in the `credential` field

### onenv-api specifics

- `server.ts` — Express routes, Zod validation, auth middleware (`x-onenv-token` header)
- `permission.ts` — Desktop (AppleScript dialog) and Telegram permission brokers
- `config.ts` — loads env vars with defaults; `AGENT_API_TOKEN` is required
- All mutating endpoints require permission approval before executing

### onenv-manager specifics

- `cli.ts` — Commander-based CLI entry point (set, edit, unset, list, disable, enable, init, run, export, prime, tui)
- `commands/tui.ts` — interactive @clack/prompts TUI loop
- `commands/prime.ts` — XML agent primer output
- `lib/project-config.ts` — `.onenv.json` read/write for per-project setup
- `lib/errors.ts` — structured CLI error types
- `lib/output.ts` — JSON/text output formatting
- `lib/ref-store.ts` — @ref shorthand storage
- `lib/types.ts` — shared `NamespaceVar` and `StateFile` types

## Conventions

- Bun runtime, ES modules (`"type": "module"`)
- Biome for linting/formatting (not ESLint/Prettier)
- Vitest for testing, co-located test files (`*.test.ts`)
- Strict TypeScript, `.js` extensions in imports
- `onenv-client.ts` is duplicated across both projects (not a shared package; copies have diverged)
- State file path: `~/.config/onenv-manager/state.json` (or `$XDG_CONFIG_HOME`)
