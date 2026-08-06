import type { Command } from 'commander'
import { validationError } from '../lib/errors.js'
import { type ExternalItem, getExternalItem } from '../lib/external-item.js'
import { setValue } from '../lib/onenv-client.js'
import { output, success } from '../lib/output.js'
import { confirmMutation } from '../lib/permission.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { fetchSnapshot, rollback } from './_snapshot.js'

export interface ExplodeOptions {
  vault?: string
  prefix?: string
  dryRun?: boolean
  overwrite?: boolean
}

export interface ExplodePlanRow {
  key: string
  field: string
  type: string
}

export interface PlanEntry extends ExplodePlanRow {
  value: string
}

/** The <ITEM> part of the default <ITEM>_<FIELD> key naming. */
export function deriveItemPrefix(title: string): string {
  return deriveKey(title, '')
}

/**
 * Turn a fetched item into the list of keys it would produce. Keys are
 * <ITEM>_<FIELD> by default so several exploded items can share a namespace;
 * an explicit prefix overrides the item part ("" drops it entirely).
 */
export function buildExplodePlan(item: ExternalItem, prefix?: string): PlanEntry[] {
  const entries = planEntries(item, prefix ?? deriveItemPrefix(item.title))
  if (entries.length === 0) {
    throw validationError(
      `Item "${item.title}" has no usable fields`,
      'Only non-empty fields and the primary URL are exploded; notes are skipped',
    )
  }
  return entries
}

export interface WritePlanOptions {
  itemTitle: string
  overwrite?: boolean
  onProgress?: (key: string, index: number, total: number) => void
}

/**
 * Write a plan. Same atomicity contract as import: either every key ends up
 * with the new value, or every touched key is restored on failure.
 */
export async function writeExplodePlan(
  namespace: string,
  entries: PlanEntry[],
  opts: WritePlanOptions,
): Promise<void> {
  const snapshot = await fetchSnapshot(
    namespace,
    entries.map((e) => e.key),
  )
  if (!opts.overwrite) {
    const existing = snapshot.filter((s) => s.existed).map((s) => `${namespace}/${s.key}`)
    if (existing.length > 0) {
      throw validationError(
        `Key(s) already exist: ${existing.join(', ')}`,
        'Use --prefix to disambiguate or pass --overwrite to replace them',
      )
    }
  }

  await confirmMutation({
    action: 'explode',
    namespace,
    details: `item=${opts.itemTitle} keys=${entries.length}`,
  })

  const written: string[] = []
  try {
    for (const [index, entry] of entries.entries()) {
      opts.onProgress?.(entry.key, index, entries.length)
      await setValue(namespace, entry.key, entry.value)
      written.push(entry.key)
    }
  } catch (err) {
    await rollback(namespace, snapshot, written, err, 'explode')
    throw err
  }
}

export async function explodeItem(
  namespace: string,
  itemRef: string,
  opts: ExplodeOptions,
): Promise<{ item: string; rows: ExplodePlanRow[] }> {
  const item = await getExternalItem(itemRef, opts.vault)
  const entries = buildExplodePlan(item, opts.prefix)
  const rows = entries.map(({ key, field, type }) => ({ key, field, type }))
  if (opts.dryRun) return { item: item.title, rows }

  await writeExplodePlan(namespace, entries, {
    itemTitle: item.title,
    overwrite: opts.overwrite,
  })
  return { item: item.title, rows }
}

function planEntries(item: ExternalItem, prefix: string): PlanEntry[] {
  const entries: PlanEntry[] = []
  for (const field of item.fields) {
    if (!field.value) continue
    if (field.purpose === 'NOTES') continue
    const label = field.label ?? field.id
    if (!label.trim()) continue
    entries.push({
      key: validateKey(deriveKey(label, prefix)),
      field: label,
      type: field.type,
      value: field.value,
    })
  }
  if (item.primaryUrl) {
    entries.push({
      key: validateKey(deriveKey('URL', prefix)),
      field: 'primary url',
      type: 'URL',
      value: item.primaryUrl,
    })
  }
  assertNoCollisions(entries)
  return entries
}

function deriveKey(label: string, prefix: string): string {
  let raw = label
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  if (/^[0-9]/.test(raw)) raw = `_${raw}`
  const key = raw || 'FIELD'
  return prefix ? `${prefix}_${key}` : key
}

