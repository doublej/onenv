import type {
  CommandSpec,
  DetectedSection,
  ErrorsSection,
  LearningsSection,
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

export function renderMarkdown(data: PrimerData): string {
  const sections = [
    `# onenv ${data.version}`,
    `## Role\n\n${data.summary}`,
    renderSafety(data.safety),
  ]
  if (data.detected) sections.push(renderDetected(data.detected))
  sections.push(
    renderRules(data),
    renderCommands(data.commands),
    renderWorkflow(data.workflow),
    renderErrors(data.errors),
    renderOutputContract(data.output_contract),
    renderPermission(data.permission),
    renderLearnings(data.learnings),
  )
  return `${sections.join('\n\n')}\n`
}

function renderSafety(safety: SafetySection): string {
  const rules = safety.rules.map((r) => `- ${r}`).join('\n')
  return ['## Safety', safety.description, rules].join('\n\n')
}

function renderDetected(d: DetectedSection): string {
  const head = [
    `- cwd: \`${d.cwd}\``,
    `- project: ${d.project_marker.kind} (\`${d.project_marker.file}\`)`,
    `- framework: ${d.framework.kind}${d.framework.public_prefix ? ` (public prefix: \`${d.framework.public_prefix}\`)` : ''}`,
    `- \`.onenv.json\`: ${d.onenv_json}${d.namespaces_referenced.length ? ` — namespaces: ${d.namespaces_referenced.map((n) => `\`${n}\``).join(', ')}` : ''}`,
  ]
  const files =
    d.env_files.length > 0
      ? [
          '- env files:',
          ...d.env_files.map(
            (f) =>
              `  - \`${f.relative}\` (${f.key_count} keys${f.tracked ? ', tracked in git' : ''})`,
          ),
        ]
      : ['- env files: none']
  return [
    '## Detected (cwd snapshot)',
    ...head,
    ...files,
    `- next: ${d.next_action}`,
    `- caveat: ${d.caveat}`,
  ].join('\n')
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
  const buckets = [
    { label: 'Core', prefixes: CORE_PREFIXES },
    { label: 'Run / Export', prefixes: RUN_PREFIXES },
    { label: 'Grouped files', prefixes: FILE_PREFIXES },
    { label: 'Diagnostics', prefixes: DIAGNOSTICS_PREFIXES },
    { label: 'Learnings (shared memory)', prefixes: LEARNINGS_PREFIXES },
  ]
  const assigned = new Set<CommandSpec>()
  const groups = buckets.map(({ label, prefixes }) => {
    const entries = commands.filter((c) => matchCategory(c.name, prefixes))
    for (const e of entries) assigned.add(e)
    return { label, entries }
  })
  groups.push({ label: 'Other', entries: commands.filter((c) => !assigned.has(c)) })
  return groups
}

const CORE_PREFIXES = ['set ', 'edit ', 'get ', 'unset ', 'list', 'disable ', 'enable ', 'init']
const RUN_PREFIXES = ['run ', 'export ']
const FILE_PREFIXES = ['import ', 'build-file ']
const DIAGNOSTICS_PREFIXES = ['check', 'doctor', 'prime']
const LEARNINGS_PREFIXES = ['learn ', 'vote ', 'learnings ']

function matchCategory(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name === p.trim() || name.startsWith(p))
}

function formatCommand(c: CommandSpec): string {
  const cmd = c.name === 'onenv' || c.name.startsWith('onenv ') ? c.name : `onenv ${c.name}`
  return `- \`${cmd}\` — ${c.description}\n  - Output: ${c.output}`
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

function renderPermission(perm: PermissionSection): string {
  return [
    '## Confirm-on-write (opt-in)',
    perm.description,
    `- Trigger: \`${perm.trigger_env}\``,
    `- Timeout: \`${perm.timeout_env}\``,
    `- Gated commands: ${perm.gated_commands.map((c) => `\`${c}\``).join(', ')}`,
    `- On deny / timeout: ${perm.error_code}`,
  ].join('\n')
}

function renderLearnings(l: LearningsSection): string {
  const lines = ['## Learnings (shared memory)', ...l.protocol.map((p) => `- ${p}`), '']
  if (l.top.length === 0) {
    lines.push('No learnings yet. Record one with `onenv learn "..."`.')
  } else {
    lines.push(`### Top ${l.top.length} (apply, then vote)`)
    for (const e of l.top) {
      const sign = e.score > 0 ? `+${e.score}` : `${e.score}`
      lines.push(`- \`[${e.id}]\` ${sign} — ${e.text}`)
    }
  }
  return lines.join('\n')
}
