import chalk from 'chalk'
import type { CheckStatus, DoctorReport } from './doctor-types.js'

const ICONS: Record<CheckStatus, string> = { ok: '✓', warn: '⚠', error: '✗', skip: '·' }
const COLORS: Record<CheckStatus, (s: string) => string> = {
  ok: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  skip: chalk.gray,
}

export function renderDoctorText(report: DoctorReport): string {
  const header = `onenv doctor — ${report.cwd}`
  const marker = report.project_marker
    ? `project: ${report.project_marker.kind} (${report.project_marker.file})`
    : 'project: (none detected)'
  const rows = report.checks.map(renderRow)
  const s = report.summary
  const summary = `${s.ok} ok · ${s.warn} warn · ${s.error} error · ${s.skip} skipped`
  return [header, marker, '', ...rows, '', summary].join('\n')
}

function renderRow(check: {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}): string {
  const icon = COLORS[check.status](ICONS[check.status])
  const head = `${icon} ${check.name} — ${check.detail}`
  return check.hint ? `${head}\n    ${chalk.gray(`hint: ${check.hint}`)}` : head
}
