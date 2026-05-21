# Service Account setup

Without: `op` triggers biometric/desktop unlock per secret read. Any non-trivial scripting will hammer that prompt.

1Password Service Account = non-human identity, own token. `op` skips biometric entirely.

## Create the SA

1. 1Password web → **Developer** → **Service Accounts** → **Create**.
2. Name it (e.g. `onenv-ci`).
3. Grant **read + write** on `onenv` vault. No other vaults.
4. Copy token (`ops_eyJ...`). Shown once.

## Wire it up

Set `OP_SERVICE_ACCOUNT_TOKEN` in the shell or environment that runs `onenv`:

```bash
export OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...
```

`op whoami` should now report the service account, not your human user.

## Reference form (optional)

Store the token in 1Password and reference it instead of pasting the literal:

```bash
export OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<item-id>/credential
```

The CLI resolves the reference on first invocation and caches the literal at `~/.config/onenv-manager/op-token` (mode 0600). Subsequent runs read the cache — zero prompts.

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
2. Update `OP_SERVICE_ACCOUNT_TOKEN` in your shell / CI secrets / launchd plist.
3. Delete `~/.config/onenv-manager/op-token` so the CLI re-resolves on next call (skip if you use the literal form).
4. Delete the old SA in the 1Password web app.