<onenv version="2">
Secrets via 1Password vault `onenv`. Single CLI: `onenv`. Replaces `.env` files.

<rules>
First step in any onenv project: `onenv prime`. Returns the full CLI spec (commands, flags, error envelope, state files) — treat as ground truth. Use `onenv list` (no args) for namespaces, `onenv list <ns>` for keys in one. Don't guess key names.
NEVER create/read/reference `.env`. NEVER paste secret literals in code/configs/commits/messages.
Add secret: `onenv set <namespace> <KEY>` (interactive). For scripted/piped sources: `… | onenv set <ns> <KEY> --value-stdin`.
Compare without exposing: `onenv get <ns> <KEY> --fingerprint` returns `sha256:<hex>`. Use `onenv check` to detect drift between `process.env` and onenv-stored secrets in a project.
Run cmd needing secrets: `onenv run -- <cmd>`. Not manual `export`, not shell injection.
Rotate: `onenv set` overwrites. Retire: `onenv disable <ns> <KEY>` (preserves history) over `unset` (destructive; `unset` refuses in non-TTY contexts unless `--yes`).
Bulk import: `onenv import <ns> <file> --group <name>` (required). Add `--overwrite` for atomic replace, or `--from-stdin` to skip the file path.
</rules>

<data_model>
Vault `onenv` (override: `ONENV_VAULT`). Items titled `namespace/KEY`. Tag `onenv:<namespace>` (the prefix marks ownership and is the CLI's filter). Field `credential` = value.
Per-project: `.onenv.json` declares namespaces used. Positional namespace refs: `@1`, `@2`, ..., `@last` index into the most recent namespace listing.
State: `~/.config/onenv-manager/state.json` tracks disabled keys (shape `{version:1, disabled:{ns:[keys]}}`). Token cache: `~/.config/onenv-manager/op-token` (mode 0600).
JSON files (GCP service accounts, OAuth tokens, kubeconfigs) can be flattened via `onenv import` and rebuilt via `onenv build-file` or `onenv run --file group:VAR`.
Cross-namespace key collisions in `export` / `run` are a hard error — resolve by disabling one side or splitting namespaces.
</data_model>

<commands>
prime · list [--groups] [--meta] · get [--fingerprint] [--meta] · set [--value-stdin] · edit [--value-stdin] · unset [--yes] · check · disable · enable · run [--file group:VAR] [--file-rw group:VAR] -- · export · init · import [--overwrite] [--from-stdin] --group · build-file · tui
Single-ns fetch: `onenv list <ns>`. All ns: `onenv list`. Group view: `onenv list <ns> --groups`. Drift check: `onenv check`.
</commands>

<guides>
Read on demand when task matches. Path `docs/guides/`:
- migrating-from-dotenv.md — bulk import `.env`, retire it
- per-project-setup.md — `.onenv.json`, ns conventions, `onenv init`
- running-commands.md — `onenv run --`, `export`, shell integration
- service-account-setup.md — headless/no-prompt for daemons
- rotation-and-disable.md — expiry, `disable` vs `unset`, key hygiene
- multi-env-namespaces.md — dev/staging/prod patterns, `@refs`
- ci-and-deploys.md — non-interactive, service account tokens
</guides>
</onenv>
