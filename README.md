# onenv

> 1Password-backed environment variable manager. Replaces `.env` files.

Two pieces, sharing a 1Password vault:

- **`onenv-manager`** — CLI + interactive TUI for humans
- **`onenv-api`** — local HTTP API for agents, with permission brokering

Secrets live in a 1Password vault as `namespace/KEY` items. No plaintext on disk.

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

## Usage

```bash
onenv prime                              # XML primer of project's namespaces + keys
onenv list                               # all namespaces / keys you have access to
onenv list aws                           # keys in one namespace
onenv set <ns> <KEY>                     # add/overwrite (interactive prompt)
onenv unset <ns> <KEY>                   # delete
onenv disable <ns> <KEY>                 # hide without delete
onenv enable <ns> <KEY>                  # restore
onenv run -- <cmd>                       # run command with secrets injected
onenv export                             # print as shell exports
onenv tui                                # interactive
```

## Agent API

For headless / agent use, run `onenv-api` and call it over HTTP. Mutations require human approval (desktop dialog or Telegram). See [`onenv-api/README.md`](onenv-api/README.md).

## Docs

- [Install guide](INSTALL.md) — full setup, env vars, dependencies
- [Guides](docs/guides/) — migrating from `.env`, per-project setup, CI use, service accounts
- [`docs/CLAUDE-onenv.md`](docs/CLAUDE-onenv.md) — drop-in CLAUDE.md include for projects using onenv

## Stack

TypeScript, Bun, Biome, Vitest. Strict TS. Co-located tests.

## License

[MIT](LICENSE)
