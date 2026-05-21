# onenv

> 1Password-backed environment variable manager. Replaces `.env` files.

Single CLI binary, one 1Password vault. Secrets live as `namespace/KEY` items. No plaintext on disk.

## Features

- **`.env` replacement** — `KEY=value` ergonomics, but values live in a 1Password vault; nothing on disk
- **`onenv run -- <cmd>`** — fetches per-project secrets, injects as env vars, execs your command
- **JSON file support** — `onenv import` flattens a JSON file (GCP service accounts, OAuth tokens, kubeconfigs) into per-leaf onenv keys; `onenv run --file group:VAR` materializes the rebuilt JSON to a `0600` tempfile and exposes its path; `onenv run --file-rw group:VAR` does the same but writes the file back to onenv if the child mutated it (OAuth refresh, rotation). Per-field rotation, no plaintext JSON on disk.
- **`onenv build-file`** — reassemble the original JSON shape from stored leaves (with type preservation: numbers stay numbers, empty containers round-trip)
- **Per-project namespaces** — `.onenv.json` declares which namespaces a project uses; no global blast radius
- **Disable without deleting** — `onenv disable <key>` keeps the secret in 1Password but excludes it from `run`/`export`; `enable` restores it
- **Interactive TUI** — `@clack/prompts`-based menu for browsing/editing without typing commands
- **Optional macOS permission gate** — set `ONENV_CONFIRM_MUTATIONS=1` and `set` / `edit` / `unset` / `import` prompt a desktop AppleScript dialog before writing
- **Agent primer** — `onenv prime` emits a complete spec (commands, errors, state files) as XML, Markdown, or JSON for dropping into agent context
- **`@`-refs** — positional shorthand against the last namespace list (`@1`, `@2`, `@last`) for fast repeat work
- **Service-account ready** — `OP_SERVICE_ACCOUNT_TOKEN` accepts a literal `ops_eyJ...` token *or* an `op://...` reference; resolved once and cached at `~/.config/onenv-manager/op-token` (mode 0600), self-heals on auth failure
- **Grouped listing** — `onenv list <ns> --groups` buckets keys by their reassembly group, with `(ungrouped)` for flat secrets
- **JSON output** — every command emits machine-readable JSON when piped or with `--json`; structured error envelope with codes, categories, retryable flag
- **Audit + rotation** — 1Password tracks every read; rotate by overwriting the item — no redeploy

## Why

`.env` files leak. They sit unencrypted next to source, drift between machines, get pasted into chat, end up in `git status` more often than they should, and nobody ever rotates the keys. Sharing them means Slack DMs and stale copies on three laptops.

onenv keeps the same `KEY=value` ergonomics but the values live in your 1Password vault:

- **Nothing on disk** — `onenv run` injects secrets at process start; they exist in env memory only
- **Real auth** — biometric unlock or a scoped service account, not a chmod 600 hope
- **Audit + rotate** — 1Password tracks every read; rotate by overwriting the item
- **Per-project namespaces** — `.onenv.json` declares which namespaces a project uses; no global blast radius

## How it works

```
   ┌─ onenv (CLI/TUI) ─────────┐
   │                           │     ┌──────────────┐     ┌───────────────┐
   │   onenv set / list / run  │──▶  │   op CLI     │ ──▶ │  1Password    │
   │                           │     │ (biometric / │     │     vault     │
   └───────────────────────────┘     │  service-acct│     │   "onenv"     │
                                     └──────────────┘     └───────────────┘
                                             ▲
                                             │
                                  reads `namespace/KEY` items
                                  tagged `onenv:<ns>`, field
                                  `credential` = value
```

Items are tagged `onenv:<namespace>` — the prefix marks ownership and is what the CLI filters on, so the vault can also hold items unrelated to onenv without conflict. State (which keys are disabled) lives at `~/.config/onenv-manager/state.json`. Everything else is in 1Password.

## Quickstart

```bash
brew install 1password-cli bun
op signin
op vault create onenv

git clone https://github.com/doublej/onenv && cd onenv
bun install.ts            # interactive setup wizard
```

Then in any project:

```bash
onenv init                # creates .onenv.json
onenv set aws AWS_ACCESS_KEY_ID
onenv run -- node app.js  # injects secrets, runs your command
```

## Demo

```
$ onenv list
[
  "aws",
  "github",
  "stripe"
]

$ onenv list aws
[
  { "key": "AWS_ACCESS_KEY_ID",     "disabled": false },
  { "key": "AWS_REGION",            "disabled": false },
  { "key": "AWS_SECRET_ACCESS_KEY", "disabled": false },
  { "key": "AWS_SESSION_TOKEN",     "disabled": true  }
]

$ onenv run -- node -e 'console.log(process.env.AWS_REGION)'
eu-west-1
```

