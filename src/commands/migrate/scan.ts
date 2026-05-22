import { basename } from 'node:path'
import { detectProjectMarker } from '../../lib/project-marker.js'
import { classifyKey, suggestNamespace } from './classify-keys.js'
import { detectEnvFiles, type RawEnvFile } from './detect-env-files.js'
import { detectFramework } from './detect-framework.js'
import type { EnvFile, KeyEntry, KeyRole, ScanResult, ScanSummary } from './types.js'

export async function scan(cwd: string): Promise<ScanResult> {
  const project_marker = detectProjectMarker(cwd)
  const framework = detectFramework(cwd)
  const raw = await detectEnvFiles(cwd)
  const fallbackNs = projectNamespace(cwd)
  const keys = collectKeys(raw, framework, fallbackNs)
  return {
    cwd,
    project_marker,
    framework,
    env_files: raw.map(stripValues),
    keys,
    summary: summarize(raw, keys),
    warnings: buildWarnings(raw),
  }
}

function stripValues(file: RawEnvFile): EnvFile {
  return {
    path: file.path,
    relative: file.relative,
    tracked: file.tracked,
    entries: file.entries.map(({ key, line }) => ({ key, line })),
  }
}

function projectNamespace(cwd: string): string {
  return basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
}

function collectKeys(
  files: RawEnvFile[],
  framework: ReturnType<typeof detectFramework>,
  fallback: string,
): KeyEntry[] {
  const buckets = new Map<string, KeyEntry>()
  for (const file of files) {
    for (const entry of file.entries) {
      const existing = buckets.get(entry.key)
      const source = {
        file: file.relative,
        line: entry.line,
        value_preview: previewValue(entry.value),
      }
      if (existing) {
        existing.sources.push(source)
        existing.conflict = existing.conflict || sourceValuesDiffer(existing.sources, entry.value)
        continue
      }
      buckets.set(entry.key, {
        key: entry.key,
        role: classifyKey(entry.key, framework),
        suggested_namespace: suggestNamespace(entry.key, fallback),
        sources: [source],
        conflict: false,
      })
    }
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function previewValue(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${value.slice(0, 2)}…${value.slice(-2)} (${value.length})`
}

function sourceValuesDiffer(sources: KeyEntry['sources'], next: string): boolean {
  const preview = previewValue(next)
  return sources.some((s) => s.value_preview !== preview)
}

function summarize(files: RawEnvFile[], keys: KeyEntry[]): ScanSummary {
  const by_role: Record<KeyRole, number> = { secret: 0, public: 0, config: 0 }
  let conflicts = 0
  for (const k of keys) {
    by_role[k.role]++
    if (k.conflict) conflicts++
  }
  return {
    env_files: files.length,
    total_keys: keys.length,
    by_role,
    conflicts,
    tracked_env_files: files.filter((f) => f.tracked).length,
  }
}

function buildWarnings(files: RawEnvFile[]): string[] {
  const out: string[] = []
  for (const f of files) {
    if (f.tracked) {
      out.push(
        `${f.relative} is tracked in git — rotate any real secrets it contains; git history retains them.`,
      )
    }
  }
  return out
}
