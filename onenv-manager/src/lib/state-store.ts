import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { StateFile } from './types.js'

const DEFAULT_STATE: StateFile = {
  version: 1,
  disabled: {},
}

function getConfigRoot(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

function getStatePath(): string {
  return join(getConfigRoot(), 'onenv-manager', 'state.json')
}

async function readState(): Promise<StateFile> {
  const statePath = getStatePath()

  try {
    const raw = await readFile(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StateFile>
    return {
      version: 1,
      disabled: parsed.disabled ?? {},
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

async function writeState(state: StateFile): Promise<void> {
  const statePath = getStatePath()
  await mkdir(dirname(statePath), { recursive: true })
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

export async function isDisabled(namespace: string, key: string): Promise<boolean> {
  const state = await readState()
  return (state.disabled[namespace] ?? []).includes(key)
}

export async function setDisabled(
  namespace: string,
  key: string,
  disabled: boolean,
): Promise<void> {
  const state = await readState()
  const keys = new Set(state.disabled[namespace] ?? [])

  if (disabled) {
    keys.add(key)
  } else {
    keys.delete(key)
  }

  if (keys.size === 0) {
    delete state.disabled[namespace]
  } else {
    state.disabled[namespace] = [...keys].sort()
  }

  await writeState(state)
}

export async function getDisabledMap(): Promise<Record<string, string[]>> {
  const state = await readState()
  return state.disabled
}

export function getStateFilePath(): string {
  return getStatePath()
}
