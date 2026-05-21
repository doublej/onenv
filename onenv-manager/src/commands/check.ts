// Note: only reports on keys onenv knows about. We deliberately do not flag
// shell-only keys — process.env is full of system noise (PATH, HOME, TERM…)
// and without a curated allow-list every entry would be useless noise.
import chalk from 'chalk'
import type { Command } from 'commander'
import { exportEnabledValuesStrict } from '../index.js'
import { fingerprint } from '../lib/fingerprint.js'
import { isJsonMode, output } from '../lib/output.js'
import { readProjectConfig } from '../lib/project-config.js'

export type CheckStatus = 'match' | 'differ' | 'missing'

export interface CheckRow {
  key: string
  status: CheckStatus
}

function classify(onenvValue: string, shellValue: string | undefined): CheckStatus {
  if (shellValue === undefined) return 'missing'
  return fingerprint(shellValue) === fingerprint(onenvValue) ? 'match' : 'differ'
}

export async function runCheck(): Promise<CheckRow[]> {
  const config = await readProjectConfig()
  const values = await exportEnabledValuesStrict(config.namespaces)
  const rows: CheckRow[] = Object.entries(values).map(([key, onenvValue]) => ({
    key,
    status: classify(onenvValue, process.env[key]),
  }))
  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

function emit(rows: CheckRow[]): void {
  if (isJsonMode()) {
    output(rows)
    return
  }
  for (const row of rows) {
    console.log(formatRow(row))
  }
}

function formatRow(row: CheckRow): string {
  if (row.status === 'match') return `${chalk.green('✓ match  ')} ${row.key}`
  if (row.status === 'differ') return `${chalk.red('✗ differ ')} ${row.key}`
  return `${chalk.yellow('? missing')} ${row.key}`
}

export async function checkAction(): Promise<void> {
  const rows = await runCheck()
  emit(rows)
  const failed = rows.some((r) => r.status !== 'match')
  process.exit(failed ? 1 : 0)
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Compare process.env against onenv for the project namespaces (no values printed)')
    .action(checkAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv check
      Show match/differ/missing per key from .onenv.json
  $ onenv check && echo "shell is in sync" || echo "drift detected"
      Use the exit code in scripts (0 = all match, 1 = drift)`,
    )
}
