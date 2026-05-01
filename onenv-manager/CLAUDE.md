# onenv-manager

> CLI tool for managing 1Password-backed environment variables

## Stack

- TypeScript, bun, Biome, Vitest
- CLI entry point with tsx for dev

## Commands

Use `just` as the task runner:

- `just check` — run all checks (loc-check + lint + typecheck + test)
- `just loc-check` — check file lengths (warn >300, error >400 lines)
- `just run` — run the CLI
- `just dev` — start dev mode with watch
- `just test` — run tests
- `just lint-fix` — auto-fix lint issues

## Project Structure

```
src/
├── cli.ts                  # CLI entry point (Commander)
├── index.ts                # main logic / public API
├── commands/
│   ├── prime.ts            # XML agent primer output
│   └── tui.ts              # interactive TUI command
└── lib/
    ├── errors.ts           # structured CLI error types
    ├── manager-service.ts  # orchestration layer
    ├── onenv-client.ts     # 1Password CLI wrapper
    ├── output.ts           # JSON/text output formatting
    ├── project-config.ts   # .onenv.json read/write
    ├── ref-store.ts        # @ref shorthand storage
    ├── state-store.ts      # disabled-key state (~/.config/...)
    ├── state-store.test.ts
    └── types.ts            # shared type definitions
package.json
tsconfig.json
biome.json
Justfile
```

## Conventions

- ES modules (`"type": "module"`)
- Strict TypeScript config
- Biome for linting and formatting (not ESLint/Prettier)
- Keep functions small (5–10 lines target, 20 max)
- Prefer explicit, readable code over cleverness
- Handle errors at boundaries; let unexpected errors surface

## Agent

### Verify Loop

Run after every change:

1. `just lint-fix`
2. `just typecheck`
3. `just test`

### Auto-fixable

- `bun run biome check --write src/` — auto-fix lint and format issues in one command

### Common Tasks

- Add a CLI command: define the command logic in `src/` and wire it in `cli.ts`
- Add argument parsing: use the project's argument parsing approach in `cli.ts`
- Add a subcommand: create a new module in `src/` and import it in the CLI entry point
- Add a dependency: `bun add <package>`

### Testing

- Test files: `src/**/*.test.ts` (co-located with source)
- Framework: Vitest
- Test command output by invoking the CLI function and asserting on results
- Run a single test: `bun run vitest run src/foo.test.ts`

### Boundaries

- Do not deploy or push
- Do not install ESLint or Prettier — this project uses Biome
