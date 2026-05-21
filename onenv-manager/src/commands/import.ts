import { readFileSync } from 'node:fs'
import { text } from 'node:stream/consumers'
import { CliError, validationError } from '../lib/errors.js'
import { type FlatEntry, flatten } from '../lib/json-flatten.js'
import {
  getItemWithMeta,
  type ItemMeta,
  mapWithLimit,
  setValueWithMeta,
  unsetValue,
} from '../lib/onenv-client.js'
import type { JsonLeafType } from '../lib/types.js'
import { validateKey } from '../lib/validation.js'

export type KeyStrategy = 'upper-snake' | 'leaf'

export interface ImportOptions {
  group: string
  keys?: KeyStrategy
  prefix?: string
  dryRun?: boolean
  overwrite?: boolean
  fromStdin?: boolean
}

export interface ImportPlanRow {
  key: string
  path: string
  type: JsonLeafType
}

const SNAPSHOT_PARALLEL_LIMIT = 10

interface SnapshotEntry {
  key: string
  existed: boolean
  prior?: { value: string } & ItemMeta
}

/**
 * Atomically import a JSON file (or stdin) into onenv keys.
 *
 * Contract: either every key ends up with the new value, OR (on any error)
 * every key returns to its pre-import state. Snapshots are fetched before
 * writes begin; on write failure we restore existing keys and delete keys
 * we just created.
 */
export async function importJsonFile(
  namespace: string,
  filePath: string | undefined,
  opts: ImportOptions,
): Promise<{ group: string; rows: ImportPlanRow[] }> {
  if (!opts.group) {
    throw validationError(
      'Group is required',
      'Pass --group <name> (or set opts.group when calling programmatically)',
    )
  }
  const parsed = await readJsonInput(filePath, opts)
  const { entries, rows } = planRows(parsed, opts)

  if (opts.dryRun) return { group: opts.group, rows }

  const keys = rows.map((r) => r.key)
  const snapshot = await fetchSnapshot(namespace, keys)
  validateAgainstSnapshot(snapshot, namespace, opts)

  const written: string[] = []
  try {
    for (let i = 0; i < entries.length; i++) {
      await setValueWithMeta(namespace, rows[i].key, entries[i].value, {
        group: opts.group,
        path: entries[i].path,
        type: entries[i].type,
      })
      written.push(rows[i].key)
    }
  } catch (err) {
    await rollback(namespace, snapshot, written, err)
    throw err
  }
  return { group: opts.group, rows }
}

async function readJsonInput(filePath: string | undefined, opts: ImportOptions): Promise<unknown> {
  if (opts.fromStdin) return readJsonStdin()
  if (!filePath) {
    throw validationError('No JSON source provided', 'Pass a file path or use --from-stdin')
  }
  return readJsonFile(filePath)
}

function readJsonFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf-8')
  return parseJson(raw, `Check that ${filePath} is valid JSON`)
}

async function readJsonStdin(): Promise<unknown> {
  const raw = await text(process.stdin)
  return parseJson(raw, 'Check that stdin contains valid JSON')
}

function parseJson(raw: string, hint: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw validationError(`Failed to parse JSON: ${msg}`, hint)
  }
}

function planRows(
  parsed: unknown,
  opts: ImportOptions,
): { entries: FlatEntry[]; rows: ImportPlanRow[] } {
  const strategy: KeyStrategy = opts.keys ?? 'upper-snake'
  const prefix = opts.prefix ?? ''
  const entries = flatten(parsed)
  const rows = entries.map((e) => ({
    key: validateKey(deriveKey(e.path, strategy, prefix)),
    path: e.path,
    type: e.type,
  }))
  assertNoCollisions(rows)
  return { entries, rows }
}

async function fetchSnapshot(namespace: string, keys: string[]): Promise<SnapshotEntry[]> {
  return await mapWithLimit(keys, SNAPSHOT_PARALLEL_LIMIT, async (key) => {
    try {
      const prior = await getItemWithMeta(namespace, key)
      return { key, existed: true, prior }
    } catch (err) {
      if (err instanceof CliError && err.code === 'NOT_FOUND') {
        return { key, existed: false }
      }
      throw err
    }
  })
}

function validateAgainstSnapshot(
  snapshot: SnapshotEntry[],
  namespace: string,
  opts: ImportOptions,
): void {
  if (opts.overwrite) return
  for (const entry of snapshot) {
    if (!entry.existed || !entry.prior) continue
    const priorGroup = entry.prior.group
    if (!priorGroup) {
      throw validationError(
        `${namespace}/${entry.key} already exists without a group`,
        'Use a different key, prefix, or "onenv unset" first (or pass --overwrite)',
      )
    }
    if (priorGroup !== opts.group) {
      throw validationError(
        `${namespace}/${entry.key} belongs to group "${priorGroup}"`,
        'Pick a different namespace, unset the existing key, or pass --overwrite',
      )
    }
  }
}

async function rollback(
  namespace: string,
  snapshot: SnapshotEntry[],
  written: string[],
  originalErr: unknown,
): Promise<void> {
  const byKey = new Map(snapshot.map((s) => [s.key, s]))
  const rollbackErrs: unknown[] = []
  for (const key of written) {
    const snap = byKey.get(key)
    try {
      if (snap?.existed && snap.prior) {
        await setValueWithMeta(namespace, key, snap.prior.value, {
          group: snap.prior.group,
          path: snap.prior.path,
          type: snap.prior.type,
        })
      } else {
        await unsetValue(namespace, key)
      }
    } catch (e) {
      rollbackErrs.push(e)
    }
  }
  if (rollbackErrs.length > 0) {
    const origMsg = originalErr instanceof Error ? originalErr.message : String(originalErr)
    const detail = rollbackErrs.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')
    process.stderr.write(
      `[onenv] rollback after import failure had errors. Original: ${origMsg}. Rollback errors: ${detail}\n`,
    )
  }
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
