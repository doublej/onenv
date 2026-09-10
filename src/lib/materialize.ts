import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { validationError } from './errors.js'
import { findRawEntry, unflatten } from './json-flatten.js'
import { listGroupEntries } from './onenv-client.js'

export interface Materialized {
  path: string
  raw: boolean
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
  const raw = findRawEntry(entries)
  const root = process.env.XDG_RUNTIME_DIR ?? tmpdir()
  const dir = mkdtempSync(join(root, 'onenv-'))
  // raw groups keep their original filename (tools like Apple's check the pattern)
  const file = join(dir, raw ? basename(raw.path) || group : `${group}.json`)
  const body = raw ? raw.value : JSON.stringify(unflatten(entries))
  writeFileSync(file, body, { mode: 0o600 })
  return { path: file, raw: raw !== undefined, cleanup: () => safeRm(dir) }
}

function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}
