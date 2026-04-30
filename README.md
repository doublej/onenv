# onenv

> 1Password-backed environment variable manager. Replaces `.env` files.

Two pieces, sharing a 1Password vault:

- **`onenv-manager`** — CLI + interactive TUI for humans
- **`onenv-api`** — local HTTP API for agents, with permission brokering

Secrets live in a 1Password vault as `namespace/KEY` items. No plaintext on disk.

## Why

`.env` files leak. They sit unencrypted next to source, drift between machines, get pasted into chat, end up in `git status` more often than they should, and nobody ever rotates the keys. Sharing them means Slack DMs and stale copies on three laptops.

onenv keeps the same `KEY=value` ergonomics but the values live in your 1Password vault:

- **Nothing on disk** — `onenv run` injects secrets at process start; they exist in env memory only
- **Real auth** — biometric unlock or a scoped service account, not a chmod 600 hope
- **Audit + rotate** — 1Password tracks every read; rotate by overwriting the item
- **Agent-safe** — the HTTP API gates every mutation behind a human approval (desktop dialog or Telegram)
- **Per-project namespaces** — `.onenv.json` declares which namespaces a project uses; no global blast radius

## How it works

```
   ┌─ onenv-manager (CLI/TUI) ─┐
   │                           │
   │   onenv set / list / run  │──┐
   │                           │  │
   └───────────────────────────┘  │     ┌──────────────┐     ┌───────────────┐
                                  ├──▶  │   op CLI     │ ──▶ │  1Password    │
   ┌─ onenv-api (HTTP, :4317) ─┐  │     │ (biometric / │     │     vault     │
   │                           │  │     │  service-acct│     │   "onenv"     │
   │   POST /v1/vars/set       │──┘     └──────────────┘     └───────────────┘
   │   ↳ permission broker     │             ▲
   │     (desktop / telegram)  │             │
   └───────────────────────────┘             │
                                  reads `namespace/KEY` items,
                                  field `credential` = value
```

State (which keys are disabled) lives at `~/.config/onenv-manager/state.json`. Everything else is in 1Password.

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
$ onenv list aws
aws/
  AWS_ACCESS_KEY_ID         ●
  AWS_SECRET_ACCESS_KEY     ●
  AWS_REGION                ●
  AWS_SESSION_TOKEN         ○ (disabled)

$ onenv run -- node -e 'console.log(process.env.AWS_REGION)'
eu-west-1

$ onenv prime
<onenv-project>
  <namespace name="aws">
    <key>AWS_ACCESS_KEY_ID</key>
    <key>AWS_SECRET_ACCESS_KEY</key>
    <key>AWS_REGION</key>
  </namespace>
</onenv-project>
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

For headless / agent use, run `onenv-api` and call it over HTTP. Mutations require human approval (desktop dialog or Telegram).

```bash
curl -H "x-onenv-token: $AGENT_API_TOKEN" \
     http://127.0.0.1:4317/v1/namespaces
```

| Method | Path                              | Auth | Permission |
|--------|-----------------------------------|------|------------|
| GET    | `/health`                         | No   | No         |
| GET    | `/v1/namespaces`                  | Yes  | No         |
| GET    | `/v1/namespaces/:namespace/vars`  | Yes  | No         |
| POST   | `/v1/vars/{set,edit,unset}`       | Yes  | Yes        |
| POST   | `/v1/vars/{disable,enable}`       | Yes  | Yes        |
| POST   | `/v1/env/export`                  | Yes  | Yes        |

Full endpoint + body docs in [`onenv-api/README.md`](onenv-api/README.md).

## Avoiding biometric prompts

By default `op` requires Touch ID for every secret read — fine for humans, painful for agents. To run unattended, use a 1Password **service account**:

```bash
# 1Password web → Developer → Service Accounts → Create
# Grant read+write on the `onenv` vault, then:

OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...                    # literal
# or
OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<id>/credential # resolved at startup
```

Tradeoff: token compromise = vault compromise. Keep the `onenv` vault scoped to non-personal secrets. Full guide: [`docs/guides/service-account-setup.md`](docs/guides/service-account-setup.md).

## Docs

- [Install guide](INSTALL.md) — full setup, env vars, dependencies
- [Guides](docs/guides/) — migrating from `.env`, per-project setup, CI use, service accounts, rotation, multi-env
- [`docs/CLAUDE-onenv.md`](docs/CLAUDE-onenv.md) — drop-in CLAUDE.md include for projects using onenv

## Stack

TypeScript, Bun, Biome, Vitest. Strict TS. Co-located tests.

## License

[MIT](LICENSE)
