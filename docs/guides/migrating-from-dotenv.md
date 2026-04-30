# Migrating from `.env`

Move `.env` keys into 1Password. No code rewrites.

## 1. Pick a namespace

Name per `.env` file. Convention: project slug (`my-app`) or service (`aws`, `stripe`).

```bash
cd my-project
onenv init                  # writes .onenv.json
```

## 2. Bulk import

```bash
# Read existing .env, set each key under the namespace
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  echo "$value" | onenv set my-app "$key" --stdin
done < .env
```

(`--stdin` reads from stdin; if unsupported, run `onenv set` per key interactively.)

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