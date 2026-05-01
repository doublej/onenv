export function printPrime(): void {
  const xml = `<onenv version="0.1.0">
1Password-backed secret management. All commands return structured JSON (--json or piped).

<workflow>
  Project setup (once):
    1. onenv set NAMESPACE KEY [value] — store secrets (prompts for value if omitted)
    2. cd PROJECT &amp;&amp; onenv init — pick namespaces + run command, saves .onenv.json
    3. onenv run — fetches secrets, injects as env vars, runs the configured command

  Ad-hoc:
    onenv export ns1,ns2 -- CMD — run CMD with secrets injected
    onenv export ns1,ns2 — output as JSON
</workflow>

<commands>
  set ns key [value] — Create or update a secret. onenv set aws AWS_KEY myvalue
  edit ns key [value] — Update an existing secret's value.
  unset ns key... — Delete secrets. onenv unset aws KEY1 KEY2
  list [ns] — List namespaces (no arg) or variables in a namespace.
  disable ns key... — Exclude from export without deleting.
  enable ns key... — Re-include in export.
  init — Interactive project setup, saves .onenv.json.
  run — Run project command from .onenv.json with secrets as env vars.
  export ns[,ns2] — Export enabled secrets as JSON.
  export ns -- cmd... — Run cmd with secrets injected. onenv export porkbun -- python app.py
</commands>

<errors>
  JSON: { code, message, category, retryable, hint?, suggestion? }
  VALIDATION / NOT_FOUND / VAULT_NOT_FOUND — user_error, not retryable
  OP_AUTH — transient, retryable
  OP_ERROR — upstream, not retryable
</errors>

<api>
  onenv-api provides HTTP access (requires AGENT_API_TOKEN).
  POST http://localhost:4317/v1/env/export -H "x-onenv-token: TOKEN" -d '{"namespaces":["aws"]}'
  Mutating calls require permission approval (desktop dialog or Telegram).
</api>

<config>
  ONENV_VAULT (default: onenv) — vault name
  ONENV_CATEGORY (default: API Credential) — item category
  State: ~/.config/onenv-manager/state.json
</config>
</onenv>`

  process.stdout.write(`${xml}\n`)
}
