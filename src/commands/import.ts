import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
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
  raw?: boolean
  key?: string
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
  const { entries, rows } = opts.raw
    ? await planRawRow(filePath, opts)
    : planRows(await readJsonInput(filePath, opts), opts)

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

/**
 * `--raw`: the whole file becomes one key. The original filename is stored as
 * the path so build-file / run --file can reproduce it byte-for-byte.
 */
async function planRawRow(
  filePath: string | undefined,
  opts: ImportOptions,
): Promise<{ entries: FlatEntry[]; rows: ImportPlanRow[] }> {
  const value = opts.fromStdin ? await text(process.stdin) : readRawFile(filePath)
  if (value.length === 0)
    throw validationError('Raw input is empty', 'Refusing to store an empty file')
  const name = filePath ? basename(filePath) : opts.group
  const key = opts.key ? validateKey(opts.key) : validateKey(deriveRawKey(name, opts.prefix ?? ''))
  return { entries: [{ path: name, type: 'raw', value }], rows: [{ key, path: name, type: 'raw' }] }
}

function readRawFile(filePath: string | undefined): string {
  if (!filePath) throw validationError('No file provided', 'Pass a file path or use --from-stdin')
  return readFileSync(filePath, 'utf-8')
}

function deriveRawKey(name: string, prefix: string): string {
  const key = name
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toUpperCase()
  return prefix ? `${prefix}_${key}` : key
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
  raw?: boolean
  key?: string
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
    throw validationError('No input provided', 'Pass a file path or use --from-stdin')
  }
  if (options.key && !options.raw) {
    throw validationError(
      '--key requires --raw',
      'Use --key only with --raw; JSON imports derive keys from paths (see --keys/--prefix)',
    )
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
    raw: options.raw,
    key: options.key,
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
    .description(
      'Flatten a JSON file (or stdin) into onenv keys, or store any file verbatim with --raw',
    )
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('[file]', 'Path to a JSON file to import (omit when using --from-stdin)')
    .requiredOption('-g, --group <name>', 'Group name (required)')
    .option('-k, --keys <strategy>', 'Key naming: upper-snake (default) or leaf', 'upper-snake')
    .option('-p, --prefix <prefix>', 'Prefix prepended to every derived key')
    .option('--dry-run', 'Print the import plan without writing')
    .option('--overwrite', 'Overwrite existing keys regardless of group; atomic on failure')
    .option('--from-stdin', 'Read JSON (or raw content) from stdin instead of a file')
    .option('--raw', 'Store the file verbatim as ONE key (PEM, .p8, kubeconfig); no JSON parsing')
    .option('--key <name>', 'Key name for the --raw entry (default: derived from the filename)')
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
      Preview the import plan without writing
  $ onenv import apple ./AuthKey_ABC123.p8 --group authkey --raw
      Store a non-JSON file verbatim; run --file authkey:VAR rebuilds it as AuthKey_ABC123.p8
  $ onenv import deckhand ./AuthKey_U76TN79743.p8 --group apns --raw --key APNS_KEY
      Store a .p8 under an explicit key name (what your Justfile/tooling expects)`,
    )
}
