import type {
  ApiSection,
  CommandSpec,
  ErrorsSection,
  NamingSection,
  OutputContract,
  PrimerData,
  RefsSection,
  SetupSection,
  StateEntry,
  WorkflowSection,
} from './prime-data.js'

export function renderMarkdown(data: PrimerData): string {
  const sections = [
    `# onenv ${data.version}`,
    `## Role\n\n${data.summary}`,
    renderRules(data),
    renderCommands(data.commands),
    renderWorkflow(data.workflow),
    renderErrors(data.errors),
    renderOutputContract(data.output_contract),
    renderApi(data.api),
  ]
  return `${sections.join('\n\n')}\n`
}

function renderRules(data: PrimerData): string {
  return [
    '## Rules',
    renderToken(data.setup),
    renderStorage(data.setup),
    renderNaming(data.naming),
    renderRefs(data.refs),
    renderStateFiles(data.state),
  ].join('\n\n')
}

function renderToken(s: SetupSection): string {
  return `### Token\n\n${s.service_account_token}`
}

function renderStorage(s: SetupSection): string {
  return [
    '### Storage',
    `- Vault: ${s.vault}`,
    `- Category: ${s.category}`,
    `- Item layout: ${s.item_layout}`,
  ].join('\n')
}

function renderNaming(n: NamingSection): string {
  return [
    '### Naming',
    `- Namespace: \`${n.namespace_regex}\` (max ${n.namespace_max_length} chars)`,
    `- Key: \`${n.key_regex}\` (max ${n.key_max_length} chars)`,
    `- ${n.injection_warning}`,
  ].join('\n')
}

function renderRefs(r: RefsSection): string {
  const lines = ['### Refs', `- ${r.description}`, ...r.syntax.map((s) => `- ${s}`)]
  lines.push(`- State file: ${r.state_file}`)
  return lines.join('\n')
}

function renderStateFiles(entries: StateEntry[]): string {
  const lines = entries.map((e) => `- \`${e.path}\` — ${e.description}`)
  return ['### State files', ...lines].join('\n')
}

function renderCommands(commands: CommandSpec[]): string {
  const groups = groupCommands(commands)
  const bodies = groups
    .filter((g) => g.entries.length > 0)
    .map((g) => `### ${g.label}\n\n${g.entries.map(formatCommand).join('\n\n')}`)
    .join('\n\n')
  return `## Commands\n\n${bodies}`
}

function groupCommands(commands: CommandSpec[]): { label: string; entries: CommandSpec[] }[] {
  return [
    { label: 'Core', entries: commands.filter((c) => matchCategory(c.name, CORE_PREFIXES)) },
    { label: 'Run / Export', entries: commands.filter((c) => matchCategory(c.name, RUN_PREFIXES)) },
    {
      label: 'Grouped files',
      entries: commands.filter((c) => matchCategory(c.name, FILE_PREFIXES)),
    },
    { label: 'Other', entries: commands.filter((c) => isOther(c.name)) },
  ]
}

const CORE_PREFIXES = ['set ', 'edit ', 'unset ', 'list', 'disable ', 'enable ', 'init']
const RUN_PREFIXES = ['run ', 'export ']
const FILE_PREFIXES = ['import ', 'build-file ']
const OTHER_PREFIXES = ['tui', 'prime', 'onenv']

function matchCategory(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name === p.trim() || name.startsWith(p))
}

function isOther(name: string): boolean {
  return matchCategory(name, OTHER_PREFIXES)
}

function formatCommand(c: CommandSpec): string {
  return `- \`onenv ${c.name}\` — ${c.description}\n  - Output: ${c.output}`
}

function renderWorkflow(w: WorkflowSection): string {
  const project = w.project_setup.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const adhoc = w.ad_hoc.map((s) => `- ${s}`).join('\n')
  return ['## Workflow', '### Project setup', project, '### Ad-hoc', adhoc].join('\n\n')
}

function renderErrors(errors: ErrorsSection): string {
  const codes = errors.codes
    .map(
      (c) =>
        `- \`${c.code}\` (${c.category}, ${c.retryable ? 'retryable' : 'not retryable'}) — ${c.meaning}`,
    )
    .join('\n')
  return [
    '## Errors',
    `Envelope: \`${errors.envelope}\`. Exit code: ${errors.exit_code}`,
    '### Codes',
    codes,
  ].join('\n\n')
}

function renderOutputContract(c: OutputContract): string {
  return [
    '## Output',
    `- ${c.description}`,
    `- Raw data: ${c.raw_data}`,
    `- Envelope: ${c.envelope}`,
    `- Child process: ${c.child_process}`,
    `- JSON mode trigger: ${c.json_mode_trigger}`,
  ].join('\n')
}

function renderApi(api: ApiSection): string {
  return [
    '## API',
    api.description,
    `URL: ${api.default_url} (default)`,
    `Auth: ${api.auth}`,
    `Audit: ${api.audit_header}`,
    `Rate limit: ${api.rate_limit}`,
    '### Config env',
    renderApiEnv(api),
    '### Endpoints',
    renderApiEndpoints(api),
    '### Errors',
    renderApiErrors(api),
  ].join('\n\n')
}

function renderApiEnv(api: ApiSection): string {
  return api.config_env
    .map((e) => {
      const flags = [e.required ? 'required' : 'optional']
      if (e.default !== undefined) flags.push(`default ${e.default}`)
      return `- \`${e.name}\` (${flags.join(', ')}) — ${e.description}`
    })
    .join('\n')
}

function renderApiEndpoints(api: ApiSection): string {
  return api.endpoints
    .map((e) => {
      const parts = [`\`${e.method} ${e.path}\``, `[${e.permission}]`]
      if (e.body) parts.push(`body: ${e.body}`)
      parts.push(`→ ${e.response}`)
      const line = `- ${parts.join('  ')}`
      return e.notes ? `${line}\n  - notes: ${e.notes}` : line
    })
    .join('\n')
}

function renderApiErrors(api: ApiSection): string {
  return api.error_responses.map((e) => `- ${e.status} \`${e.body}\` — ${e.when}`).join('\n')
}
