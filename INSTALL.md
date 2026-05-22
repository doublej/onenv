# Installation Guide

## Prerequisites

| Dependency | Required | Install |
|------------|----------|---------|
| [Bun](https://bun.sh) | Yes | `curl -fsSL https://bun.sh/install \| bash` |
| [1Password CLI](https://developer.1password.com/docs/cli/) | Yes | `brew install 1password-cli` |
| [1Password desktop app](https://1password.com/downloads) | Yes | Required for biometric unlock / CLI integration |
| [just](https://github.com/casey/just) | Optional | `brew install just` (task runner) |
| macOS | Recommended | All workflows tested on macOS; Linux works headless with a service account |

## Get it

```bash
git clone https://github.com/doublej/onenv && cd onenv
bun install.ts             # interactive setup wizard — does the rest
```

The wizard:

1. Installs dependencies and builds the CLI.
2. Links `onenv` system-wide via `bun link`.
3. Walks you through 1Password sign-in and vault creation.
4. Offers to scan your projects for existing `.env` files and import them.

If you'd rather do it by hand:

```bash
bun install
bun run build
bun link               # makes `onenv` global
```

## 1Password setup

1. Sign in to the CLI: `op signin`
2. Verify: `op whoami`
3. Create the vault (or let the installer do it):
   ```bash
   op vault create onenv
   ```

## Avoiding constant biometric prompts

By default `op` requires biometric unlock (Touch ID / desktop app) for every
secret read. Any non-trivial scripting will hammer that prompt.

To run headless / no-prompts, create a **1Password service account**:

1. 1Password web → **Developer** → **Service Accounts** → **Create**.
2. Grant **read + write** access to the `onenv` vault.
3. Set `OP_SERVICE_ACCOUNT_TOKEN` in the shell that runs `onenv`. Two forms accepted:

   ```bash
   # literal — fastest, but plaintext on disk
   export OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...

   # 1Password reference — resolved on first use via `op read`
   # (one biometric prompt; cached afterwards, zero during normal operation)
   export OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<item-id>/credential
   ```

The first command resolves the reference; subsequent commands read the cached literal at `~/.config/onenv-manager/op-token` (mode 0600). After rotating the SA token, delete that cache file (or let the next failed `op` call self-invalidate it) so the CLI re-resolves.

Tradeoffs:
- Token compromise = vault compromise. Store carefully (keychain / sealed env).
- Service accounts can't access personal vaults — keep the `onenv` vault scoped.
- Audit log will attribute reads to the service account, not your user.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OP_SERVICE_ACCOUNT_TOKEN` | No | — | Skips biometric prompts. Literal `ops_eyJ...` or `op://...` reference. |
| `ONENV_VAULT` | No | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | No | `API Credential` | 1Password item category |
| `XDG_CONFIG_HOME` | No | `~/.config` | Where state and the token cache live |
| `XDG_RUNTIME_DIR` | No | `os.tmpdir()` | Where `onenv run --file` materializes JSON tempfiles |

`onenv` reads env vars via `process.env` directly — there is no built-in
dotenv loader. Set them in your shell rc, or wrap with Bun's `--env-file .env`
flag if you really want a file.

## Verify

```bash
onenv list                 # all namespaces in your vault (or [] if empty)
onenv set demo HELLO       # interactive prompt, type any value
onenv get demo HELLO --fingerprint
# sha256:f5a1...
onenv unset demo HELLO --yes
```

## State files

| Path | What it holds |
|------|---------------|
| `~/.config/onenv-manager/state.json` | Which keys are `disable`d (excluded from `run` / `export`) |
| `~/.config/onenv-manager/op-token` | Cached service-account literal, mode 0600 |
| `~/.config/onenv-manager/refs.json` | Most-recent namespace list for `@1` / `@2` / `@last` |
| `.onenv.json` (per project) | Namespaces this project pulls — commit it |
