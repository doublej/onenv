import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import type { Command } from 'commander'
import { CliError } from '../../lib/errors.js'
import { isJsonMode, output, success } from '../../lib/output.js'
import { applyPlan } from './apply.js'
import { buildPlan } from './plan.js'
import type { MigratePlan } from './plan-types.js'
import { renderScanText } from './render-scan.js'
import { scan } from './scan.js'

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command('migrate').description('Migrate an existing codebase to onenv')

  migrate
    .command('scan')
    .description('Inspect .env* files and propose namespace + role mappings (read-only)')
    .option('-p, --path <dir>', 'Project root to scan (default: cwd)')
    .action(async (options: { path?: string }) => {
      const cwd = options.path ?? process.cwd()
      const result = await scan(cwd)
      if (isJsonMode()) {
        output(result)
        return
      }
      process.stdout.write(`${renderScanText(result)}\n`)
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv migrate scan
      Inspect .env files in the current directory
  $ onenv migrate scan --path ../other-project
      Inspect a different project root
  $ onenv migrate scan --json
      Emit a machine-readable scan report`,
    )

  migrate
    .command('plan')
    .description('Generate a migration plan (review before "migrate apply"). No writes.')
    .option('-p, --path <dir>', 'Project root to plan against (default: cwd)')
    .option('-o, --out <file>', 'Write plan JSON to file (default: stdout)')
    .action(async (options: { path?: string; out?: string }) => {
      const cwd = options.path ?? process.cwd()
      const plan = await buildPlan(cwd)
      if (options.out) {
        const path = resolve(cwd, options.out)
        writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`)
        success(`Wrote plan to ${path}`, { path, blockers: plan.blockers })
        return
      }
      output(plan)
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv migrate plan
      Print the plan as JSON to stdout
  $ onenv migrate plan --out .onenv-migrate-plan.json
      Save the plan to a file for review / editing before apply
  $ onenv migrate plan --path ../other-project --out plan.json
      Plan a different project`,
    )

  registerApply(migrate)
}

function registerApply(migrate: Command): void {
  migrate
    .command('apply')
    .description('Execute a migration plan: write secrets to 1Password, archive env files')
    .requiredOption('--plan <file>', 'Path to the plan JSON (produced by "migrate plan --out")')
    .option('--dry-run', 'Validate the plan and report intent without making changes')
    .option('-y, --yes', 'Skip the confirmation prompt (use with care)')
    .action(async (options: { plan: string; dryRun?: boolean; yes?: boolean }) => {
      const planPath = resolve(process.cwd(), options.plan)
      const plan = readPlanOrThrow(planPath)
      await confirmApply(plan, options)
      const result = await applyPlan(plan, { dryRun: Boolean(options.dryRun) })
      if (isJsonMode()) {
        output(result)
        return
      }
      success(
        result.dry_run
          ? `Dry run: would set ${result.set.length} key(s), archive ${result.archive.archived.length} file(s)`
          : `Set ${result.set.length} key(s); archived ${result.archive.archived.length} file(s) to ${result.archive.archive_dir_absolute}`,
        { ...result },
      )
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv migrate apply --plan .onenv-migrate-plan.json --dry-run
      Validate the plan; print what would happen
  $ onenv migrate apply --plan .onenv-migrate-plan.json
      Interactive confirm, then run
  $ onenv migrate apply --plan plan.json --yes
      Non-interactive (CI / scripted)`,
    )
}

function readPlanOrThrow(path: string): MigratePlan {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as MigratePlan
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new CliError(
      'VALIDATION',
      `Could not read plan at ${path}: ${detail}`,
      'user_error',
      'Generate one with: onenv migrate plan --out <file>',
    )
  }
}

async function confirmApply(
  plan: MigratePlan,
  options: { dryRun?: boolean; yes?: boolean },
): Promise<void> {
  if (options.dryRun || options.yes || !process.stdout.isTTY) return
  const toSet = plan.actions.filter((a) => a.action === 'set').length
  const archiveCount = plan.archive.files.length
  const namespaces = plan.config.namespaces.join(', ') || '(none)'
  const answer = await p.confirm({
    message: `Apply migration: ${toSet} key(s) to namespaces [${namespaces}], archive ${archiveCount} env file(s) under ${plan.archive.dir}?`,
    initialValue: false,
  })
  if (p.isCancel(answer) || answer !== true) {
    throw new CliError('VALIDATION', 'Apply cancelled by user', 'user_error')
  }
}
