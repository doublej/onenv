import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectMarker } from './doctor-types.js'

const MARKERS: { file: string; kind: ProjectMarker['kind'] }[] = [
  { file: 'package.json', kind: 'node' },
  { file: 'pyproject.toml', kind: 'python' },
  { file: 'Cargo.toml', kind: 'rust' },
  { file: 'go.mod', kind: 'go' },
  { file: '.git', kind: 'git' },
]

export function detectProjectMarker(cwd: string): ProjectMarker | null {
  for (const { file, kind } of MARKERS) {
    if (existsSync(join(cwd, file))) return { kind, file }
  }
  return null
}
