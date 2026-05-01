import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliError, opError } from './errors.js'

const ONENV_VAULT = process.env.ONENV_VAULT ?? 'onenv'
const ONENV_CATEGORY = process.env.ONENV_CATEGORY ?? 'API Credential'

interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

async function execOp(args: string[]): Promise<ExecResult> {
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

    child.stdin.end()
  })
}

async function runOp(args: string[]): Promise<string> {
  const result = await execOp(args)
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
  const matched: { id: string; key: string }[] = []
  for (const item of items) {
    const parsed = parseTitle(item.title)
    if (parsed?.namespace === namespace) matched.push({ id: item.id, key: parsed.key })
  }
  if (matched.length === 0) return {}

  const sep = `<<ONENV_SEP_${randomBytes(8).toString('hex')}>>`
  const template = `${matched
    .map(({ id, key }) => `${sep}${key}${sep}{{ op://${ONENV_VAULT}/${id}/credential }}`)
    .join('\n')}\n`

  const output = await runOpInject(template)
  return parseInject(output, sep)
}

function parseInject(output: string, sep: string): Record<string, string> {
  const result: Record<string, string> = {}
  const parts = output.split(sep)
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const key = parts[i]
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

export async function setValue(namespace: string, key: string, value: string): Promise<void> {
  const title = `${namespace}/${key}`
  const expires = expiresIn90Days()
  const check = await execOp(['item', 'get', title, '--vault', ONENV_VAULT, '--format', 'json'])

  if (check.code === 0) {
    await runOp([
      'item',
      'edit',
      title,
      '--vault',
      ONENV_VAULT,
      `credential=${value}`,
      `expires=${expires}`,
    ])
    return
  }

  await runOp([
    'item',
    'create',
    '--vault',
    ONENV_VAULT,
    '--category',
    ONENV_CATEGORY,
    '--title',
    title,
    '--tags',
    namespace,
    `credential=${value}`,
    `expires=${expires}`,
  ])
}

export async function unsetValue(namespace: string, key: string): Promise<void> {
  await runOp(['item', 'delete', `${namespace}/${key}`, '--vault', ONENV_VAULT])
}
