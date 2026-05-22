import { buildCommands, buildErrors, buildState } from './prime-data-cli.js'

export interface PrimerData {
  version: string
  summary: string
  safety: SafetySection
  setup: SetupSection
  naming: NamingSection
  refs: RefsSection
  workflow: WorkflowSection
  commands: CommandSpec[]
  state: StateEntry[]
  errors: ErrorsSection
  output_contract: OutputContract
  permission: PermissionSection
}

export interface SafetySection {
  description: string
  rules: string[]
}

export interface SetupSection {
  description: string
  service_account_token: string
  vault: string
  category: string
  item_layout: string
}

export interface NamingSection {
  namespace_regex: string
  namespace_max_length: number
  key_regex: string
  key_max_length: number
  injection_warning: string
}

export interface RefsSection {
  description: string
  syntax: string[]
  state_file: string
}

export interface WorkflowSection {
  project_setup: string[]
  ad_hoc: string[]
}

export interface CommandSpec {
  name: string
  description: string
  output: string
}

export interface StateEntry {
  path: string
  description: string
}

export interface ErrorCode {
  code: string
  category: string
  retryable: boolean
  meaning: string
}

export interface ErrorsSection {
  envelope: string
  exit_code: string
  codes: ErrorCode[]
}

export interface OutputContract {
  description: string
  raw_data: string
  envelope: string
  child_process: string
  json_mode_trigger: string
}

export interface PermissionSection {
  description: string
  trigger_env: string
  timeout_env: string
  gated_commands: string[]
  error_code: string
}

export function buildPrimer(version: string): PrimerData {
  return {
    version,
    summary:
      'You are using `onenv`, a CLI that reads and writes secrets stored in 1Password. Use only the commands and flags documented below — do not invent new ones. stdout is JSON whenever it is not a TTY or `--json` is set; depend on those shapes.',
    safety: buildSafety(),
    setup: {
      description:
        'Authenticate via service account (headless) or interactive op signin. The CLI auto-resolves op:// references on first use.',
      service_account_token:
        'Set OP_SERVICE_ACCOUNT_TOKEN to either a literal "ops_eyJ..." token OR an "op://vault/item/field" reference. References are resolved once via "op read" and cached at ~/.config/onenv-manager/op-token (mode 0600). Self-healing: stale cache is cleared automatically on auth failure. Without a service account, "op signin" + biometric is used.',
      vault: 'ONENV_VAULT (default: "onenv")',
      category: 'ONENV_CATEGORY (default: "API Credential")',
      item_layout:
        'Each secret is a 1Password item titled "namespace/KEY", tagged "onenv:<namespace>" (the prefix marks it as managed by onenv and is the filter the CLI uses), with the secret value in the "credential" field.',
    },
    naming: {
      namespace_regex: '^[A-Za-z0-9][A-Za-z0-9_.-]*$',
      namespace_max_length: 128,
      key_regex: '^[A-Za-z_][A-Za-z0-9_]*$',
      key_max_length: 128,
      injection_warning:
        'BARE KEYS: `export` and `run` inject keys without a namespace prefix as env vars. The same enabled key appearing in two merged namespaces is a hard VALIDATION error. Keep keys unique across namespaces you combine; resolve collisions by disabling the duplicate or splitting the namespaces.',
    },
    refs: {
      description:
        'Any namespace argument accepts @-refs. Strings without a leading @ pass through unchanged. Refs are 1-indexed against the most recent namespace list seen by the CLI.',
      syntax: [
        '@1, @2, ... @N — index into the last-seen namespace list',
        '@last — the last namespace acted on',
      ],
      state_file: '~/.config/onenv-manager/refs.json (mode 0600)',
    },
    workflow: {
      project_setup: [
        'onenv set NAMESPACE KEY    # interactive value prompt, stores in 1Password',
        'cd PROJECT && onenv init   # pick namespaces, writes .onenv.json',
        'onenv run -- CMD           # fetch project secrets, inject as env, exec CMD',
      ],
      ad_hoc: [
        'onenv export ns1,ns2 -- CMD   # one-shot inject, exec',
        'onenv export ns1,ns2          # print {KEY:"value",...} as JSON',
        'onenv list                    # all namespaces',
        'onenv list NAMESPACE          # keys in NAMESPACE (no values)',
      ],
    },
    commands: buildCommands(),
    state: buildState(),
    errors: buildErrors(),
    output_contract: {
      description:
        'Output mode: TTY → human text (chalk). Piped or --json → machine-readable JSON.',
      raw_data:
        'list, list <ns>, export <ns> emit raw data (string[], [{key,disabled}], {KEY:"val"}).',
      envelope:
        'set, edit, unset, disable, enable, init emit {ok:true, message, ...data} in JSON mode.',
      child_process:
        'run / "export -- cmd" replace the onenv process with the child for stdio purposes; exit code mirrors the child.',
      json_mode_trigger:
        'Pass --json explicitly, OR run with stdout not a TTY (pipes, scripts, CI). Either triggers JSON mode globally.',
    },
    permission: buildPermission(),
  }
}

function buildSafety(): SafetySection {
  return {
    description:
      'Item titles and namespace names are sensitive metadata — they enumerate which services the user depends on. Treat the vault contents like a target map, not just the secret values.',
    rules: [
      'Read via onenv, not raw `op` — onenv filters to items tagged `onenv:<namespace>`, so it never reveals unmanaged items in the vault.',
      'Scope listings: prefer `onenv list <namespace>` over `onenv list`, and avoid piping unfiltered listings into shared contexts (chats, PRs, screenshots, transcripts).',
      'Never echo raw secret values to stdout/logs. Use `onenv run -- <cmd>` or `onenv export <ns> -- <cmd>` to inject; use `onenv get --fingerprint` to compare without exposing the value.',
      'Mutations (`set`, `edit`, `unset`, `import`) hit 1Password — not local files. Before `unset`, `import --overwrite`, or batch `set`/`edit`: state a 1-line plan and wait for the user to approve.',
      'Do not commit `.onenv.json` fields that contain secret values; the file should only reference namespaces.',
    ],
  }
}

function buildPermission(): PermissionSection {
  return {
    description:
      'Opt-in confirm-on-write. When enabled, the listed commands display a macOS AppleScript dialog before mutating 1Password. Deny → the command throws PERMISSION_DENIED and nothing changes. macOS only; the CLI errors if the flag is set on any other platform. Useful when an agent or long-running script should pause on every write.',
    trigger_env: 'ONENV_CONFIRM_MUTATIONS=1 (any other value, including unset, disables it)',
    timeout_env: 'PERMISSION_TIMEOUT_MS (optional, default 120000ms; minimum 10s)',
    gated_commands: ['set', 'edit', 'unset', 'import'],
    error_code: 'PERMISSION_DENIED on deny / timeout (category: user_error, exit code 1)',
  }
}
