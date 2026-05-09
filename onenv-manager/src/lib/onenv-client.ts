import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliError, opError } from './errors.js'
import { clearTokenCache } from './op-token.js'
import type { JsonLeafType } from './types.js'

const ONENV_VAULT = process.env.ONENV_VAULT ?? 'onenv'
const ONENV_CATEGORY = process.env.ONENV_CATEGORY ?? 'API Credential'

interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

async function execOp(args: string[], stdin?: string): Promise<ExecResult> {
  const result = await spawnOp(args, stdin)
  if (result.code !== 0) await invalidateCacheOnAuthFailure(result.stderr)
  return result
}

async function spawnOp(args: string[], stdin?: string): Promise<ExecResult> {
  return await new Promise<ExecResult>((resolve, reject) => {
    const child = spawn('op', args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      reject(
        new CliError(
          'OP_SPAWN',
          `Failed to start op CLI: ${error.message}`,
          'internal',
          'Is the 1Password CLI installed? brew install 1password-cli',
        ),
      )
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })

    child.stdin.end(stdin ?? '')
  })
}

async function invalidateCacheOnAuthFailure(stderr: string): Promise<void> {
  const lower = stderr.toLowerCase()
  const isAuth =
    lower.includes('service account') &&
    (lower.includes('invalid') || lower.includes('unauthorized') || lower.includes('expired'))
  if (isAuth) await clearTokenCache()
}

async function runOp(args: string[], stdin?: string): Promise<string> {
  const result = await execOp(args, stdin)
  if (result.code !== 0) {
    throw opError(result.stderr || result.stdout, args)
  }
  return result.stdout
}

