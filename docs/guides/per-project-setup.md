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

```bash
onenv init --add stripe
```

Or edit `.onenv.json` directly:

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

## Refs (`@aliases`)

Long names tedious. Define alias:

```bash
onenv ref set @prod my-app-prod
onenv run --ns @prod -- node app.js
```

Refs in `~/.config/onenv-manager/refs.json`, not repo.

## Discoverability

Once `.onenv.json` exists, agents/tooling discover keys via:

```bash
onenv prime
```

Returns XML of namespaces + keys. Ground truth — no guessing key names.