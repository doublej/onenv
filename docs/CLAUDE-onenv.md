<onenv version="1">
Secrets via 1Password vault `onenv`. CLI: `onenv`. HTTP API: `onenv-api`. Replaces `.env` files.

<rules>
First step in any onenv project: `onenv prime`. Returns XML of namespaces + keys — treat as ground truth. Don't guess key names.
NEVER create/read/reference `.env`. NEVER paste secret literals in code/configs/commits/messages.
Add secret: `onenv set <namespace> <KEY>` (interactive). Never write secrets to files.
Run cmd needing secrets: `onenv run -- <cmd>`. Not manual `export`, not shell injection.
Rotate: `onenv set` overwrites. Retire: `onenv disable <ns> <KEY>` (preserves history) over `unset` (destructive).
</rules>

<data_model>
Vault `onenv` (override: `ONENV_VAULT`). Items titled `namespace/KEY`. Tag = namespace. Field `credential` = value.
Per-project: `.onenv.json` declares namespaces used. `@refname` = namespace alias.
State: `~/.config/onenv-manager/state.json` tracks disabled keys.
</data_model>

<commands>
prime · list · set · unset · disable · enable · run -- · export · init · tui · edit
Single-ns fetch: `onenv list <ns>`. All ns: `onenv list`.
</commands>

<api>
`onenv-api` (Express, default :4317). Auth header `x-onenv-token`. Optional `x-agent-name`.
GET (read): no approval. POST (mutate/export): require human approval via desktop AppleScript or Telegram broker.
Use API only when agent w/o TTY. Else CLI.
</api>

<guides>
Read on demand when task matches. Path `docs/guides/`:
- migrating-from-dotenv.md — bulk import `.env`, retire it
- per-project-setup.md — `.onenv.json`, ns conventions, `onenv init`
- running-commands.md — `onenv run --`, `export`, shell integration
- agent-api.md — when HTTP API, auth, permission flow
- service-account-setup.md — headless/no-prompt for daemons
- rotation-and-disable.md — expiry, `disable` vs `unset`, key hygiene
- multi-env-namespaces.md — dev/staging/prod patterns, `@refs`
- ci-and-deploys.md — non-interactive, service account tokens
</guides>
</onenv>