async function runOpInject(template: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'onenv-inject-'))
  const file = join(dir, 'template')
  writeFileSync(file, template)
  try {
    return await runOp(['inject', '-i', file])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

interface OpItem {
  id: string
  title: string
  tags?: string[]
}

function parseTitle(title: string): { namespace: string; key: string } | null {
  const sep = title.indexOf('/')
  if (sep <= 0) return null
  return { namespace: title.slice(0, sep), key: title.slice(sep + 1) }
}

async function listItems(tags?: string): Promise<OpItem[]> {
  const args = [
    'item',
    'list',
    '--vault',
    ONENV_VAULT,
    '--categories',
    ONENV_CATEGORY,
    '--format',
    'json',
  ]
  if (tags) args.push('--tags', tags)

  const result = await execOp(args)
  if (result.code !== 0 && result.stderr.includes('no items found')) return []
  if (result.code !== 0) {
    throw opError(result.stderr, args)
  }

  const raw = result.stdout.trim()
  if (!raw || raw === '[]') return []
  return JSON.parse(raw) as OpItem[]
}

export async function listNamespaces(): Promise<string[]> {
  const items = await listItems()
  const namespaces = new Set(
    items.map((i) => parseTitle(i.title)?.namespace).filter(Boolean) as string[],
  )
  return [...namespaces].sort()
}

export async function listKeys(namespace: string): Promise<string[]> {
  const items = await listItems(namespace)
  const keys: string[] = []
  for (const item of items) {
    const parsed = parseTitle(item.title)
    if (parsed?.namespace === namespace) keys.push(parsed.key)
  }
  return keys.sort()
}

export async function listValues(namespace: string): Promise<Record<string, string>> {
  const items = await listItems(namespace)
  const matched: { id: string; key: string; index: number }[] = []
  for (const item of items) {
    const parsed = parseTitle(item.title)
    if (parsed?.namespace === namespace) {
      matched.push({ id: item.id, key: parsed.key, index: matched.length })
    }
  }
  if (matched.length === 0) return {}

  const sep = `<<ONENV_SEP_${randomBytes(8).toString('hex')}>>`
  const template = `${matched
    .map(({ id, index }) => `${sep}${index}${sep}{{ op://${ONENV_VAULT}/${id}/credential }}`)
    .join('\n')}\n`

  const output = await runOpInject(template)
  return parseInject(
    output,
    sep,
    matched.map(({ key }) => key),
  )
}

function parseInject(output: string, sep: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  const parts = output.split(sep)
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const index = Number.parseInt(parts[i], 10)
    const key = Number.isInteger(index) ? keys[index] : undefined
    if (!key) continue
    let value = parts[i + 1]
    if (value.endsWith('\n')) value = value.slice(0, -1)
    result[key] = value
  }
  return result
}

function expiresIn90Days(): string {
  const date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

interface OpField {
  id: string
  type: string
  value: string
  label?: string
  purpose?: string
}

interface OpItemDetail {
  fields?: OpField[]
  [key: string]: unknown
}

function upsertField(item: OpItemDetail, id: string, type: string, value: string): void {
  if (!item.fields) item.fields = []
  const existing = item.fields.find((f) => f.id === id)
  if (existing) {
    existing.value = value
    existing.type = type
    return
  }
  item.fields.push({ id, type, value, label: id })
}

export interface ItemMeta {
  group?: string
  path?: string
  type?: JsonLeafType
}

export interface ItemSummary {
  key: string
  group?: string
  path?: string
  type?: JsonLeafType
}

export interface GroupEntry {
  key: string
  value: string
  path: string
  type: JsonLeafType
}

const META_FIELD_IDS: Array<keyof ItemMeta> = ['group', 'path', 'type']
const PARALLEL_OP_LIMIT = 10

export async function setValue(namespace: string, key: string, value: string): Promise<void> {
  await setValueWithMeta(namespace, key, value, {})
}

export async function setValueWithMeta(
  namespace: string,
  key: string,
  value: string,
  meta: ItemMeta,
): Promise<void> {
  const title = `${namespace}/${key}`
  const expires = expiresIn90Days()
  const check = await execOp(['item', 'get', title, '--vault', ONENV_VAULT, '--format', 'json'])

  if (check.code === 0) {
    const item = JSON.parse(check.stdout) as OpItemDetail
    upsertField(item, 'credential', 'CONCEALED', value)
    upsertField(item, 'expires', 'DATE', expires)
    applyMetaFields(item, meta)
    await runOp(['item', 'edit', title, '--vault', ONENV_VAULT], JSON.stringify(item))
    return
  }

  const template: OpItemDetail = {
    title,
    category: 'API_CREDENTIAL',
    vault: { name: ONENV_VAULT },
    tags: [namespace],
    fields: [
      { id: 'credential', type: 'CONCEALED', value, label: 'credential' },
      { id: 'expires', type: 'DATE', value: expires, label: 'expires' },
    ],
  }
  applyMetaFields(template, meta)
  // op 2.24+ silently ignores the stdin template when `-` and `--category` are
  // both passed (creates an empty default item). Drop `--category` and keep
  // the `-` sentinel so op reads stdin; the template carries the category.
  await runOp(['item', 'create', '-', '--vault', ONENV_VAULT], JSON.stringify(template))
}

function applyMetaFields(item: OpItemDetail, meta: ItemMeta): void {
  for (const id of META_FIELD_IDS) {
    const v = meta[id]
    if (v !== undefined) upsertField(item, id, 'STRING', v)
  }
}

export async function getItemWithMeta(
  namespace: string,
  key: string,
): Promise<{ value: string } & ItemMeta> {
  const title = `${namespace}/${key}`
  const raw = await runOp(['item', 'get', title, '--vault', ONENV_VAULT, '--format', 'json'])
  const item = JSON.parse(raw) as OpItemDetail
  return readMetaFromItem(item)
}

function readMetaFromItem(item: OpItemDetail): { value: string } & ItemMeta {
  const fields = item.fields ?? []
  const find = (id: string) => fields.find((f) => f.id === id)?.value
  const value = find('credential') ?? ''
  const group = find('group')
  const path = find('path')
  const typeRaw = find('type')
  const type = typeRaw === undefined ? undefined : (typeRaw as JsonLeafType)
  return { value, group, path, type }
}

type FullItem = { key: string; value: string } & ItemMeta

async function fetchAllItems(namespace: string): Promise<FullItem[]> {
  const keys = await listKeys(namespace)
  return await mapWithLimit(keys, PARALLEL_OP_LIMIT, async (key) => ({
    key,
    ...(await getItemWithMeta(namespace, key)),
  }))
}

export async function listItemsWithMeta(namespace: string): Promise<ItemSummary[]> {
  const all = await fetchAllItems(namespace)
  return all
    .map(({ key, group, path, type }) => ({ key, group, path, type }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export async function listGroupEntries(namespace: string, group: string): Promise<GroupEntry[]> {
  const all = await fetchAllItems(namespace)
  return all
    .filter(
      (e): e is FullItem & { path: string; type: JsonLeafType } =>
        e.group === group && e.path !== undefined && e.type !== undefined,
    )
    .map(({ key, value, path, type }) => ({ key, value, path, type }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

async function mapWithLimit<I, O>(
  items: I[],
  limit: number,
  fn: (i: I) => Promise<O>,
): Promise<O[]> {
  const out: O[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out.push(await fn(items[i]))
    }
  })
  await Promise.all(workers)
  return out
}

export async function unsetValue(namespace: string, key: string): Promise<void> {
  await runOp(['item', 'delete', `${namespace}/${key}`, '--vault', ONENV_VAULT])
}
