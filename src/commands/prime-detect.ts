import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProjectMarker } from '../lib/project-marker.js'
import { scan } from './migrate/scan.js'
import type { DetectedSection } from './prime-data.js'

// Gated cwd snapshot for the prime primer. Returns null when there's no
// project marker — agents launched from $HOME or a scratch shell should
// get the static contract and nothing else.
export async function buildDetectedSection(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DetectedSection | null> {
  const marker = detectProjectMarker(cwd)
  if (!marker) return null

  const result = await scan(cwd)
  const onenv = readOnenvJson(cwd)
  const active = env.ONENV_ACTIVE ?? null
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
    onenv_active: active,
    next_action: nextAction(result.env_files.length, onenv, active),
    caveat:
      'This block reflects the working directory at the time `onenv prime` ran. If you cd elsewhere, re-run prime — paths and env files are NOT global.',
  }
}

interface OnenvJsonState {
  status: 'present' | 'absent' | 'invalid'
  namespaces: string[]
  // namespaces minus fileOnlyNamespaces — what run/shell actually flat-inject,
  // and therefore what ONENV_ACTIVE is compared against.
  flat_namespaces: string[]
}

function readOnenvJson(cwd: string): OnenvJsonState {
  const path = join(cwd, '.onenv.json')
  if (!existsSync(path)) return { status: 'absent', namespaces: [], flat_namespaces: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(parsed.namespaces) || parsed.namespaces.length === 0) {
      return { status: 'invalid', namespaces: [], flat_namespaces: [] }
    }
    const namespaces = parsed.namespaces.filter((s: unknown) => typeof s === 'string')
    const fileOnly = new Set(
      Array.isArray(parsed.fileOnlyNamespaces)
        ? parsed.fileOnlyNamespaces.filter((s: unknown) => typeof s === 'string')
        : [],
    )
    return {
      status: 'present',
      namespaces,
      flat_namespaces: namespaces.filter((ns: string) => !fileOnly.has(ns)),
    }
  } catch {
    return { status: 'invalid', namespaces: [], flat_namespaces: [] }
  }
}

function nextAction(envFileCount: number, onenv: OnenvJsonState, active: string | null): string {
  if (onenv.status === 'present' && envFileCount > 0) {
    return 'Project already uses onenv but has env files alongside — archive them via `onenv migrate apply` (when available) or remove manually.'
  }
  if (onenv.status === 'present') {
    return primingAction(onenv.flat_namespaces, active)
  }
  if (envFileCount > 0) {
    return 'Run `onenv migrate scan` for a full inventory with namespace suggestions.'
  }
  return 'No env files detected. Run `onenv init` to set up `.onenv.json` once secrets are in 1Password.'
}

function primingAction(flatNamespaces: string[], active: string | null): string {
  if (!active) {
    return 'Environment NOT primed — secrets are not in process.env. Prefix every command with `onenv run -- <cmd>`, or start a primed session with `onenv shell`. Verify with `onenv check`.'
  }
  const loaded = new Set(active.split(','))
  const missing = flatNamespaces.filter((ns) => !loaded.has(ns))
  if (missing.length > 0) {
    return `Environment PARTIALLY primed (ONENV_ACTIVE=${active}) — missing namespaces: ${missing.join(', ')}. Prefix commands with \`onenv run -- <cmd>\`, or \`exit\` and restart with \`onenv shell\`.`
  }
  return `Environment already primed (ONENV_ACTIVE=${active}). Run commands directly — no onenv prefix needed.`
}
