# onenv-manager

Terminal UI + CLI wrapper for [1Password CLI](https://developer.1password.com/docs/cli/).

This tool adds fast workflows to:
- set variables
- edit variables
- unset variables
- disable variables (without deleting stored secret values)
- re-enable disabled variables

Secrets are stored as `API Credential` items in a configurable 1Password vault (default: `onenv`). Each item is tagged with its namespace and titled `namespace/KEY`.

Disabled state is tracked in:
`~/.config/onenv-manager/state.json` (or `$XDG_CONFIG_HOME/onenv-manager/state.json`).

## Requirements

- Bun
- `op` CLI available in `PATH` (1Password CLI)
- 1Password desktop app (for biometric unlock)

## Install

```bash
bun install
```

## Run TUI

```bash
bun run dev
# or
bun run start -- tui
```

## CLI Commands

```bash
onenv-manager tui
onenv-manager list [namespace]
onenv-manager set <namespace> <key> [value]
onenv-manager edit <namespace> <key> [value]
onenv-manager unset <namespace> <key>
onenv-manager disable <namespace> <key>
onenv-manager enable <namespace> <key>
onenv-manager export <namespace[,namespace...]>
```

`tui` opens the interactive terminal UI (also the default when run without a command).

`export` returns enabled variables as JSON.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ONENV_VAULT` | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | `API Credential` | 1Password item category |

## Notes

- `disable` does not remove secrets from 1Password; it only marks keys inactive in this tool's state file.
- `unset` removes the 1Password item and clears disabled metadata for that key.
