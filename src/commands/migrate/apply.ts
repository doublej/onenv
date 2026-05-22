import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError } from '../../lib/errors.js'
import { createOrUpdateVar } from '../../lib/manager-service.js'
import { type ArchiveResult, archiveFiles } from './archive.js'
import { parseEnvFile } from './parse-env.js'
import { type MigratePlan, PLAN_VERSION, type PlannedAction } from './plan-types.js'

export interface ApplyOptions {
  dryRun: boolean
}

export interface ApplyResult {
  dry_run: boolean
  set: { namespace: string; key: string }[]
  skipped: { key: string; reason: string }[]
  config_written: string
  archive: ArchiveResult
}

export async function applyPlan(plan: MigratePlan, options: ApplyOptions): Promise<ApplyResult> {
  validate(plan)
  const values = loadValues(plan)
  const toSet = plan.actions.filter((a) => a.action === 'set')
  const toSkip = plan.actions
    .filter((a) => a.action === 'skip')
    .map((a) => ({ key: a.key, reason: `role=${a.role}` }))

  const set: { namespace: string; key: string }[] = []
  if (!options.dryRun) {
    for (const action of toSet) {
      const value = lookupValue(values, action)
      await createOrUpdateVar(action.namespace, action.key, value)
      set.push({ namespace: action.namespace, key: action.key })
    }
  } else {
    for (const action of toSet) {
      // Resolve to surface missing values even in dry-run.
      lookupValue(values, action)
      set.push({ namespace: action.namespace, key: action.key })
    }
  }

  const configPath = resolve(plan.cwd, plan.config.path)
  if (!options.dryRun && plan.config.namespaces.length > 0) {
    writeFileSync(
      configPath,
      `${JSON.stringify({ namespaces: plan.config.namespaces }, null, 2)}\n`,
    )
  }

  const archive = options.dryRun
    ? {
        archived: plan.archive.files,
        archive_dir_absolute: resolve(plan.cwd, plan.archive.dir),
        gitignore_updated: false,
      }
    : archiveFiles(plan.cwd, plan.archive)

  return { dry_run: options.dryRun, set, skipped: toSkip, config_written: configPath, archive }
}

function validate(plan: MigratePlan): void {
  if (plan.version !== PLAN_VERSION) {
    throw new CliError(
      'VALIDATION',
      `Unsupported plan version ${plan.version}`,
      'user_error',
      `This onenv supports plan version ${PLAN_VERSION}. Regenerate: onenv migrate plan --out <file>`,
    )
  }
  if (plan.blockers.length > 0) {
    throw new CliError(
      'VALIDATION',
      `Plan has ${plan.blockers.length} blocker(s):\n  ${plan.blockers.join('\n  ')}`,
      'user_error',
      'Resolve blockers in the plan file or env sources, then re-run apply.',
    )
  }
}

type ValueMap = Map<string, Map<string, string>>

function loadValues(plan: MigratePlan): ValueMap {
  const out: ValueMap = new Map()
  const files = new Set(plan.actions.map((a) => a.source_file))
  for (const file of files) {
    const abs = resolve(plan.cwd, file)
    if (!existsSync(abs)) {
      throw new CliError(
        'VALIDATION',
        `Source file missing: ${file}`,
        'user_error',
        'Env files referenced by the plan must exist at the same paths. Re-run "migrate plan" if files moved.',
      )
    }
    const entries = parseEnvFile(readFileSync(abs, 'utf-8'))
    const map = new Map<string, string>()
    for (const e of entries) map.set(e.key, e.value)
    out.set(file, map)
  }
  return out
}

function lookupValue(values: ValueMap, action: PlannedAction): string {
  const fileMap = values.get(action.source_file)
  const value = fileMap?.get(action.key)
  if (value === undefined) {
    throw new CliError(
      'VALIDATION',
      `Key ${action.key} not found in ${action.source_file}`,
      'user_error',
      'The env file may have been edited since the plan was generated. Re-run "migrate plan".',
    )
  }
  return value
}
