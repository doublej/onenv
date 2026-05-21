import type { Command } from 'commander'
import { fingerprint } from '../lib/fingerprint.js'
import { getItemWithMeta, type ItemMeta } from '../lib/onenv-client.js'
import { isJsonMode, output } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'

export interface GetOptions {
  fingerprint?: boolean
  meta?: boolean
}

interface Item extends ItemMeta {
  value: string
}

export async function getAction(
  rawNamespace: string,
  key: string,
  options: GetOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKey = validateKey(key)
  const item = await getItemWithMeta(namespace, safeKey)
  await storeRefs([namespace])
  emit(item, options)
}

function emit(item: Item, options: GetOptions): void {
  if (isJsonMode()) {
    output(buildJson(item, options))
    return
  }
  emitText(item, options)
}

function buildJson(item: Item, options: GetOptions): Record<string, unknown> {
  const principal = options.fingerprint
    ? { fingerprint: fingerprint(item.value) }
    : { value: item.value }
  if (!options.meta) return principal
  return { ...principal, ...pickMeta(item) }
}

function pickMeta(item: Item): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  if (item.group !== undefined) meta.group = item.group
  if (item.path !== undefined) meta.path = item.path
  if (item.type !== undefined) meta.type = item.type
  return meta
}

function emitText(item: Item, options: GetOptions): void {
  if (options.fingerprint) {
    process.stdout.write(`${fingerprint(item.value)}\n`)
  } else if (!options.meta) {
    process.stdout.write(`${item.value}\n`)
  }
  if (options.meta) emitMetaLines(item, options)
}

function emitMetaLines(item: Item, options: GetOptions): void {
  if (!options.fingerprint) process.stdout.write(`value=${item.value}\n`)
  if (item.group !== undefined) process.stdout.write(`group=${item.group}\n`)
  if (item.path !== undefined) process.stdout.write(`path=${item.path}\n`)
  if (item.type !== undefined) process.stdout.write(`type=${item.type}\n`)
}

export function registerGetCommand(program: Command): void {
  program
    .command('get')
    .description('Read a single variable value (use --fingerprint to compare without exposing it)')
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('<key>', 'Variable name')
    .option('--fingerprint', 'Print sha256:<hex> instead of the value')
    .option('--meta', 'Include group/path/type metadata')
    .action(getAction)
}
