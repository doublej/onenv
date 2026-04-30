# CI and deploys

Non-interactive use of onenv requires a 1Password Service Account token. Biometric / desktop auth doesn't exist on CI runners.

## Prerequisites

1. Create a Service Account scoped to the relevant vault. See [`service-account-setup.md`](service-account-setup.md).
2. Store the token in the CI provider's secret store (GitHub Actions secrets, GitLab CI variables, etc.).

## GitHub Actions

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: 1password/install-cli-action@v1
      - uses: oven-sh/setup-bun@v2

      - run: bun install
      - run: bun link onenv-manager   # or install from registry

      - name: Run with secrets
        env:
          OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          ONENV_VAULT: onenv-prod
        run: onenv run --ns my-app -- bun run deploy
```

## GitLab CI

```yaml
deploy:
  image: oven/bun
  variables:
    OP_SERVICE_ACCOUNT_TOKEN: $OP_SA_TOKEN
    ONENV_VAULT: onenv-prod
  script:
    - apt-get update && apt-get install -y 1password-cli
    - bun install
    - onenv run --ns my-app -- bun run deploy
```

## Docker / Kubernetes

Pass the SA token via:

- Docker: `--env OP_SERVICE_ACCOUNT_TOKEN=...` or `--env-file`
- Kubernetes: a Secret mounted as env var.

Never bake the token into the image. Don't commit it to a Helm chart.

## Server daemons (launchd / systemd)

For `onenv-api` running as a long-lived service:

- macOS: see `docs/examples/onenv-api.plist`.
- Linux: drop-in unit file with `Environment="OP_SERVICE_ACCOUNT_TOKEN=..."` or `EnvironmentFile=/etc/onenv-api.env` (root-only mode 0600).

## Best practices

- Scope the SA narrowly: read-only if the runner only consumes secrets; write only for rotation jobs.
- Rotate tokens on a schedule (quarterly) and after any incident.
- Audit the 1Password access log to confirm CI is reading what you expect.
- Use vault-per-env (`onenv-prod`) so dev SAs can never read prod keys.
- Don't echo `onenv export` output in CI logs — `set +x` first.

## Smoke check

```bash
op whoami                  # confirms SA token works
onenv list --ns my-app     # confirms vault access
```

If `op whoami` fails, the token is wrong or revoked. Fix that before debugging onenv.
