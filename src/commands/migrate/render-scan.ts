import chalk from 'chalk'
import type { KeyEntry, KeyRole, ScanResult } from './types.js'

const ROLE_COLOR: Record<KeyRole, (s: string) => string> = {
  secret: chalk.red,
  public: chalk.cyan,
  config: chalk.gray,
}

export function renderScanText(result: ScanResult): string {
  const blocks = [
    renderHeader(result),
    renderEnvFiles(result),
    renderKeys(result),
    renderConflicts(result),
    renderWarnings(result),
    renderNextStep(result),
  ]
  return blocks.filter((b) => b.length > 0).join('\n\n')
}

function renderHeader(r: ScanResult): string {
  const proj = r.project_marker
    ? `${r.project_marker.kind} (${r.project_marker.file})`
    : '(no project marker)'
  const fw =
    r.framework.kind === 'generic'
      ? 'generic'
      : `${r.framework.kind} (public prefix: ${r.framework.public_prefix})`
  return `${chalk.bold('onenv migrate scan')} — ${r.cwd}\nproject: ${proj} · framework: ${fw}`
}

function renderEnvFiles(r: ScanResult): string {
  if (r.env_files.length === 0) return `${chalk.gray('No .env* files found.')}`
  const lines = r.env_files.map((f) => {
    const tracked = f.tracked ? chalk.red(' [tracked]') : ''
    return `  - ${f.relative} (${f.entries.length} keys)${tracked}`
  })
  return [`Env files (${r.env_files.length}):`, ...lines].join('\n')
}

function renderKeys(r: ScanResult): string {
  if (r.keys.length === 0) return ''
  const grouped = groupByNamespace(r.keys)
  const sections = [...grouped.entries()]
    .sort(byNamespace)
    .map(([ns, keys]) => renderNamespace(ns, keys))
  const sb = r.summary.by_role
  const tally = `total ${r.summary.total_keys} keys · ${sb.secret} secret · ${sb.public} public · ${sb.config} config`
  return [`Keys by suggested namespace:\n`, sections.join('\n\n'), `\n${chalk.gray(tally)}`].join(
    '',
  )
}

function renderNamespace(ns: string, keys: KeyEntry[]): string {
  const header = `  ${chalk.bold(ns)} (${keys.length})`
  const rows = keys.map((k) => {
    const color = ROLE_COLOR[k.role]
    const tag = color(`[${k.role}]`)
    const conflict = k.conflict ? chalk.red(' ⚠ conflict') : ''
    return `    ${tag} ${k.key}${conflict}`
  })
  return [header, ...rows].join('\n')
}

function renderConflicts(r: ScanResult): string {
  if (r.summary.conflicts === 0) return ''
  return chalk.red(
    `Conflicts: ${r.summary.conflicts} key(s) have different values across env files. Resolve before applying.`,
  )
}

function renderWarnings(r: ScanResult): string {
  if (r.warnings.length === 0) return ''
  return [chalk.yellow('Warnings:'), ...r.warnings.map((w) => `  ! ${w}`)].join('\n')
}

function renderNextStep(r: ScanResult): string {
  if (r.env_files.length === 0) return chalk.gray('Nothing to migrate.')
  return chalk.gray(
    [
      'Next:',
      '  1. onenv migrate plan --out .onenv-migrate-plan.json   # write a reviewable plan (no changes)',
      '  2. edit the plan if needed (set "action":"skip" on keys you don\'t want migrated)',
      '  3. onenv migrate apply --plan .onenv-migrate-plan.json --dry-run',
      '  4. onenv migrate apply --plan .onenv-migrate-plan.json',
    ].join('\n'),
  )
}

function groupByNamespace(keys: KeyEntry[]): Map<string, KeyEntry[]> {
  const out = new Map<string, KeyEntry[]>()
  for (const k of keys) {
    const list = out.get(k.suggested_namespace) ?? []
    list.push(k)
    out.set(k.suggested_namespace, list)
  }
  return out
}

function byNamespace(a: [string, unknown], b: [string, unknown]): number {
  return a[0].localeCompare(b[0])
}
