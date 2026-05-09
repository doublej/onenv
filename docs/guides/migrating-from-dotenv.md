# Migrating from `.env`

Move `.env` keys into 1Password. No code rewrites.

## 1. Pick a namespace

Name per `.env` file. Convention: project slug (`my-app`) or service (`aws`, `stripe`).

```bash
cd my-project
onenv init                  # writes .onenv.json
```

## 2. Bulk import

The installer (`bun install.ts`) ships an interactive `.env` migrator: it scans your projects, lets you pick which `.env` files to import, and writes each key into 1Password under a chosen namespace. Re-run it any time:

```bash
bun install.ts
# answer "Yes" at the "Scan your projects for .env files" prompt
```

For one-off keys, use the interactive prompt:

```bash
onenv set my-app MY_KEY     # paste the value at the masked prompt
```

`onenv set` does not have a `--stdin` flag — values come from the interactive prompt only, by design (avoids leaking secrets into shell history).

## 3. Verify

```bash
onenv list my-app
onenv prime                 # confirm keys appear in primer
```

## 4. Switch runtime

Replace `source .env && node app.js` with:

```bash
onenv run -- node app.js
```

Or in package.json:

```json
{ "scripts": { "start": "onenv run -- node dist/index.js" } }
```

## 5. Retire `.env`

```bash
trash .env                  # don't `rm` — keep a recoverable copy briefly
echo ".env" >> .gitignore   # if not already
```

Confirm CI/deploy scripts use `onenv` (or service-account token).

## Common gotchas

- `.env.example` stays — documents structure, not values.
- Values with `=` survive (split on first `=` only).
- Multiline values: store as-is, `onenv export` preserves newlines.
- Don't commit import script — pipes secrets through shell history.