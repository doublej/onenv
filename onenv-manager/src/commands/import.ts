import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { CliError, validationError } from '../lib/errors.js'
import { type FlatEntry, flatten } from '../lib/json-flatten.js'
import { getItemWithMeta, setValueWithMeta } from '../lib/onenv-client.js'
import type { JsonLeafType } from '../lib/types.js'
import { validateKey } from '../lib/validation.js'

export type KeyStrategy = 'upper-snake' | 'leaf'

export interface ImportOptions {
  group?: string
  keys?: KeyStrategy
  prefix?: string
  dryRun?: boolean
}

export interface ImportPlanRow {
  key: string
  path: string
  type: JsonLeafType
}

export async function importJsonFile(
  namespace: string,
  filePath: string,
  opts: ImportOptions = {},
): Promise<{ group: string; rows: ImportPlanRow[] }> {
  const parsed = readJsonFile(filePath)
  const group = opts.group ?? deriveGroupName(filePath)
  const strategy: KeyStrategy = opts.keys ?? 'upper-snake'
  const prefix = opts.prefix ?? ''

  const entries = flatten(parsed)
  const rows = entries.map((e) => ({
    key: validateKey(deriveKey(e.path, strategy, prefix)),
    path: e.path,
    type: e.type,
  }))
  assertNoCollisions(rows)

  if (opts.dryRun) return { group, rows }

  for (let i = 0; i < entries.length; i++) {
    await writeEntry(namespace, group, entries[i], rows[i].key)
  }
  return { group, rows }
}

function readJsonFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw validationError(`Failed to parse JSON: ${msg}`, `Check that ${filePath} is valid JSON`)
  }
}

async function writeEntry(
  namespace: string,
  group: string,
  entry: FlatEntry,
  key: string,
): Promise<void> {
  await ensureGroupConsistent(namespace, key, group)
  await setValueWithMeta(namespace, key, entry.value, {
    group,
    path: entry.path,
    type: entry.type,
  })
}

function deriveGroupName(filePath: string): string {
  const ext = extname(filePath)
  return basename(filePath, ext)
}

function deriveKey(path: string, strategy: KeyStrategy, prefix: string): string {
  const raw =
    strategy === 'leaf'
      ? (path.match(/([^.[]+)(?:\[\d+\])*$/)?.[1] ?? '')
      : path
          .replace(/\[(\d+)\]/g, '_$1')
          .replace(/\./g, '_')
          .replace(/^_+/, '')
  const key = raw.toUpperCase() || 'ROOT'
  return prefix ? `${prefix}_${key}` : key
}

function assertNoCollisions(rows: ImportPlanRow[]): void {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const arr = map.get(row.key) ?? []
    arr.push(row.path || '<root>')
    map.set(row.key, arr)
  }
  const dupes = [...map.entries()].filter(([, ps]) => ps.length > 1)
  if (dupes.length === 0) return
  const detail = dupes.map(([k, ps]) => `  ${k}: ${ps.join(', ')}`).join('\n')
  throw validationError(
    `Key collisions detected:\n${detail}`,
    'Use --prefix to disambiguate or rename JSON keys',
  )
}

async function ensureGroupConsistent(namespace: string, key: string, group: string): Promise<void> {
  try {
    const detail = await getItemWithMeta(namespace, key)
    if (!detail.group) {
      throw validationError(
        `${namespace}/${key} already exists without a group`,
        'Use a different key, prefix, or "onenv unset" first',
      )
    }
    if (detail.group !== group) {
      throw validationError(
        `${namespace}/${key} belongs to group "${detail.group}"`,
        `Pick a different namespace or unset the existing key first`,
      )
    }
  } catch (err) {
    if (err instanceof CliError && err.code === 'NOT_FOUND') return
    throw err
  }
}
