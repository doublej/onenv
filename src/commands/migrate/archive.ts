import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ArchivePlan } from './plan-types.js'

const GITIGNORE_MARKER = '/.onenv-archive/'

export interface ArchiveResult {
  archived: string[]
  archive_dir_absolute: string
  gitignore_updated: boolean
}

export function archiveFiles(cwd: string, plan: ArchivePlan): ArchiveResult {
  if (plan.files.length === 0) {
    return { archived: [], archive_dir_absolute: '', gitignore_updated: false }
  }
  const absDir = resolve(cwd, plan.dir)
  mkdirSync(absDir, { recursive: true, mode: 0o700 })
  const archived: string[] = []
  for (const file of plan.files) {
    const src = resolve(cwd, file)
    if (!existsSync(src)) continue
    const dst = join(absDir, file)
    mkdirSync(dirname(dst), { recursive: true })
    renameSync(src, dst)
    archived.push(file)
  }
  return {
    archived,
    archive_dir_absolute: absDir,
    gitignore_updated: ensureGitignore(cwd),
  }
}

function ensureGitignore(cwd: string): boolean {
  const gitDir = resolve(cwd, '.git')
  if (!existsSync(gitDir)) return false
  const path = resolve(cwd, '.gitignore')
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  if (existing.split(/\r?\n/).some((line) => line.trim() === GITIGNORE_MARKER)) return false
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  appendFileSync(
    path,
    `${sep}\n# onenv: env files archived during migration\n${GITIGNORE_MARKER}\n`,
  )
  return true
}
