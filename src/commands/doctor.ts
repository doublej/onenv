import type { Command } from 'commander'
import { isJsonMode, output } from '../lib/output.js'
import { detectProjectMarker } from '../lib/project-marker.js'
import { runEnvChecks } from './doctor-env-checks.js'
import { runProjectChecks } from './doctor-project-checks.js'
import { renderDoctorText } from './doctor-render.js'
import type { Check, DoctorReport } from './doctor-types.js'

export async function runDoctor(cwd: string = process.cwd()): Promise<DoctorReport> {
  const marker = detectProjectMarker(cwd)
  const checks = [...(await runEnvChecks()), ...(await runProjectChecks(cwd, marker))]
  return { cwd, project_marker: marker, checks, summary: summarize(checks) }
}

function summarize(checks: Check[]): DoctorReport['summary'] {
  const init = { ok: 0, warn: 0, error: 0, skip: 0 }
  for (const c of checks) init[c.status]++
  return init
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run health checks on the onenv environment and current project')
    .action(async () => {
      const report = await runDoctor()
      if (isJsonMode()) {
        output(report)
      } else {
        process.stdout.write(`${renderDoctorText(report)}\n`)
      }
      if (report.summary.error > 0) process.exit(1)
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv doctor
      Run all checks against the current directory
  $ onenv doctor --json
      Emit a machine-readable report (CI-friendly)`,
    )
}
