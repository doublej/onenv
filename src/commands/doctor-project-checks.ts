import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectMarker } from '../lib/project-marker.js'
import type { Check } from './doctor-types.js'

export async function runProjectChecks(
  cwd: string,
  marker: ProjectMarker | null,
): Promise<Check[]> {
  if (!marker) {
    return [
      {
        name: 'project marker',
        status: 'skip',
        detail: `${cwd} has no package.json / pyproject.toml / Cargo.toml / go.mod / .git — skipping project checks`,
      },
    ]
  }
  const config = checkProjectConfig(cwd)
  return [
    config,
    checkEnvFiles(cwd, config.status === 'ok'),
    await checkTrackedEnvFiles(cwd, marker),
  ]
}

function checkProjectConfig(cwd: string): Check {
  const path = join(cwd, '.onenv.json')
  if (!existsSync(path)) {
    return {
      name: '.onenv.json',
      status: 'skip',
      detail: 'no .onenv.json — project not yet using onenv',
      hint: 'Run "onenv migrate scan" to inspect existing secrets.',
    }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(parsed.namespaces) || parsed.namespaces.length === 0) {
      return {
        name: '.onenv.json',
        status: 'error',
        detail: 'namespaces field must be a non-empty array',
        hint: 'Re-run "onenv init" or hand-edit the file.',
      }
    }
    return {
      name: '.onenv.json',
      status: 'ok',
      detail: `references ${parsed.namespaces.length} namespace(s): ${parsed.namespaces.join(', ')}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { name: '.onenv.json', status: 'error', detail: `parse error: ${msg}` }
  }
}

const ENV_FILE_PATTERN = /^\.env(\..+)?$/

function checkEnvFiles(cwd: string, onenvConfigPresent: boolean): Check {
  const found = findEnvFiles(cwd)
  if (found.length === 0) {
    return { name: 'env files in cwd', status: 'ok', detail: 'no .env* files in project root' }
  }
  if (!onenvConfigPresent) {
    return {
      name: 'env files in cwd',
      status: 'skip',
      detail: `found ${found.length} env file(s): ${found.join(', ')}`,
      hint: 'Run "onenv migrate scan" to inspect them.',
    }
  }
  return {
    name: 'env files in cwd',
    status: 'warn',
    detail: `${found.length} env file(s) present alongside .onenv.json: ${found.join(', ')}`,
    hint: 'After migration, env files should be archived. Run "onenv migrate scan" for details.',
  }
}

function findEnvFiles(cwd: string): string[] {
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((entry) => entry.isFile() && ENV_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

async function checkTrackedEnvFiles(cwd: string, marker: ProjectMarker): Promise<Check> {
  if (!isGitProject(cwd, marker)) {
    return { name: 'git-tracked env files', status: 'skip', detail: 'not a git project' }
  }
  const tracked = await listTracked(cwd)
  const envTracked = tracked.filter((p) => ENV_FILE_PATTERN.test(p.split('/').pop() ?? ''))
  if (envTracked.length === 0) {
    return { name: 'git-tracked env files', status: 'ok', detail: 'no env files in git index' }
  }
  return {
    name: 'git-tracked env files',
    status: 'error',
    detail: `${envTracked.length} env file(s) tracked: ${envTracked.join(', ')}`,
    hint: 'If these contain real secrets, rotate them — git history retains them. Then "git rm --cached <file>" and add to .gitignore.',
  }
}

function isGitProject(cwd: string, marker: ProjectMarker): boolean {
  if (marker.kind === 'git') return true
  return existsSync(join(cwd, '.git'))
}

async function listTracked(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolve) => {
    const child = spawn('git', ['ls-files'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (c) => {
      out += String(c)
    })
    child.on('error', () => resolve([]))
    child.on('close', () => resolve(out.split('\n').filter(Boolean)))
  })
}
