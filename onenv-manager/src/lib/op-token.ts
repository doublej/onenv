import { spawn } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

function getConfigRoot(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

export function getTokenCachePath(): string {
  return join(getConfigRoot(), 'onenv-manager', 'op-token')
}

export async function ensureServiceAccountToken(): Promise<void> {
  const raw = process.env.OP_SERVICE_ACCOUNT_TOKEN
  if (!raw || !raw.startsWith('op://')) return

  const cached = await readCache()
  if (cached) {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = cached
    return
  }

  const resolved = await opRead(raw)
  process.env.OP_SERVICE_ACCOUNT_TOKEN = resolved
  await writeCache(resolved)
}

export async function clearTokenCache(): Promise<void> {
  await writeCache('')
}

async function readCache(): Promise<string | null> {
  try {
    const raw = (await readFile(getTokenCachePath(), 'utf-8')).trim()
    return raw.startsWith('ops_') ? raw : null
  } catch {
    return null
  }
}

async function writeCache(value: string): Promise<void> {
  const path = getTokenCachePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value, 'utf-8')
  await chmod(path, 0o600)
}

async function opRead(reference: string): Promise<string> {
  const { OP_SERVICE_ACCOUNT_TOKEN: _omit, ...env } = process.env
  return await new Promise((resolve, reject) => {
    const child = spawn('op', ['read', reference], { stdio: ['pipe', 'pipe', 'pipe'], env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`op read ${reference} failed: ${stderr.trim()}`))
        return
      }
      resolve(stdout.trimEnd())
    })
    child.stdin.end()
  })
}
