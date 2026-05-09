# Per-project setup

`.onenv.json` declares project namespaces. `onenv prime` + `onenv run` read it.

## Initialize

```bash
cd my-project
onenv init
```

Writes `.onenv.json`:

```json
{
  "namespaces": ["my-app"]
}
```

Commit — metadata, not secrets.

## Add a namespace

Re-run `onenv init` (the multi-select picks up your previous choices and adds new ones), or edit `.onenv.json` directly:

```json
{
  "namespaces": ["my-app", "stripe", "github"]
}
```

## Namespace conventions

- **Per-service**: `aws`, `stripe`, `github`, `openai` — shared across projects hitting same API.
- **Per-project**: `my-app-prod`, `my-app-staging` — isolation when teams diverge.
- **Per-env suffix**: `my-app-dev`, `my-app-prod` — see `multi-env-namespaces.md`.

Pick one style, stay consistent. Don't mix unless project spans both.

## Recent refs

Long names tedious. Recent namespace commands populate `@1`, `@2`, and `@last`:

```bash
onenv list my-app-prod
onenv export @last -- node app.js
```

Refs live in `~/.config/onenv-manager/refs.json`, not repo.

## Discoverability

Once `.onenv.json` exists, agents/tooling can list secrets and learn the CLI/API contract via:

```bash
onenv list           # all namespaces in your vault
onenv list my-app    # keys in one namespace
onenv prime          # full CLI + API spec for agents (XML; --json for machine-readable)
```

`prime` is the ground truth for command shapes and error codes; `list` is the ground truth for what keys exist.