function assertNoCollisions(entries: PlanEntry[]): void {
  const map = new Map<string, string[]>()
  for (const e of entries) {
    const arr = map.get(e.key) ?? []
    arr.push(e.field)
    map.set(e.key, arr)
  }
  const dupes = [...map.entries()].filter(([, fields]) => fields.length > 1)
  if (dupes.length === 0) return
  const detail = dupes.map(([k, fields]) => `  ${k}: ${fields.join(', ')}`).join('\n')
  throw validationError(
    `Key collisions detected:\n${detail}`,
    'Rename the duplicate field labels in 1Password',
  )
}

interface ExplodeCliOptions {
  vault?: string
  prefix?: string
  dryRun?: boolean
  overwrite?: boolean
  interactive?: boolean
}

async function explodeAction(
  rawNamespace: string | undefined,
  itemRef: string | undefined,
  options: ExplodeCliOptions,
): Promise<void> {
  if (options.interactive || !itemRef) {
    await runInteractiveExplode(rawNamespace, itemRef, options)
    return
  }
  const namespace = validateNamespace(await resolveRef(rawNamespace as string))
  const result = await explodeItem(namespace, itemRef, options)
  await storeRefs([namespace])
  if (options.dryRun) {
    output({ namespace, item: result.item, plan: result.rows })
    return
  }
  success(`Exploded "${result.item}" into ${result.rows.length} keys in ${namespace}`, {
    namespace,
    item: result.item,
    keys: result.rows.map((r) => r.key),
  })
}

/**
 * Guided flow for humans: fuzzy-pick the item, preview the plan, then write.
 * Loaded lazily so the scriptable path never pays for the prompt library.
 */
async function runInteractiveExplode(
  rawNamespace: string | undefined,
  itemRef: string | undefined,
  options: ExplodeCliOptions,
): Promise<void> {
  if (itemRef) {
    throw validationError(
      '--interactive does not take an <item> argument',
      'Run "onenv explode [namespace]" to pick the item interactively, or drop --interactive',
    )
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw validationError(
      'onenv explode requires <namespace> and <item> when not attached to a terminal',
      'Non-interactive usage: onenv explode <namespace> <item> [--vault <name>] [--prefix <s>]',
    )
  }
  const namespace = rawNamespace ? validateNamespace(await resolveRef(rawNamespace)) : undefined
  const { runExplodeTui } = await import('./explode-tui.js')
  await runExplodeTui({ vault: options.vault, namespace })
}

export function registerExplodeCommand(program: Command): void {
  program
    .command('explode')
    .description('Explode a regular 1Password item (e.g. a Login) into namespace keys')
    .argument('[namespace]', 'Target namespace (supports @refs); omit for the interactive picker')
    .argument('[item]', 'Source item title or ID (any vault your op auth can see)')
    .option('-i, --interactive', 'Force the guided TUI (fuzzy item search + plan preview)')
    .option('--vault <name>', 'Vault holding the source item (default: search all vaults)')
    .option(
      '-p, --prefix <prefix>',
      'Key prefix (default: sluggified item title; pass "" for none)',
    )
    .option('--dry-run', 'Print the explode plan without writing')
    .option('--overwrite', 'Overwrite existing keys; atomic rollback on failure')
    .action(explodeAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv explode
      Guided TUI: fuzzy-search your 1Password items, pick a target namespace,
      preview the keys, then write them (TTY only)
  $ onenv explode shazamap
      Same TUI, with the target namespace already fixed
  $ onenv explode shazamap "AppleID" --vault Personal
      Copy the "AppleID" login's fields into the shazamap namespace as
      APPLEID_USERNAME, APPLEID_PASSWORD, APPLEID_URL, ...
  $ onenv explode shazamap "AppleID" --dry-run
      Preview which keys would be created, without writing
  $ onenv explode shazamap "AppleID" --prefix APPLE --overwrite
      Write APPLE_USERNAME, APPLE_PASSWORD, ... replacing existing keys
  $ onenv explode shazamap "AppleID" --prefix ""
      Bare keys without the item prefix: USERNAME, PASSWORD, ...

Note: the source item is read with YOUR 1Password auth (desktop-app
integration / op signin) — the onenv service-account token is ignored for
this read, since that account only sees the onenv vault. Run this once
yourself; afterwards agents see the namespace like any other.`,
    )
}