Output is JSON by default (one shape per command — see `onenv prime`). For interactive browsing/editing, run `onenv tui`.

`onenv prime` is a complete agent primer — every command with output shape, every error code with retryable flag, every state-file path. XML on a TTY, Markdown when piped, structured JSON with `--json`.

## Usage

```bash
onenv prime                              # XML primer of the CLI surface
onenv list                               # all namespaces / keys you have access to
onenv list aws                           # keys in one namespace
onenv list aws --groups                  # bucket keys by reassembly group
onenv set <ns> <KEY>                     # add/overwrite (interactive prompt)
onenv edit <ns> <KEY>                    # update existing (interactive prompt)
onenv unset <ns> <KEY>                   # delete
onenv disable <ns> <KEY>                 # hide without delete
onenv enable <ns> <KEY>                  # restore
onenv run -- <cmd>                       # run command with project secrets injected
onenv run --file [ns/]group:VAR -- <cmd>      # also materialize a JSON file, expose its path as VAR
onenv run --file-rw [ns/]group:VAR -- <cmd>   # same, but write back to onenv if child mutated it
onenv import <ns> <file.json>            # flatten a JSON file into onenv keys
onenv build-file <ns> --group <name>     # reassemble the JSON file from stored leaves
onenv export <ns[,ns2]>                  # print enabled values as JSON
onenv tui                                # interactive
```

### JSON files (service accounts, OAuth tokens, kubeconfigs)

Some tools want a file path instead of env vars. Import the JSON once, store every leaf as a separate onenv key, and rebuild on demand:

```bash
onenv import google /tmp/sa.json --group sa     # one onenv key per JSON leaf
onenv list google --groups                      # see the sa group's keys
onenv build-file google --group sa              # rebuild the original JSON to stdout
onenv run --file sa:GOOGLE_APPLICATION_CREDENTIALS -- python app.py
# tempfile lives under XDG_RUNTIME_DIR with mode 0600, removed on child exit
```

Per-field rotation works the same as flat secrets. Empty containers and types (numbers, booleans, nulls) round-trip exactly.

For files the child program mutates (OAuth tokens that self-refresh, rotating credentials), use `--file-rw` instead of `--file`. onenv hashes the materialized file before the child runs and re-imports it on clean exit only if the hash changed. Re-import preserves the same group; new leaves create new keys, removed leaves leave stale keys in place (run `onenv unset` to prune). Writeback is skipped on SIGINT/SIGTERM and on any read error, so a crashed child cannot poison the vault.

When the same group name exists in multiple project namespaces (e.g. one `token` group per OAuth account), bare `group:VAR` is ambiguous and the command errors. Disambiguate with `namespace/group:VAR`:

```bash
onenv run \
  --file-rw gws-poolsuite/token:GMAIL_TOKEN_POOLSUITE \
  --file-rw gws-personal/token:GMAIL_TOKEN_PERSONAL \
  -- python3 mail_sync.py
```

## Confirm-on-write (optional)

Set `ONENV_CONFIRM_MUTATIONS=1` and `set` / `edit` / `unset` / `import` will pop a macOS AppleScript dialog before writing to 1Password. Deny (or timeout — see `PERMISSION_TIMEOUT_MS`, default 120000ms) → the command throws `PERMISSION_DENIED` and nothing changes. Useful when handing the CLI to a long-running agent that should pause on every mutation.

The flag has no effect on read commands (`list`, `export`, `run`, `build-file`) or on local-only state changes (`disable`, `enable`).

## Avoiding biometric prompts

By default `op` requires Touch ID for every secret read — fine for humans, painful for agents and CLI consumers. To run unattended, use a 1Password **service account**:

```bash
# 1Password web → Developer → Service Accounts → Create
# Grant read+write on the `onenv` vault, then:

OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...                    # literal
# or
OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<id>/credential # resolved on first use
```

The `onenv` CLI resolves the reference on first command and caches the literal at `~/.config/onenv-manager/op-token` (mode 0600). After the first resolution all subsequent calls are silent.

Tradeoff: token compromise = vault compromise. Keep the `onenv` vault scoped to non-personal secrets. Full guide: [`docs/guides/service-account-setup.md`](docs/guides/service-account-setup.md).

## Docs

- [Install guide](INSTALL.md) — full setup, env vars, dependencies
- [Guides](docs/guides/) — migrating from `.env`, per-project setup, CI use, service accounts, rotation, multi-env
- [`docs/CLAUDE-onenv.md`](docs/CLAUDE-onenv.md) — drop-in CLAUDE.md include for projects using onenv

## Stack

TypeScript, Bun, Biome, Vitest. Strict TS. Co-located tests.

## License

[MIT](LICENSE)
