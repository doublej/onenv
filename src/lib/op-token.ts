import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'

function getConfigRoot(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

export function getTokenCachePath(): string {
  return join(getConfigRoot(), 'onenv-manager', 'op-token')
}

export async function ensureServiceAccountToken(): Promise<void> {
  const raw = process.env.OP_SERVICE_ACCOUNT_TOKEN

  // A literal ops_ token is already in the env — op will use it directly.
  if (raw && !raw.startsWith('op://')) return

  // Env is either unset or an op:// reference. Prefer the cached literal so
  // onenv stays headless even in env-less contexts (agents, subshells, cron)
  // where a shell-profile export isn't present. The cache is the durable
  // source of truth; a stale entry self-heals via clearTokenCache on auth
  // failure (see onenv-client.ts).
  const cached = await readCache()
  if (cached) {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = cached
    return
  }

  // No cache. Only an op:// reference lets us resolve one; unset means the
  // user has never authenticated, so fall through to interactive op.
  if (!raw?.startsWith('op://')) return

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
  await atomicWriteFile(path, value)
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
