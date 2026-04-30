# Agent API (`onenv-api`)

HTTP API: use when can't shell `onenv` — agents, daemons, runtimes without TTY.

Human/interactive: prefer CLI.

## Start the server

```bash
cd onenv-api
bun run start                  # production (compiled)
bun run dev                    # watch mode
```

Default: `127.0.0.1:4317`. Override: `API_HOST` / `API_PORT`.

## Auth

All except `/health` require:

```
x-onenv-token: <AGENT_API_TOKEN>
```

Optional, approval prompts:

```
x-agent-name: my-agent
```

## Endpoints

| Method | Path | Approval |
|--------|------|----------|
| GET | `/health` | — |
| GET | `/v1/namespaces` | No |
| GET | `/v1/namespaces/:ns/vars` | No |
| POST | `/v1/vars/set` | Yes |
| POST | `/v1/vars/edit` | Yes |
| POST | `/v1/vars/unset` | Yes |
| POST | `/v1/vars/disable` | Yes |
| POST | `/v1/vars/enable` | Yes |
| POST | `/v1/env/export` | Yes |

## Permission flow

POST endpoints block until human approves via:

- **Desktop** — AppleScript dialog on macOS
- **Telegram** — bot message; reply `/allow <id>` or `/deny <id>`

Configure: `PERMISSION_MODE` (`desktop` · `telegram` · `either` · `both`). Timeout: `PERMISSION_TIMEOUT_MS` (default 120s).

## Read example

```bash
curl -s -H "x-onenv-token: $AGENT_API_TOKEN" \
  http://127.0.0.1:4317/v1/namespaces/aws/vars
# {"vars":[{"key":"AWS_KEY","disabled":false},...]}
```

## Mutate example

```bash
curl -s -X POST \
  -H "x-onenv-token: $AGENT_API_TOKEN" \
  -H "x-agent-name: my-bot" \
  -H "Content-Type: application/json" \
  -d '{"namespace":"aws","key":"AWS_KEY","value":"AKIA..."}' \
  http://127.0.0.1:4317/v1/vars/set
```

Shows desktop/Telegram prompt. Blocks until approved or timed out.

## Rate limiting

Mutating endpoints: 60 req/min per-token. Exceeded → 429 + `Retry-After`.

## Logging

JSON to stdout per request:

```json
{"ts":"2026-04-30T15:43:15.113Z","method":"GET","path":"/v1/namespaces","status":200,"ms":1488,"agent":"my-bot"}
```

Pipe `jq` for filtering, ship to log aggregator.

## Headless / no prompts

Set service account token (see [`service-account-setup.md`](service-account-setup.md)). API never triggers biometric prompts calling `op`.