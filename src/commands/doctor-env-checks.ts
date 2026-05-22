import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getTokenCachePath } from '../lib/op-token.js'
import type { Check } from './doctor-types.js'

export async function runEnvChecks(): Promise<Check[]> {
  return [await checkOpBinary(), await checkOpAuth(), checkStateDir(), checkTokenCacheMode()]
}

async function checkOpBinary(): Promise<Check> {
  const result = await runQuiet('op', ['--version'])
  if (result.code === 0) {
    return { name: 'op CLI installed', status: 'ok', detail: result.stdout.trim() }
  }
  return {
    name: 'op CLI installed',
    status: 'error',
    detail: 'op binary not found on PATH',
    hint: 'Install: brew install 1password-cli (macOS) or see https://1password.com/downloads/command-line/',
  }
}

async function checkOpAuth(): Promise<Check> {
  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN
  if (token?.startsWith('ops_')) {
    return {
      name: 'op authenticated',
      status: 'ok',
      detail: 'OP_SERVICE_ACCOUNT_TOKEN resolved to literal token',
    }
  }
  if (token?.startsWith('op://')) {
    return {
      name: 'op authenticated',
      status: 'warn',
      detail: `OP_SERVICE_ACCOUNT_TOKEN is an op:// reference (not yet resolved this run)`,
      hint: 'Run any onenv command once to resolve and cache the token.',
    }
  }
  const whoami = await runQuiet('op', ['whoami'])
  if (whoami.code === 0) {
    return { name: 'op authenticated', status: 'ok', detail: whoami.stdout.trim().split('\n')[0] }
  }
  return {
    name: 'op authenticated',
    status: 'error',
    detail: 'Not signed in to 1Password',
    hint: 'Set OP_SERVICE_ACCOUNT_TOKEN (preferred) or run "op signin".',
  }
}

function checkStateDir(): Check {
  const dir = join(homedir(), '.config', 'onenv-manager')
  if (!existsSync(dir)) {
    return {
      name: 'state directory',
      status: 'skip',
      detail: `${dir} does not exist yet (created on first write)`,
    }
  }
  const mode = statSync(dir).mode & 0o777
  if (mode !== 0o700) {
    return {
      name: 'state directory',
      status: 'warn',
      detail: `${dir} mode is ${mode.toString(8)} (expected 700)`,
      hint: `chmod 700 ${dir}`,
    }
  }
  return { name: 'state directory', status: 'ok', detail: dir }
}

function checkTokenCacheMode(): Check {
  const path = getTokenCachePath()
  if (!existsSync(path)) {
    return {
      name: 'token cache permissions',
      status: 'skip',
      detail: 'no cache file (op:// not used)',
    }
  }
  const mode = statSync(path).mode & 0o777
  if (mode !== 0o600) {
    return {
      name: 'token cache permissions',
      status: 'warn',
      detail: `${path} mode is ${mode.toString(8)} (expected 600)`,
      hint: `chmod 600 ${path}`,
    }
  }
  return { name: 'token cache permissions', status: 'ok', detail: `${path} (mode 600)` }
}

interface QuietResult {
  code: number
  stdout: string
  stderr: string
}

async function runQuiet(cmd: string, args: string[]): Promise<QuietResult> {
  return await new Promise<QuietResult>((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c) => {
      stdout += String(c)
    })
    child.stderr?.on('data', (c) => {
      stderr += String(c)
    })
    child.on('error', () => resolve({ code: 127, stdout, stderr }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}
