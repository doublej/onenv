import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface StateFile {
  version: 1
  disabled: Record<string, string[]>
}

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
  try {
    const raw = await readFile(getStatePath(), 'utf-8')
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

export async function getDisabledMap(): Promise<Record<string, string[]>> {
  const state = await readState()
  return state.disabled
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
