import { readFileSync } from 'node:fs'
import { text } from 'node:stream/consumers'
import type { Command } from 'commander'
import { validationError } from '../lib/errors.js'
import { type FlatEntry, flatten } from '../lib/json-flatten.js'
import { setValueWithMeta } from '../lib/onenv-client.js'
import { output, success } from '../lib/output.js'
import { confirmMutation } from '../lib/permission.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import type { JsonLeafType } from '../lib/types.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { fetchSnapshot, rollback, type SnapshotEntry } from './_snapshot.js'

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

  await confirmMutation({
    action: 'import',
    namespace,
    details: `group=${opts.group} keys=${keys.length}`,
  })

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
    await rollback(namespace, snapshot, written, err, 'import')
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

interface ImportCliOptions {
  group: string
  keys?: string
  prefix?: string
  dryRun?: boolean
  overwrite?: boolean
  fromStdin?: boolean
}

async function importAction(
  rawNamespace: string,
  file: string | undefined,
  options: ImportCliOptions,
): Promise<void> {
  if (options.fromStdin && file) {
    throw validationError(
      'Cannot combine <file> with --from-stdin',
      'Pass either a file path or --from-stdin, not both',
    )
  }
  if (!options.fromStdin && !file) {
    throw validationError('No JSON source provided', 'Pass a file path or use --from-stdin')
  }
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const strategy: KeyStrategy = options.keys === 'leaf' ? 'leaf' : 'upper-snake'
  const result = await importJsonFile(namespace, file, {
    group: options.group,
    keys: strategy,
    prefix: options.prefix,
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    fromStdin: options.fromStdin,
  })
  await storeRefs([namespace])
  if (options.dryRun) {
    output({ namespace, group: result.group, plan: result.rows })
    return
  }
  success(`Imported ${result.rows.length} keys into ${namespace} (group: ${result.group})`, {
    namespace,
    group: result.group,
    count: result.rows.length,
  })
}

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description('Flatten a JSON file (or stdin) into onenv keys with reassembly metadata')
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('[file]', 'Path to a JSON file to import (omit when using --from-stdin)')
    .requiredOption('-g, --group <name>', 'Group name (required)')
    .option('-k, --keys <strategy>', 'Key naming: upper-snake (default) or leaf', 'upper-snake')
    .option('-p, --prefix <prefix>', 'Prefix prepended to every derived key')
    .option('--dry-run', 'Print the import plan without writing')
    .option('--overwrite', 'Overwrite existing keys regardless of group; atomic on failure')
    .option('--from-stdin', 'Read JSON from stdin instead of a file')
    .action(importAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv import oauth ./client_secret.json --group oauth
      Flatten a JSON file into onenv keys under the oauth group
  $ cat secret.json | onenv import oauth --group oauth --from-stdin
      Read JSON from stdin, no on-disk footprint
  $ onenv import oauth ./new.json --group oauth --overwrite
      Replace existing keys atomically
  $ onenv import oauth ./client_secret.json --group oauth --dry-run
      Preview the import plan without writing`,
    )
}
