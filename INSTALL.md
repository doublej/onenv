# Installation Guide

## Prerequisites

| Dependency | Required | Install |
|------------|----------|---------|
| [Bun](https://bun.sh) | Yes | `curl -fsSL https://bun.sh/install \| bash` |
| [1Password CLI](https://developer.1password.com/docs/cli/) | Yes | `brew install 1password-cli` |
| [1Password desktop app](https://1password.com/downloads) | Yes | Required for biometric unlock / CLI integration |
| [just](https://github.com/casey/just) | Optional | `brew install just` (task runner) |
| macOS | Optional | Only required to use the `ONENV_CONFIRM_MUTATIONS` desktop dialog |

## Clone & install

```bash
git clone <repo-url> onenv && cd onenv
bun install.ts
```

The installer walks through dependency install, build, vault creation, and
linking `onenv` system-wide. If you prefer manual steps:

```bash
cd onenv-manager && bun install && bun run build && bun link && cd ..
```

## 1Password setup

1. Sign in to the CLI: `op signin`
2. Verify: `op whoami`
3. Create the vault (or let the installer do it):
   ```bash
   op vault create onenv
   ```

## Configure

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ONENV_VAULT` | No | `onenv` | 1Password vault name |
| `ONENV_CATEGORY` | No | `API Credential` | 1Password item category |
| `ONENV_CONFIRM_MUTATIONS` | No | unset | Set to `1` on macOS to gate `set` / `edit` / `unset` / `import` behind an AppleScript desktop dialog |
| `PERMISSION_TIMEOUT_MS` | No | `120000` | Confirm-dialog timeout in ms (only used when `ONENV_CONFIRM_MUTATIONS=1`) |
| `OP_SERVICE_ACCOUNT_TOKEN` | No | — | Skips biometric prompts (see below) |

### Avoiding constant 1Password approvals

By default `op` requires biometric unlock (Touch ID / desktop app) for every
secret read. Any process invoking the `onenv` CLI will trigger prompt spam.

To run headless / no-prompts, create a **1Password service account**:

1. 1Password web → **Developer** → **Service Accounts** → **Create**.
2. Grant **read + write** access to the `onenv` vault.
3. Set `OP_SERVICE_ACCOUNT_TOKEN` in the shell that runs the `onenv` CLI.
   Two forms accepted:

   ```
   # literal — fastest, but plaintext on disk
   OP_SERVICE_ACCOUNT_TOKEN=ops_eyJ...

   # 1Password reference — resolved on first use via `op read`
   # (one biometric prompt; cached afterwards, zero during normal operation)
   OP_SERVICE_ACCOUNT_TOKEN=op://Personal/<item-id>/credential
   ```

4. The first `onenv` command resolves the reference; subsequent commands
   read the cached literal at `~/.config/onenv-manager/op-token` (mode 0600).

Tradeoffs:
- Token compromise = vault compromise. Store carefully (keychain / sealed env).
- Service accounts can't access personal vaults — keep `onenv` vault scoped.
- Audit log will attribute reads to the service account, not your user.
- After rotating the SA token, delete `~/.config/onenv-manager/op-token` (or
  let the next failed `op` call self-invalidate the cache) so the CLI
  re-resolves the new value.

> **Note:** The code reads env vars via `process.env` directly — there is no
> built-in dotenv loader. If you keep settings in a `.env`, source it from
> your shell or use `onenv export <ns> -- <cmd>` to inject them into the
> child process.

## Link CLI globally

```bash
cd onenv-manager && bun link
```

This makes `onenv` available system-wide.

## Run & verify

```bash
# Development mode (with watch)
cd onenv-manager && bun run dev
# or with just
just dev

# Production (after `bun link` makes `onenv` global)
onenv list
```

## State file location

The CLI stores disabled-key state at:

```
~/.config/onenv-manager/state.json
```

Or `$XDG_CONFIG_HOME/onenv-manager/state.json` if `XDG_CONFIG_HOME` is set.
