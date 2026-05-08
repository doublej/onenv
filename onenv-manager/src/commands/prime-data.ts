import { buildApi } from './prime-data-api.js'
import { buildCommands, buildErrors, buildState } from './prime-data-cli.js'

export interface PrimerData {
  version: string
  summary: string
  setup: SetupSection
  naming: NamingSection
  refs: RefsSection
  workflow: WorkflowSection
  commands: CommandSpec[]
  state: StateEntry[]
  errors: ErrorsSection
  output_contract: OutputContract
  api: ApiSection
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

export interface ApiEnv {
  name: string
  required: boolean
  default?: string
  description: string
}

export interface ApiEndpoint {
  method: string
  path: string
  permission: 'none' | 'required'
  body?: string
  response: string
  notes?: string
}

export interface ApiErrorResponse {
  status: number
  body: string
  when: string
}

export interface ApiSection {
  description: string
  default_url: string
  auth: string
  audit_header: string
  rate_limit: string
  config_env: ApiEnv[]
  endpoints: ApiEndpoint[]
  error_responses: ApiErrorResponse[]
}

export function buildPrimer(version: string): PrimerData {
  return {
    version,
    summary:
      '1Password-backed secret management. CLI (onenv) for humans + scripts; HTTP API (onenv-api) for agents with permission brokering. All output is JSON when piped or --json is set.',
    setup: {
      description:
        'Authenticate via service account (headless) or interactive op signin. The CLI auto-resolves op:// references on first use.',
      service_account_token:
        'Set OP_SERVICE_ACCOUNT_TOKEN to either a literal "ops_eyJ..." token OR an "op://vault/item/field" reference. References are resolved once via "op read" and cached at ~/.config/onenv-manager/op-token (mode 0600). Self-healing: stale cache is cleared automatically on auth failure. Without a service account, "op signin" + biometric is used.',
      vault: 'ONENV_VAULT (default: "onenv")',
      category: 'ONENV_CATEGORY (default: "API Credential")',
      item_layout:
        'Each secret is a 1Password item titled "namespace/KEY", tagged with the namespace, with the secret value in the "credential" field.',
    },
    naming: {
      namespace_regex: '^[A-Za-z0-9][A-Za-z0-9_.-]*$',
      namespace_max_length: 128,
      key_regex: '^[A-Za-z_][A-Za-z0-9_]*$',
      key_max_length: 128,
      injection_warning:
        'FOOTGUN: "export" and "run" inject BARE keys (no namespace prefix) as env vars. If the same KEY exists in two namespaces, the order is unspecified and the last write wins silently. Keep keys unique across namespaces you combine.',
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
    api: buildApi(),
  }
}
