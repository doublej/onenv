import { basename, join } from 'node:path'
import { detectProjectMarker } from '../../lib/project-marker.js'
import { classifyKey, suggestNamespace } from './classify-keys.js'
import { detectEnvFiles, type RawEnvFile } from './detect-env-files.js'
import { detectFramework } from './detect-framework.js'
import type { MigratePlan, PlannedAction } from './plan-types.js'
import { PLAN_VERSION } from './plan-types.js'
import type { KeyRole } from './types.js'

export async function buildPlan(cwd: string): Promise<MigratePlan> {
  const marker = detectProjectMarker(cwd)
  const framework = detectFramework(cwd)
  const raw = await detectEnvFiles(cwd)
  const fallbackNs = basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
  const actions = buildActions(raw, framework, fallbackNs)
  const namespaces = uniqueNamespaces(actions.filter((a) => a.action === 'set'))
  return {
    version: PLAN_VERSION,
    cwd,
    created_at: new Date().toISOString(),
    scan: {
      project_marker: marker,
      framework: framework.kind,
      env_file_count: raw.length,
    },
    actions,
    archive: {
      dir: join('.onenv-archive', archiveStamp(new Date())),
      files: raw.map((f) => f.relative),
    },
    config: { namespaces, path: '.onenv.json' },
    blockers: collectBlockers(actions),
  }
}

function buildActions(
  files: RawEnvFile[],
  framework: ReturnType<typeof detectFramework>,
  fallback: string,
): PlannedAction[] {
  type Bucket = PlannedAction & { sources: { file: string; line: number; value: string }[] }
  const buckets = new Map<string, Bucket>()
  for (const file of files) {
    for (const entry of file.entries) {
      const existing = buckets.get(entry.key)
      const source = { file: file.relative, line: entry.line, value: entry.value }
      if (existing) {
        existing.sources.push(source)
        continue
      }
      const role: KeyRole = classifyKey(entry.key, framework)
      buckets.set(entry.key, {
        key: entry.key,
        namespace: suggestNamespace(entry.key, fallback),
        role,
        action: 'set',
        source_file: file.relative,
        source_line: entry.line,
        value_preview: previewValue(entry.value),
        sources: [source],
      })
    }
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map(finalizeAction)
}

function finalizeAction(
  b: PlannedAction & { sources: { file: string; line: number; value: string }[] },
): PlannedAction {
  const { sources, ...rest } = b
  if (sources.length === 1) return rest
  const distinct = new Set(sources.map((s) => s.value))
  if (distinct.size === 1) return rest
  return {
    ...rest,
    conflicts: sources.slice(1).map(({ file, line }) => ({ file, line })),
  }
}

function previewValue(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${value.slice(0, 2)}…${value.slice(-2)} (${value.length})`
}

function uniqueNamespaces(actions: PlannedAction[]): string[] {
  return [...new Set(actions.map((a) => a.namespace))].sort()
}

function collectBlockers(actions: PlannedAction[]): string[] {
  const out: string[] = []
  const conflictKeys = actions.filter((a) => a.conflicts && a.action === 'set').map((a) => a.key)
  if (conflictKeys.length > 0) {
    out.push(
      `Conflicting values for ${conflictKeys.length} key(s): ${conflictKeys.join(', ')}. Resolve by editing the plan (set "action":"skip" on duplicate keys) or removing duplicates from env files.`,
    )
  }
  return out
}

function archiveStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}
