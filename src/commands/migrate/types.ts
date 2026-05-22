import type { ProjectMarker } from '../../lib/project-marker.js'

export type KeyRole = 'secret' | 'public' | 'config'

export interface ParsedEnvEntry {
  key: string
  value: string
  line: number
}

export interface EnvFile {
  path: string
  relative: string
  tracked: boolean
  // Raw values are intentionally NOT included — scan output is meant to be
  // safe to share. Use parse-env directly when values are actually needed
  // (plan/apply re-read from disk).
  entries: Pick<ParsedEnvEntry, 'key' | 'line'>[]
}

export interface KeyEntry {
  key: string
  role: KeyRole
  suggested_namespace: string
  sources: { file: string; line: number; value_preview: string }[]
  conflict: boolean
}

export interface ScanResult {
  cwd: string
  project_marker: ProjectMarker | null
  framework: Framework
  env_files: EnvFile[]
  keys: KeyEntry[]
  summary: ScanSummary
  warnings: string[]
}

export interface Framework {
  kind: 'nextjs' | 'vite' | 'sveltekit' | 'expo' | 'generic'
  public_prefix: string | null
}

export interface ScanSummary {
  env_files: number
  total_keys: number
  by_role: Record<KeyRole, number>
  conflicts: number
  tracked_env_files: number
}
