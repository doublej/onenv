import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validationError } from './errors.js'
import { unflatten } from './json-flatten.js'
import { listGroupEntries } from './onenv-client.js'

export interface Materialized {
  path: string
  cleanup: () => void
}

export async function materializeFile(namespace: string, group: string): Promise<Materialized> {
  const entries = await listGroupEntries(namespace, group)
  if (entries.length === 0) {
    throw validationError(
      `No entries found for group ${namespace}:${group}`,
      `Run "onenv import ${namespace} <file> --group ${group}" first`,
    )
  }
  const json = unflatten(entries)
  const root = process.env.XDG_RUNTIME_DIR ?? tmpdir()
  const dir = mkdtempSync(join(root, 'onenv-'))
  const file = join(dir, `${group}.json`)
  writeFileSync(file, JSON.stringify(json), { mode: 0o600 })
  return { path: file, cleanup: () => safeRm(dir) }
}

function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}
