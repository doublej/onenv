import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ProjectMarker {
  kind: 'node' | 'python' | 'rust' | 'go' | 'git'
  file: string
}

const MARKERS: ProjectMarker[] = [
  { file: 'package.json', kind: 'node' },
  { file: 'pyproject.toml', kind: 'python' },
  { file: 'Cargo.toml', kind: 'rust' },
  { file: 'go.mod', kind: 'go' },
  { file: '.git', kind: 'git' },
]

export function detectProjectMarker(cwd: string): ProjectMarker | null {
  for (const m of MARKERS) {
    if (existsSync(join(cwd, m.file))) return m
  }
  return null
}
