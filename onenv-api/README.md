# onenv-api

Safe local API for agent access to 1Password-managed environment variables.

## Safety Model

- Binds to `127.0.0.1` by default
- Requires API token on all endpoints except `/health`
- Mutating operations and env export require explicit user permission
- Supports permission brokers:
  - Desktop dialog (macOS AppleScript)
  - Telegram approval (`/allow <id>` / `/deny <id>`)

## Requirements

- Bun
- `op` CLI available in `PATH` (1Password CLI)
- 1Password desktop app (for biometric unlock)

## Install

```bash
bun install
```

## Configure

```bash
export AGENT_API_TOKEN='replace-me'
export PERMISSION_MODE='desktop' # desktop | telegram | either | both

# 1Password config
export ONENV_VAULT='onenv'          # default
export ONENV_CATEGORY='API Credential' # default

# optional telegram broker
export TELEGRAM_BOT_TOKEN='123:abc'
export TELEGRAM_CHAT_ID='123456789'
```

Optional:
- `API_HOST` (default `127.0.0.1`)
- `API_PORT` (default `4317`)
- `PERMISSION_TIMEOUT_MS` (default `120000`)

## Run

```bash
bun run dev
# or
bun run build && bun run start
```

## Endpoints

- `GET /health`
- `GET /v1/namespaces`
- `GET /v1/namespaces/:namespace/vars`
- `POST /v1/vars/set`
- `POST /v1/vars/edit`
- `POST /v1/vars/unset`
- `POST /v1/vars/disable`
- `POST /v1/vars/enable`
- `POST /v1/env/export`

### Auth Headers

- `x-onenv-token: <AGENT_API_TOKEN>`
- optional `x-agent-name: <agent identifier>` (for permission prompts)

### Body Examples

```json
{ "namespace": "aws", "key": "AWS_SECRET_ACCESS_KEY", "value": "..." }
```

```json
{ "namespaces": ["aws", "project"] }
```
