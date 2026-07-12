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

interface PlanEntry extends ExplodePlanRow {
  value: string
}

/**
 * Explode a regular 1Password item (e.g. a website Login) into managed
 * namespace keys. Same atomicity contract as import: either every key ends
 * up with the new value, or every touched key is restored on failure.
 */
export async function explodeItem(
  namespace: string,
  itemRef: string,
  opts: ExplodeOptions,
): Promise<{ item: string; rows: ExplodePlanRow[] }> {
  const item = await getExternalItem(itemRef, opts.vault)
  const entries = planEntries(item, opts.prefix ?? '')
  if (entries.length === 0) {
    throw validationError(
      `Item "${item.title}" has no usable fields`,
      'Only non-empty fields and the primary URL are exploded; notes are skipped',
    )
  }
  const rows = entries.map(({ key, field, type }) => ({ key, field, type }))
  if (opts.dryRun) return { item: item.title, rows }

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
    details: `item=${item.title} keys=${entries.length}`,
  })

  const written: string[] = []
  try {
    for (const entry of entries) {
      await setValue(namespace, entry.key, entry.value)
      written.push(entry.key)
    }
  } catch (err) {
    await rollback(namespace, snapshot, written, err, 'explode')
    throw err
  }
  return { item: item.title, rows }
}

function planEntries(item: ExternalItem, prefix: string): PlanEntry[] {
  const entries: PlanEntry[] = []
  for (const field of item.fields) {
    if (!field.value) continue
    if (field.purpose === 'NOTES') continue
    const label = field.label ?? field.id
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
}

async function explodeAction(
  rawNamespace: string,
  itemRef: string,
  options: ExplodeCliOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
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

export function registerExplodeCommand(program: Command): void {
  program
    .command('explode')
    .description('Explode a regular 1Password item (e.g. a Login) into namespace keys')
    .argument('<namespace>', 'Target namespace (supports @refs)')
    .argument('<item>', 'Source item title or ID (any vault your op auth can see)')
    .option('--vault <name>', 'Vault holding the source item (default: search all vaults)')
    .option('-p, --prefix <prefix>', 'Prefix prepended to every derived key')
    .option('--dry-run', 'Print the explode plan without writing')
    .option('--overwrite', 'Overwrite existing keys; atomic rollback on failure')
    .action(explodeAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv explode github "GitHub" --vault Private
      Copy the "GitHub" login's fields into the github namespace
      (username → USERNAME, password → PASSWORD, primary website → URL)
  $ onenv explode github "GitHub" --dry-run
      Preview which keys would be created, without writing
  $ onenv explode github "GitHub" --prefix GH --overwrite
      Write GH_USERNAME, GH_PASSWORD, ... replacing existing keys

Note: the source item is read with YOUR 1Password auth (desktop-app
integration / op signin) — the onenv service-account token is ignored for
this read, since that account only sees the onenv vault. Run this once
yourself; afterwards agents see the namespace like any other.`,
    )
}
