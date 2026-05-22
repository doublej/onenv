export const ROOT_HELP_EXAMPLES = `
Examples:
  $ onenv
      Open the interactive TUI
  $ onenv set aws AWS_ACCESS_KEY_ID
      Store a secret in 1Password under the "aws" namespace
  $ onenv init
      Pick namespaces for the current project (writes .onenv.json)
  $ onenv run -- node app.js
      Inject the project's secrets and exec the command
  $ onenv export aws,cloudflare -- terraform apply
      Inject ad-hoc namespaces and exec a one-off command
  $ onenv list aws
      Show keys in the "aws" namespace (no values)
  $ onenv doctor
      Run health checks (op CLI, vault, project config)
  $ onenv prime
      Print the agent primer (full CLI + API contract)

Run \`onenv <command> --help\` for command-specific examples.`
