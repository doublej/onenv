import type { CommandSpec, ErrorsSection, StateEntry } from './prime-data.js'

export function buildCommands(): CommandSpec[] {
  return [
    {
      name: 'set <ns> <key>',
      description:
        'Create or update a secret. Reads the value from an interactive password prompt.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,key}.',
    },
    {
      name: 'edit <ns> <key>',
      description:
        'Update an existing secret. Reads the new value from an interactive password prompt.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,key}.',
    },
    {
      name: 'unset <ns> <key...>',
      description: 'Delete one or more secrets from 1Password. Multiple keys allowed.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,keys}.',
    },
    {
      name: 'list [ns] [--groups]',
      description:
        'No arg: list all namespaces. With ns: list keys in that namespace (no values). --groups: bucket keys by their reassembly group field, with "(ungrouped)" for flat keys (slower: fetches per-item metadata).',
      output:
        'No arg → string[]. With ns → [{key:string, disabled:boolean}]. With --groups → {groupName: [{key, disabled, group, path, type}], "(ungrouped)": [...]}. Always raw JSON in JSON mode.',
    },
    {
      name: 'disable <ns> <key...>',
      description:
        'Mark keys as disabled in local state. They remain in 1Password but are excluded from export/run.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,keys}.',
    },
    {
      name: 'enable <ns> <key...>',
      description: 'Re-include previously disabled keys in export/run.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,keys}.',
    },
    {
      name: 'init',
      description:
        'Interactive multi-select of namespaces. Writes .onenv.json in the current directory.',
      output: 'TTY: green confirmation. JSON: {ok:true,message}.',
    },
    {
      name: 'run [--file <group:VAR>...] [--file-rw <group:VAR>...] -- <cmd...>',
      description:
        'Read .onenv.json, fetch enabled secrets across all configured namespaces, exec <cmd> with secrets injected as env vars. Inherits stdio. --file (repeatable) materializes the JSON for a group into a 0600 tempfile under XDG_RUNTIME_DIR (fallback: os tmpdir), exposes its absolute path as the named env var, and removes the tempfile on child exit / SIGINT / SIGTERM. --file-rw behaves identically but also sha256-hashes the materialized file before exec and re-imports it into the same namespace+group on clean child close if the hash changed; writeback is skipped on signal exit, on read failure, or if the hash matches. The group name must be unique across the project namespaces or the command errors.',
      output: 'Mirrors the child exit code. No onenv output written.',
    },
    {
      name: 'import <ns> <file> [--group <name>] [--keys upper-snake|leaf] [--prefix <s>] [--dry-run]',
      description:
        'Flatten a JSON file into onenv keys with reassembly metadata (group, path, type stored as STRING fields on each item). Group name defaults to the filename without extension. --keys upper-snake (default) joins the JSON path with underscores ("installed.client_id" → INSTALLED_CLIENT_ID, "scopes[0]" → SCOPES_0). --keys leaf uses only the last key segment, raising on collisions. --prefix prepends a value to every derived key. Aborts on key collisions or when an existing key has no group / a different group. --dry-run prints the plan without writing.',
      output:
        'TTY: green confirmation. JSON: dry-run → {namespace, group, plan:[{key,path,type}]}. Otherwise → {ok:true,message,namespace,group,count}.',
    },
    {
      name: 'build-file <ns> --group <name> [--out <path>] [--indent <n>]',
      description:
        'Reassemble a grouped JSON file from onenv keys. Sorts entries by stored path, walks the type field to cast each leaf back to its JSON type, and reconstructs nested objects/arrays (including empty containers via sentinels). Errors loudly on missing array indices or type mismatches.',
      output:
        'No --out: prints the reassembled JSON to stdout. With --out: writes the file and emits {ok:true,message,namespace,group,out} in JSON mode.',
    },
    {
      name: 'export <ns[,ns2,...]>',
      description: 'Fetch enabled secrets across the listed namespaces and emit as JSON.',
      output: 'Raw object {KEY:"value",...}. Bare keys, see naming.injection_warning.',
    },
    {
      name: 'export <ns[,ns2,...]> -- <cmd...>',
      description: 'Same as export, but exec <cmd> with the secrets injected instead of printing.',
      output: 'Mirrors the child exit code. No onenv output written.',
    },
    {
      name: 'tui',
      description:
        'Open the interactive @clack-based terminal UI. Equivalent to running "onenv" with no args.',
      output: 'Interactive only. Not for scripting.',
    },
    {
      name: 'prime [--json]',
      description:
        'Print this primer. Emits XML by default, JSON when --json is set or when stdout is not a TTY.',
      output: 'XML or JSON document describing the full CLI + API contract.',
    },
    {
      name: 'onenv <ns>',
      description: 'Bare-arg shorthand: equivalent to "onenv list <ns>". Supports @-refs.',
      output: '[{key,disabled}] — same shape as list <ns>.',
    },
    {
      name: 'onenv',
      description: 'No args: opens the TUI.',
      output: 'Interactive only.',
    },
  ]
}

export function buildState(): StateEntry[] {
  return [
    {
      path: '~/.config/onenv-manager/state.json',
      description: 'Disabled-key tracking. Shape: {version:1, disabled:{ns:[keys]}}. Mode 0600.',
    },
    {
      path: '~/.config/onenv-manager/refs.json',
      description:
        'Last-seen namespace list for @-ref resolution. Shape: {refs:[ns], last:ns}. Mode 0600.',
    },
    {
      path: '~/.config/onenv-manager/op-token',
      description:
        'Resolved service-account token cache (when OP_SERVICE_ACCOUNT_TOKEN was an op:// reference). Mode 0600. Cleared on auth failure.',
    },
    {
      path: '<cwd>/.onenv.json',
      description: 'Per-project config. Shape: {namespaces:string[]}. Created by "onenv init".',
    },
  ]
}

export function buildErrors(): ErrorsSection {
  return {
    envelope: '{ "error": { "code", "message", "category", "retryable", "hint?", "suggestion?" } }',
    exit_code: 'Always 1 on error.',
    codes: [
      {
        code: 'VALIDATION',
        category: 'user_error',
        retryable: false,
        meaning: 'Bad input (namespace/key shape, missing value, etc).',
      },
      {
        code: 'NOT_FOUND',
        category: 'user_error',
        retryable: false,
        meaning: 'Namespace or key does not exist in 1Password.',
      },
      {
        code: 'VAULT_NOT_FOUND',
        category: 'user_error',
        retryable: false,
        meaning: 'ONENV_VAULT does not exist or is not accessible.',
      },
      {
        code: 'NO_PROJECT_CONFIG',
        category: 'user_error',
        retryable: false,
        meaning: 'Missing or unreadable .onenv.json. Run "onenv init".',
      },
      {
        code: 'OP_AUTH',
        category: 'transient',
        retryable: true,
        meaning: '1Password CLI not signed in or session expired. Sign in and retry.',
      },
      {
        code: 'OP_ERROR',
        category: 'upstream',
        retryable: false,
        meaning: 'Other op CLI failure.',
      },
      {
        code: 'OP_SPAWN',
        category: 'internal',
        retryable: false,
        meaning: 'Could not spawn the "op" binary. Check PATH.',
      },
      {
        code: 'INTERNAL',
        category: 'internal',
        retryable: false,
        meaning: 'Unexpected internal error.',
      },
    ],
  }
}
