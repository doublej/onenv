# Service Account setup

Without: `op` triggers biometric/desktop unlock per secret read. Agents calling `onenv-api` repeatedly — and any process invoking the `onenv` CLI — spam approvals.

1Password Service Account = non-human identity, own token. `op` skips biometric entirely.

## Create the SA

1. 1Password web → **Developer** → **Service Accounts** → **Create**.
2. Name it (e.g. "onenv-api-prod").
3. Grant **read + write** on `onenv` vault. No other vaults.
4. Copy token (`ops_eyJ...`). Shown once.

## Wire it up

In `onenv-api/.env`:

```
OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...
```

Restart. Startup log shows:

```
1password auth: service-account
```

## Reference form (optional)

Store token in 1Password, reference instead of plaintext:

```
OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<item-id>/credential
```

Both surfaces resolve the reference automatically:

- `onenv-api` resolves at startup via one `op read` call (one biometric on boot, zero during operation).
- The `onenv` CLI resolves on first invocation and caches the literal at `~/.config/onenv-manager/op-token` (mode 0600). Subsequent CLI runs read the cache — zero prompts.

After rotating the SA token, delete `~/.config/onenv-manager/op-token` so the CLI re-resolves the new value. (The cache also self-invalidates when `op` reports the cached token as invalid/expired.)

## Tradeoffs

- Token compromise = vault compromise. Store in keychain or sealed env.
- Audit trail attributes reads to SA, not your user.
- SAs can't access personal vaults — keep `onenv` scoped.
- SA tokens don't expire by default; rotate manually if compromised.

## Headless servers (Linux / Docker)

SAs mandatory — no biometric path. Set env var in service unit / Docker secret:

```bash
# systemd drop-in
[Service]
Environment="OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ..."
```

## Rotation

1. Create new SA, grant same vault access.
2. Update `OP_SERVICE_ACCOUNT_TOKEN` in env.
3. Restart `onenv-api`.
4. Delete old SA in 1Password web.

Zero-downtime: run two API instances, rotate one at a time behind load balancer.