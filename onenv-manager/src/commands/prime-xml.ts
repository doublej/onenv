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

export function renderXml(data: PrimerData): string {
  const sections = [
    section('summary', data.summary),
    section('setup', renderSetup(data.setup)),
    section('naming', renderNaming(data.naming)),
    section('refs', renderRefs(data.refs)),
    section('workflow', renderWorkflow(data.workflow)),
    section('commands', renderCommands(data.commands)),
    section('state', renderState(data.state)),
    section('errors', renderErrors(data.errors)),
    section('output', renderOutputContract(data.output_contract)),
    section('api', renderApi(data.api)),
  ]
  return `<onenv version="${escapeAttr(data.version)}">\n\n${sections.join('\n\n')}\n\n</onenv>`
}

function section(name: string, body: string): string {
  return `<${name}>\n${body.trim()}\n</${name}>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function renderSetup(s: SetupSection): string {
  return [
    s.description,
    '',
    `Token: ${s.service_account_token}`,
    '',
    `Vault: ${s.vault}`,
    `Category: ${s.category}`,
    `Item layout: ${s.item_layout}`,
  ].join('\n')
}

function renderNaming(n: NamingSection): string {
  return [
    `Namespace: ${n.namespace_regex} (max ${n.namespace_max_length} chars)`,
    `Key: ${n.key_regex} (max ${n.key_max_length} chars)`,
    '',
    n.injection_warning,
  ].join('\n')
}

function renderRefs(r: RefsSection): string {
  return [r.description, '', ...r.syntax, '', `State file: ${r.state_file}`].join('\n')
}

function renderWorkflow(w: WorkflowSection): string {
  return [
    'Project setup:',
    ...w.project_setup.map((s) => `  ${s}`),
    '',
    'Ad-hoc:',
    ...w.ad_hoc.map((s) => `  ${s}`),
  ].join('\n')
}

function renderCommands(commands: CommandSpec[]): string {
  return commands.map((c) => `${c.name}\n  ${c.description}\n  Output: ${c.output}`).join('\n\n')
}

function renderState(entries: StateEntry[]): string {
  return entries.map((e) => `${e.path}\n  ${e.description}`).join('\n\n')
}

function renderErrors(errors: ErrorsSection): string {
  const codes = errors.codes
    .map(
      (c) =>
        `${c.code} (${c.category}, ${c.retryable ? 'retryable' : 'not retryable'}) — ${c.meaning}`,
    )
    .join('\n')
  return [`Envelope: ${errors.envelope}`, `Exit code: ${errors.exit_code}`, '', codes].join('\n')
}

function renderOutputContract(c: OutputContract): string {
  return [
    c.description,
    '',
    c.raw_data,
    c.envelope,
    c.child_process,
    '',
    `JSON mode trigger: ${c.json_mode_trigger}`,
  ].join('\n')
}

function renderApi(api: ApiSection): string {
  return [
    api.description,
    '',
    `Default URL: ${api.default_url}`,
    `Auth: ${api.auth}`,
    `Audit: ${api.audit_header}`,
    `Rate limit: ${api.rate_limit}`,
    '',
    'Config env:',
    renderApiEnv(api),
    '',
    'Endpoints:',
    renderApiEndpoints(api),
    '',
    'Errors:',
    renderApiErrors(api),
  ].join('\n')
}

function renderApiEnv(api: ApiSection): string {
  return api.config_env
    .map((e) => {
      const flags = [e.required ? 'required' : 'optional']
      if (e.default !== undefined) flags.push(`default ${e.default}`)
      return `  ${e.name} (${flags.join(', ')}) — ${e.description}`
    })
    .join('\n')
}

function renderApiEndpoints(api: ApiSection): string {
  return api.endpoints
    .map((e) => {
      const parts = [`${e.method.padEnd(4)} ${e.path}`, `[${e.permission}]`]
      if (e.body) parts.push(`body: ${e.body}`)
      parts.push(`→ ${e.response}`)
      const line = `  ${parts.join('  ')}`
      return e.notes ? `${line}\n    notes: ${e.notes}` : line
    })
    .join('\n')
}

function renderApiErrors(api: ApiSection): string {
  return api.error_responses.map((e) => `  ${e.status} ${e.body} — ${e.when}`).join('\n')
}
