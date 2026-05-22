export type CheckStatus = 'ok' | 'warn' | 'error' | 'skip'

export interface Check {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}

export interface DoctorReport {
  cwd: string
  project_marker: ProjectMarker | null
  checks: Check[]
  summary: { ok: number; warn: number; error: number; skip: number }
}

export interface ProjectMarker {
  kind: 'node' | 'python' | 'rust' | 'go' | 'git'
  file: string
}
