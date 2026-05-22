import type { ProjectMarker } from '../../lib/project-marker.js'
import type { KeyRole } from './types.js'

export const PLAN_VERSION = 1

export interface MigratePlan {
  version: typeof PLAN_VERSION
  cwd: string
  created_at: string
  scan: {
    project_marker: ProjectMarker | null
    framework: string
    env_file_count: number
  }
  actions: PlannedAction[]
  archive: ArchivePlan
  config: { namespaces: string[]; path: string }
  blockers: string[]
}

export interface PlannedAction {
  key: string
  namespace: string
  role: KeyRole
  action: 'set' | 'skip'
  // Source of truth — apply re-reads the file. Plan never carries values.
  source_file: string
  source_line: number
  value_preview: string
  conflicts?: { file: string; line: number }[]
}

export interface ArchivePlan {
  dir: string
  files: string[]
}
