# Running commands with secrets

2 ways inject secrets into process. Pick by surface.

## `onenv run --` (preferred)

Runs cmd with secrets in env. Never touch shell.

```bash
onenv run -- node app.js
onenv run -- python -m my_pkg
onenv run -- bun start
```

Reads `.onenv.json` for namespaces. Use `onenv export ns -- cmd` for one-off namespace selection.

## `onenv export`

Prints enabled values as JSON, or runs a command with selected namespace values injected:

```bash
onenv export aws,project
onenv export aws,project -- node app.js
```

Use for: debug and one-off namespace selection. Prefer `run` when a project has `.onenv.json`.

## In Node / TypeScript

Best: `onenv run --` from parent shell, read via `process.env.MY_KEY`. Don't shell out to `onenv export` from app code.

If must, use HTTP API (`onenv-api`) — see [`agent-api.md`](agent-api.md).

## Disabled keys

`onenv run` and `onenv export` skip disabled keys. Re-enable with `onenv enable`.
