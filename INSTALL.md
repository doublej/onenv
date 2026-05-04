# Installation Guide

## Prerequisites

| Dependency | Required | Install |
|------------|----------|---------|
| [Bun](https://bun.sh) | Yes | `curl -fsSL https://bun.sh/install \| bash` |
| [1Password CLI](https://developer.1password.com/docs/cli/) | Yes | `brew install 1password-cli` |
| [1Password desktop app](https://1password.com/downloads) | Yes | Required for biometric unlock / CLI integration |
| [just](https://github.com/casey/just) | Optional | `brew install just` (task runner for manager) |
| macOS | Yes* | Desktop permission broker uses AppleScript |

\* The agent-api can run without macOS if you use `PERMISSION_MODE=telegram`.

## Clone & install

```bash
git clone <repo-url> onenv && cd onenv

cd onenv-manager && bun install && cd ..
cd onenv-api && bun install && cd ..
```

## Build

```bash
cd onenv-manager && bun run build && cd ..
cd onenv-api && bun run build && cd ..
```

## 1Password setup

1. Sign in to the CLI: `op signin`
2. Verify: `op whoami`
3. Create the vault (or let the installer do it):
   ```bash
   op vault create onenv
   ```

## Configure — agent-api

Copy the example env file and fill in values:

```bash
cp onenv-api/.env.example onenv-api/.env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_API_TOKEN` | Yes | — | API authentication token |
| `PERMISSION_MODE` | No | `desktop` | `desktop` · `telegram` · `either` · `both` |
| `API_HOST` | No | `127.0.0.1` | Server bind address |
| `API_PORT` | No | `4317` | Server port |
| `PERMISSION_TIMEOUT_MS` | No | `120000` | Permission request timeout (ms) |
| `ONENV_VAULT` | No | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | No | `API Credential` | 1Password item category |
| `OP_SERVICE_ACCOUNT_TOKEN` | No | — | Skips biometric prompts (see below) |
| `TELEGRAM_BOT_TOKEN` | If telegram | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | If telegram | — | Telegram chat ID |

### Avoiding constant 1Password approvals

By default `op` requires biometric unlock (Touch ID / desktop app) for every
secret read. Agents calling `onenv-api` repeatedly — and any process invoking
the `onenv` CLI — will trigger prompt spam.

To run headless / no-prompts, create a **1Password service account**:

1. 1Password web → **Developer** → **Service Accounts** → **Create**.
2. Grant **read + write** access to the `onenv` vault.
3. Set `OP_SERVICE_ACCOUNT_TOKEN` for both the API (`onenv-api/.env`) and the
   shell that runs the `onenv` CLI. Two forms accepted:

   ```
   # literal — fastest, but plaintext on disk
   OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...

   # 1Password reference — resolved on first use via `op read`
   # (one biometric prompt; cached afterwards, zero during normal operation)
   OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<item-id>/credential
   ```

4. Restart the API. Startup log should show `1password auth: service-account`.
   For the CLI, the first command resolves the reference; subsequent commands
   read the cached literal at `~/.config/onenv-manager/op-token` (mode 0600).

Tradeoffs:
- Token compromise = vault compromise. Store carefully (keychain / sealed env).
- Service accounts can't access personal vaults — keep `onenv` vault scoped.
- Audit log will attribute reads to the service account, not your user.
- After rotating the SA token, delete `~/.config/onenv-manager/op-token` (or
  let the next failed `op` call self-invalidate the cache) so the CLI
  re-resolves the new value.

> **Note:** The code reads env vars via `process.env` directly — there is no built-in dotenv loader. Use Bun's `--env-file .env` flag or Node 20+'s `--env-file` to load `.env` files:
>
> ```bash
> bun --env-file .env run start
> ```

## Configure — manager (optional)

```bash
cp onenv-manager/.env.example onenv-manager/.env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ONENV_VAULT` | No | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | No | `API Credential` | 1Password item category |

## Link CLI globally (manager)

```bash
cd onenv-manager && bun link
```

This makes `onenv` available system-wide.

## Run & verify

### Manager

```bash
# Development mode (with watch)
cd onenv-manager && bun run dev
# or with just
just dev

# Production
onenv-manager list
```

### Agent API

```bash
cd onenv-api

# Development
bun run dev

# Production
bun run start

# Verify
curl http://127.0.0.1:4317/health
```

### Auth headers (agent-api)

All endpoints except `/health` require:

```
x-onenv-token: <your-AGENT_API_TOKEN>
```

Optional agent identifier for permission prompts:

```
x-agent-name: my-agent
```

## State file location

The manager stores disabled-key state at:

```
~/.config/onenv-manager/state.json
```

Or `$XDG_CONFIG_HOME/onenv-manager/state.json` if `XDG_CONFIG_HOME` is set.

## API endpoints

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/health` | No | No |
| GET | `/v1/namespaces` | Yes | No |
| GET | `/v1/namespaces/:namespace/vars` | Yes | No |
| POST | `/v1/vars/set` | Yes | Yes |
| POST | `/v1/vars/edit` | Yes | Yes |
| POST | `/v1/vars/unset` | Yes | Yes |
| POST | `/v1/vars/disable` | Yes | Yes |
| POST | `/v1/vars/enable` | Yes | Yes |
| POST | `/v1/env/export` | Yes | Yes |
