import type {
  CommandSpec,
  DetectedSection,
  ErrorsSection,
  NamingSection,
  OutputContract,
  PermissionSection,
  PrimerData,
  RefsSection,
  SafetySection,
  SetupSection,
  StateEntry,
  WorkflowSection,
} from './prime-data.js'

export function renderXml(data: PrimerData): string {
  const sections = [
    tag('role', data.summary),
    tag('safety', renderSafety(data.safety), { priority: 'critical' }),
  ]
  if (data.detected)
    sections.push(tag('detected', renderDetected(data.detected), { priority: 'critical' }))
  sections.push(
    tag('rules', renderRules(data), { priority: 'critical' }),
    tag('commands', renderCommands(data.commands)),
    tag('workflow', renderWorkflow(data.workflow), { strict: 'true' }),
    tag('errors', renderErrors(data.errors)),
    tag('output', renderOutputContract(data.output_contract)),
    tag('permission', renderPermission(data.permission)),
  )
  return `<onenv-agent-guide version="${escapeAttr(data.version)}">\n\n${sections.join('\n\n')}\n\n</onenv-agent-guide>`
}

function renderSafety(safety: SafetySection): string {
  const rules = safety.rules.map((r) => `- ${r}`).join('\n')
  return [safety.description, '', rules].join('\n')
}

function renderDetected(d: DetectedSection): string {
  const lines = [
    `cwd: ${d.cwd}`,
    `project: ${d.project_marker.kind} (${d.project_marker.file})`,
    `framework: ${d.framework.kind}${d.framework.public_prefix ? ` (public prefix: ${d.framework.public_prefix})` : ''}`,
    `.onenv.json: ${d.onenv_json}${d.namespaces_referenced.length ? ` (namespaces: ${d.namespaces_referenced.join(', ')})` : ''}`,
  ]
  if (d.env_files.length > 0) {
    lines.push('env files:')
    for (const f of d.env_files) {
      lines.push(`  - ${f.relative} (${f.key_count} keys${f.tracked ? ', tracked in git' : ''})`)
    }
  } else {
    lines.push('env files: none')
  }
  lines.push('', `next: ${d.next_action}`, '', `caveat: ${d.caveat}`)
  return lines.join('\n')
}

function tag(name: string, body: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('')
  return `<${name}${attrStr}>\n${body.trim()}\n</${name}>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function renderRules(data: PrimerData): string {
  return [
    renderToken(data.setup),
    renderStorage(data.setup),
    renderNaming(data.naming),
    renderRefs(data.refs),
    renderStateFiles(data.state),
  ].join('\n\n')
}

function renderToken(s: SetupSection): string {
  return `TOKEN:\n${s.service_account_token}`
}

function renderStorage(s: SetupSection): string {
  return [
    'STORAGE:',
    `- Vault: ${s.vault}`,
    `- Category: ${s.category}`,
    `- Item layout: ${s.item_layout}`,
  ].join('\n')
}

function renderNaming(n: NamingSection): string {
  return [
    'NAMING:',
    `- Namespace: ${n.namespace_regex} (max ${n.namespace_max_length} chars)`,
    `- Key: ${n.key_regex} (max ${n.key_max_length} chars)`,
    `- ${n.injection_warning}`,
  ].join('\n')
}

function renderRefs(r: RefsSection): string {
  const lines = ['REFS:', `- ${r.description}`, ...r.syntax.map((s) => `- ${s}`)]
  lines.push(`- State file: ${r.state_file}`)
  return lines.join('\n')
}

function renderStateFiles(entries: StateEntry[]): string {
  const lines = entries.map((e) => `- ${e.path} — ${e.description}`)
  return ['STATE FILES:', ...lines].join('\n')
}

function renderCommands(commands: CommandSpec[]): string {
  const groups = groupCommands(commands)
  return groups
    .filter((g) => g.entries.length > 0)
    .map((g) => `${g.label}:\n${g.entries.map(formatCommand).join('\n\n')}`)
    .join('\n\n')
}

function groupCommands(commands: CommandSpec[]): { label: string; entries: CommandSpec[] }[] {
  const buckets = [
    { label: 'CORE', prefixes: CORE_PREFIXES },
    { label: 'RUN / EXPORT', prefixes: RUN_PREFIXES },
    { label: 'GROUPED FILES', prefixes: FILE_PREFIXES },
    { label: 'DIAGNOSTICS', prefixes: DIAGNOSTICS_PREFIXES },
  ]
  const assigned = new Set<CommandSpec>()
  const groups = buckets.map(({ label, prefixes }) => {
    const entries = commands.filter((c) => matchCategory(c.name, prefixes))
    for (const e of entries) assigned.add(e)
    return { label, entries }
  })
  groups.push({ label: 'OTHER', entries: commands.filter((c) => !assigned.has(c)) })
  return groups
}

const CORE_PREFIXES = ['set ', 'edit ', 'get ', 'unset ', 'list', 'disable ', 'enable ', 'init']
const RUN_PREFIXES = ['run ', 'export ']
const FILE_PREFIXES = ['import ', 'build-file ']
const DIAGNOSTICS_PREFIXES = ['check', 'doctor', 'prime']

function matchCategory(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name === p.trim() || name.startsWith(p))
}

function formatCommand(c: CommandSpec): string {
  const head = c.name === 'onenv' || c.name.startsWith('onenv ') ? c.name : `onenv ${c.name}`
  return `  ${head}\n    ${c.description}\n    Output: ${c.output}`
}

function renderWorkflow(w: WorkflowSection): string {
  const project = w.project_setup.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const adhoc = w.ad_hoc.map((s) => `- ${s}`).join('\n')
  return ['PROJECT SETUP:', project, '', 'AD-HOC:', adhoc].join('\n')
}

function renderErrors(errors: ErrorsSection): string {
  const codes = errors.codes
    .map(
      (c) =>
        `- ${c.code} (${c.category}, ${c.retryable ? 'retryable' : 'not retryable'}) — ${c.meaning}`,
    )
    .join('\n')
  return [`Envelope: ${errors.envelope}. Exit code: ${errors.exit_code}`, '', 'CODES:', codes].join(
    '\n',
  )
}

function renderOutputContract(c: OutputContract): string {
  return [
    `- ${c.description}`,
    `- Raw data: ${c.raw_data}`,
    `- Envelope: ${c.envelope}`,
    `- Child process: ${c.child_process}`,
    `- JSON mode trigger: ${c.json_mode_trigger}`,
  ].join('\n')
}

function renderPermission(perm: PermissionSection): string {
  return [
    perm.description,
    '',
    `Trigger: ${perm.trigger_env}`,
    `Timeout: ${perm.timeout_env}`,
    `Gated commands: ${perm.gated_commands.join(', ')}`,
    `On deny / timeout: ${perm.error_code}`,
  ].join('\n')
}
