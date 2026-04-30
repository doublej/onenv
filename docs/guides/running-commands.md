# Running commands with secrets

3 ways inject secrets into process. Pick by surface.

## `onenv run --` (preferred)

Runs cmd with secrets in env. Never touch shell.

```bash
onenv run -- node app.js
onenv run -- python -m my_pkg
onenv run -- bun start
```

Reads `.onenv.json` for namespaces. Override with `--ns`:

```bash
onenv run --ns aws -- aws s3 ls
onenv run --ns @prod --ns stripe -- node app.js
```

## `onenv export`

Prints `KEY=value` to stdout. Source into current shell:

```bash
eval "$(onenv export)"
node app.js
```

Use for: long-lived REPLs, debug, one-off sessions. Avoid in scripts — `run` cleaner.

## Shell integration (auto-load on `cd`)

Add to `~/.zshrc` / `~/.bashrc`:

```bash
chpwd_onenv() {
  [[ -f .onenv.json ]] && eval "$(onenv export 2>/dev/null)"
}
add-zsh-hook chpwd chpwd_onenv  # zsh
# bash: trap '[[ "$PWD" != "$LAST_PWD" ]] && chpwd_onenv; LAST_PWD="$PWD"' DEBUG
```

Trade-off: secrets enter every shell in dir. Convenient, less safe.

## In Node / TypeScript

Best: `onenv run --` from parent shell, read via `process.env.MY_KEY`. Don't shell out to `onenv export` from app code.

If must, use HTTP API (`onenv-api`) — see [`agent-api.md`](agent-api.md).

## Disabled keys

`onenv run` and `onenv export` skip disabled keys. Re-enable with `onenv enable`.