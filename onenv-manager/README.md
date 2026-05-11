# onenv-manager

Terminal UI + CLI wrapper for [1Password CLI](https://developer.1password.com/docs/cli/).

## Features

- **CRUD over 1Password secrets** — `set`, `edit`, `unset` with interactive password prompts; per-key audit lives in 1Password
- **Disable without deleting** — `disable` marks a key inactive in local state without touching the 1Password item; `enable` restores it
- **Per-project namespaces** — `onenv init` writes `.onenv.json` declaring which namespaces a project pulls
- **`onenv run -- <cmd>`** — fetches enabled secrets across the project namespaces, injects as env vars, execs the command
- **JSON file flow** — `onenv import` flattens a JSON file (GCP service accounts, OAuth tokens, kubeconfigs) into per-leaf onenv keys with reassembly metadata; `onenv build-file` rebuilds the original shape; `onenv run --file group:VAR` materializes the file to a `0600` tempfile and exposes its path; `onenv run --file-rw group:VAR` writes the file back to onenv if the child mutated it (OAuth refresh, rotation)
- **Grouped listing** — `onenv list <ns> --groups` buckets keys by their reassembly group
- **Interactive TUI** — `@clack/prompts`-based menu for browsing/editing without typing commands
- **`@`-refs** — positional shorthand against the last namespace list (`@1`, `@2`, `@last`) for fast repeat work
- **Service-account ready** — `OP_SERVICE_ACCOUNT_TOKEN` accepts a literal token or an `op://...` reference; resolved once and cached at `~/.config/onenv-manager/op-token` (mode 0600); self-heals on auth failure
- **JSON output** — every command emits machine-readable JSON when piped or with `--json`; structured error envelope with codes, categories, retryable flag
- **Agent primer** — `onenv prime` emits a complete spec of commands, state files, errors, and the API surface as XML or JSON

Secrets are stored as `API Credential` items in a configurable 1Password vault (default: `onenv`). Each item is titled `namespace/KEY` and tagged `onenv:<namespace>` — the `onenv:` prefix marks it as managed by this tool and is the filter the CLI uses, so other items in the vault are ignored. Group/path/type metadata for imported JSON files lives on each item as STRING fields.

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
bun run start tui
```

## CLI Commands

The published binary is `onenv` (see `bin` in `package.json`).

```bash
onenv tui                                # interactive TUI (also default with no args)
onenv list [namespace] [--groups]        # list namespaces, or keys in one (optionally bucketed by group)
onenv set <namespace> <key>              # create/overwrite (interactive prompt)
onenv edit <namespace> <key>             # update existing
onenv unset <namespace> <key...>         # delete one or more keys
onenv disable <namespace> <key...>       # mark inactive without deleting
onenv enable <namespace> <key...>        # restore disabled keys
onenv init                               # write .onenv.json for current project
onenv run [--file group:VAR] -- <cmd>    # exec cmd with project secrets (and optional JSON file path) injected
onenv run --file-rw group:VAR -- <cmd>   # same, but write back to onenv on clean exit if child mutated it
onenv import <ns> <file.json>            # flatten a JSON file into onenv keys (--group, --keys, --prefix, --dry-run)
onenv build-file <ns> --group <name>     # reassemble the JSON file from stored leaves (--out, --indent)
onenv export <ns[,ns2,...]>              # print enabled values as JSON
onenv export <ns[,ns2,...]> -- <cmd...>  # exec cmd with selected secrets injected
onenv prime [--json]                     # agent primer (XML by default; JSON via --json or pipe)
onenv <namespace>                        # bare-arg shorthand for `onenv list <namespace>`
```

`@`-refs (positional, 1-indexed against the most recent namespace listing) are accepted wherever a namespace is taken: `@1`, `@2`, ..., `@last`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ONENV_VAULT` | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | `API Credential` | 1Password item category |

## Notes

- `disable` does not remove secrets from 1Password; it only marks keys inactive in this tool's state file.
- `unset` removes the 1Password item and clears disabled metadata for that key.
