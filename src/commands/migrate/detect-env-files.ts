import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseEnvFile } from './parse-env.js'
import type { ParsedEnvEntry } from './types.js'

// Internal type carrying raw values for plan/apply phases. Scan never
// exposes this externally — it projects to EnvFile (values stripped).
export interface RawEnvFile {
  path: string
  relative: string
  tracked: boolean
  entries: ParsedEnvEntry[]
}

const ENV_FILE_PATTERN = /^\.env(\..+)?$/

export async function detectEnvFiles(cwd: string): Promise<RawEnvFile[]> {
  const names = listEnvFileNames(cwd)
  const tracked = await listTracked(cwd)
  return names.map((name) => ({
    path: join(cwd, name),
    relative: relative(cwd, join(cwd, name)) || name,
    tracked: tracked.has(name),
    entries: parseEnvFile(readFileSync(join(cwd, name), 'utf-8')),
  }))
}

function listEnvFileNames(cwd: string): string[] {
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((entry) => entry.isFile() && ENV_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

async function listTracked(cwd: string): Promise<Set<string>> {
  if (!existsSync(join(cwd, '.git'))) return new Set()
  return await new Promise<Set<string>>((resolve) => {
    const child = spawn('git', ['ls-files'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (c) => {
      out += String(c)
    })
    child.on('error', () => resolve(new Set()))
    child.on('close', () => resolve(new Set(out.split('\n').filter(Boolean))))
  })
}
