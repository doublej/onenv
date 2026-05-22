import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProjectMarker } from '../lib/project-marker.js'
import { scan } from './migrate/scan.js'
import type { DetectedSection } from './prime-data.js'

// Gated cwd snapshot for the prime primer. Returns null when there's no
// project marker — agents launched from $HOME or a scratch shell should
// get the static contract and nothing else.
export async function buildDetectedSection(cwd: string): Promise<DetectedSection | null> {
  const marker = detectProjectMarker(cwd)
  if (!marker) return null

  const result = await scan(cwd)
  const onenv = readOnenvJson(cwd)
  return {
    cwd,
    project_marker: marker,
    framework: result.framework,
    env_files: result.env_files.map((f) => ({
      relative: f.relative,
      key_count: f.entries.length,
      tracked: f.tracked,
    })),
    onenv_json: onenv.status,
    namespaces_referenced: onenv.namespaces,
    next_action: nextAction(result.env_files.length, onenv.status),
    caveat:
      'This block reflects the working directory at the time `onenv prime` ran. If you cd elsewhere, re-run prime — paths and env files are NOT global.',
  }
}

interface OnenvJsonState {
  status: 'present' | 'absent' | 'invalid'
  namespaces: string[]
}

function readOnenvJson(cwd: string): OnenvJsonState {
  const path = join(cwd, '.onenv.json')
  if (!existsSync(path)) return { status: 'absent', namespaces: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(parsed.namespaces) || parsed.namespaces.length === 0) {
      return { status: 'invalid', namespaces: [] }
    }
    return {
      status: 'present',
      namespaces: parsed.namespaces.filter((s: unknown) => typeof s === 'string'),
    }
  } catch {
    return { status: 'invalid', namespaces: [] }
  }
}

function nextAction(envFileCount: number, onenvStatus: OnenvJsonState['status']): string {
  if (onenvStatus === 'present' && envFileCount > 0) {
    return 'Project already uses onenv but has env files alongside — archive them via `onenv migrate apply` (when available) or remove manually.'
  }
  if (onenvStatus === 'present') {
    return 'Project already uses onenv. Run `onenv run -- <command>` to inject secrets.'
  }
  if (envFileCount > 0) {
    return 'Run `onenv migrate scan` for a full inventory with namespace suggestions.'
  }
  return 'No env files detected. Run `onenv init` to set up `.onenv.json` once secrets are in 1Password.'
}
