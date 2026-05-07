# Multi-environment namespaces

Dev/staging/prod separation strategies. Pick one — no mixing.

## Suffix style (recommended for most)

Append env to namespace:

```
aws-dev/AWS_KEY
aws-prod/AWS_KEY
stripe-dev/STRIPE_SECRET
stripe-prod/STRIPE_SECRET
```

Per-project `.onenv.json` declares which it uses:

```json
{ "namespaces": ["aws-dev", "stripe-dev"] }
```

Pros: explicit, no ambiguity. Cons: namespace count doubles.

## Recent refs

Use recent refs for ad-hoc commands:

```bash
onenv list aws-prod
onenv export @last -- node app.js
```

`.onenv.json` should keep concrete namespaces so code review can see which environment a project uses.

## Single namespace + key prefix (don't)

```
aws/DEV_AWS_KEY
aws/PROD_AWS_KEY
```

Avoid. App code needs to know which prefix to read, `onenv run` injects both. One mistake = prod key leaked into dev process.

## Vault-per-env (advanced)

Set `ONENV_VAULT=onenv-prod` on prod machines, `onenv-dev` elsewhere. Item titles stay clean (`aws/AWS_KEY`).

```bash
op vault create onenv-dev
op vault create onenv-prod
```

Pros: hard isolation; SA tokens scopeable per vault. Cons: items don't cross-reference; rotation per-vault.

Use when: prod/dev managed by different teams or different compliance requirements.

## CI / deploy

CI uses prod creds via service account scoped to prod vault. See [`ci-and-deploys.md`](ci-and-deploys.md).
