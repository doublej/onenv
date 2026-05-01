import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface RefState {
  refs: string[]
  last?: string
}

function getRefPath(): string {
  const root = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(root, 'onenv-manager', 'refs.json')
}

async function readRefs(): Promise<RefState> {
  try {
    const raw = await readFile(getRefPath(), 'utf-8')
    return JSON.parse(raw) as RefState
  } catch {
    return { refs: [] }
  }
}

async function writeRefs(state: RefState): Promise<void> {
  const path = getRefPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2), 'utf-8')
}

export async function storeRefs(namespaces: string[]): Promise<void> {
  await writeRefs({ refs: namespaces, last: namespaces.at(-1) })
}

export async function resolveRef(input: string): Promise<string> {
  if (!input.startsWith('@')) return input

  const state = await readRefs()

  if (input === '@last') {
    if (!state.last) throw new Error('No previous reference. Run a command first.')
    return state.last
  }

  const index = Number.parseInt(input.slice(1), 10) - 1
  if (Number.isNaN(index) || index < 0 || index >= state.refs.length) {
    throw new Error(`Invalid ref ${input}. Available: @1–@${state.refs.length}, @last`)
  }

  return state.refs[index]
}
