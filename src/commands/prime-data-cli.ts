import type { CommandSpec, ErrorsSection, StateEntry } from './prime-data.js'

export function buildCommands(): CommandSpec[] {
  return [
    {
      name: 'set <ns> <key> [--value-stdin]',
      description:
        'Create or update a secret. Default: interactive password prompt. `--value-stdin` reads the raw value from stdin (`echo -n "secret" | onenv set ns KEY --value-stdin`). In a non-TTY context, `--value-stdin` is required.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,key}.',
    },
    {
      name: 'edit <ns> <key> [--value-stdin]',
      description:
        'Update an existing secret. Default: interactive password prompt. `--value-stdin` reads from stdin (scripting-friendly). Same non-TTY guard as `set`.',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,key}.',
    },
    {
      name: 'get <ns> <key> [--fingerprint] [--meta]',
      description:
        'Read a single secret value. Default: prints the raw value (TTY) or {ok:true,value} (JSON). --fingerprint prints "sha256:<hex>" of the value instead — use this to compare against a shell value without exposing the secret. --meta includes group/path/type metadata in the JSON output.',
      output:
        'TTY: raw value (or fingerprint). JSON: {ok:true,namespace,key,value?,fingerprint?,group?,path?,type?}.',
    },
    {
      name: 'unset <ns> <key...> [-y, --yes]',
      description:
        'Delete one or more secrets from 1Password. Multiple keys allowed. Confirms in a TTY; in a non-TTY context (scripts, CI), `--yes` is required (otherwise exits VALIDATION).',
      output: 'TTY: green confirmation. JSON: {ok:true,message,namespace,keys}.',
    },
    {
      name: 'check',
      description:
        "Compare process.env against the project's onenv namespaces (reads .onenv.json) and report per-key whether the shell value matches, differs, or is missing. Never prints values — comparison is done via sha256 fingerprints internally. Use before `onenv run` to spot drift between an already-loaded shell env and what onenv would inject.",
      output:
        'JSON: {ok:true, keys:[{namespace,key,status:"match"|"differ"|"missing-in-shell"|"missing-in-onenv"}]}. TTY: grouped human summary.',
    },
    {
      name: 'doctor',
      description:
        'Run health checks on the onenv environment and the current project: 1Password CLI availability and auth, vault reachability, project marker detection, .onenv.json presence and namespace existence. Exits 1 if any check has status `error`.',
      output:
        'TTY: human-readable grouped report. JSON: {cwd, project_marker, checks:[{name,status,detail,hint?}], summary:{ok,warn,error,skip}}.',
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
      name: 'run [--file <[ns/]group:VAR>...] [--file-rw <[ns/]group:VAR>...] -- <cmd...>',
      description:
        'Read .onenv.json, fetch enabled secrets across all configured namespaces, exec <cmd> with secrets injected as env vars. Inherits stdio. --file (repeatable) materializes the JSON for a group into a 0600 tempfile under XDG_RUNTIME_DIR (fallback: os tmpdir), exposes its absolute path as the named env var, and removes the tempfile on child exit / SIGINT / SIGTERM. Spec accepts bare `group:VAR` (resolves uniquely across project namespaces) or explicit `namespace/group:VAR` (required when the same group name lives in multiple namespaces, e.g. per-account OAuth tokens). --file-rw behaves identically but also sha256-hashes the materialized file before exec and re-imports it into the same namespace+group on clean child close if the hash changed; writeback is skipped on signal exit, on read failure, or if the hash matches.',
      output: 'Mirrors the child exit code. No onenv output written.',
    },
    {
      name: 'import <ns> [file] -g, --group <name> [--overwrite] [--from-stdin] [--keys upper-snake|leaf] [--prefix <s>] [--dry-run]',
      description:
        'Flatten a JSON file into onenv keys with reassembly metadata (group, path, type stored as STRING fields on each item). `--group` is REQUIRED. `--from-stdin` reads JSON from stdin instead of a file path (no filesystem footprint — file arg must be omitted). `--overwrite` replaces existing keys atomically: either every write lands, or every touched key is restored to its pre-import state on any failure. Without `--overwrite`, aborts on key collisions or when an existing key has no group / a different group. `--keys upper-snake` (default) joins the JSON path with underscores ("installed.client_id" → INSTALLED_CLIENT_ID, "scopes[0]" → SCOPES_0). `--keys leaf` uses only the last key segment, raising on collisions. `--prefix` prepends a value to every derived key. `--dry-run` prints the plan without writing.',
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
      name: 'export <ns[,ns2,...]> --reveal [--format json|shell]',
      description:
        "Fetch enabled secrets across the listed namespaces and print them. Requires --reveal — without it, hard-errors VALIDATION instead of leaking secrets to stdout. --format shell emits `export KEY='value'` lines for `eval` into a shell (default json). Hard-errors VALIDATION on cross-namespace key collisions; resolve by disabling the duplicate or splitting the namespaces.",
      output:
        'json: {KEY:"value",...}. shell: export KEY=\'value\' lines. Bare keys, see naming.injection_warning.',
    },
    {
      name: 'export <ns[,ns2,...]> -- <cmd...>',
      description:
        'Exec <cmd> with the secrets injected into its environment instead of printing — no --reveal needed since nothing is written to stdout. Same cross-namespace collision check applies.',
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
      name: 'learn <text...>',
      description:
        'Record a reusable onenv learning for future agents (shared memory). Capture one concrete, reusable sentence — quoted or bare words both work. Idempotent: the same text returns the existing entry (content-hash id), never a duplicate.',
      output:
        'Always JSON: {ok:true, id:"L<6-hex>", created:boolean, score, text}. Empty text → {err:"EMPTY", hint}.',
    },
    {
      name: 'vote <id> up|down',
      description:
        'Vote on a learning you actually used (see `onenv learnings` for ids). No vote identity — votes are anonymous and uncapped.',
      output:
        'Always JSON: {ok:true, id, score, up, down}. {err:"BAD_DIR"} for a bad direction, {err:"NOT_FOUND"} for an unknown id.',
    },
    {
      name: 'learnings [--limit <n>] [--fmt table|jsonl]',
      description:
        'List the top onenv learnings by vote score (score=up−down, ties broken by upvotes then recency). The top 10 are also embedded in this primer (see <learnings>).',
      output: 'TTY: human table. --fmt jsonl: one JSON object per line {id,score,up,down,text}.',
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
