#!/usr/bin/env bun
/**
 * Release harness.
 *
 *   bun run scripts/release.ts patch                  bump patch, draft changelog, commit, tag
 *   bun run scripts/release.ts minor --yes            skip the editor pause
 *   bun run scripts/release.ts 0.7.0 --dry-run        print actions, change nothing
 *   bun run scripts/release.ts patch --no-push-hint   silence the next-steps tip
 *
 * What it does:
 *   1. Verifies the working tree is clean and you're on `main`.
 *   2. Discovers every CLI package.json in the repo (root + immediate subdirs,
 *      skipping `docs/`) and bumps `version`.
 *   3. Builds each package whose dir has a `bun run build` script (keeps the
 *      pre-commit dist-fresh hook happy).
 *   4. Drafts a CHANGELOG block from `git log <last-tag>..HEAD` grouped by
 *      conventional-commit type. Prepends it to `CHANGELOG.md` and to each
 *      package's own `CHANGELOG.md` if present.
 *   5. Optionally opens `$EDITOR` so you can rewrite the draft to taste.
 *   6. Commits the bumps + changelog and tags `v<new-version>`.
 *   7. Prints next-steps. Does NOT push.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dir, '..')
const SKIP_DIRS = new Set(['docs', 'node_modules', '.git', '.svelte-kit', 'dist', 'build', 'scripts'])

interface Pkg {
  path: string
  json: Record<string, unknown>
  hasBuild: boolean
  changelogPath: string | null
}

function sh(cmd: string, args: string[], cwd = REPO): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function die(msg: string): never {
  process.stderr.write(`release: ${msg}\n`)
  process.exit(1)
}

function parseArgs(argv: string[]): {
  bumpOrVersion: string
  yes: boolean
  dryRun: boolean
  noPushHint: boolean
} {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  if (positional.length !== 1)
    die('expected one of: patch | minor | major | <X.Y.Z>')
  return {
    bumpOrVersion: positional[0],
    yes: flags.has('--yes') || flags.has('-y'),
    dryRun: flags.has('--dry-run'),
    noPushHint: flags.has('--no-push-hint'),
  }
}

function discoverPackages(): Pkg[] {
  const out: Pkg[] = []
  const rootPkg = join(REPO, 'package.json')
  if (existsSync(rootPkg)) out.push(loadPkg(rootPkg))
  for (const entry of readdirSync(REPO)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const dir = join(REPO, entry)
    if (!statSync(dir).isDirectory()) continue
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) out.push(loadPkg(pkg))
  }
  if (out.length === 0) die('found no package.json to bump')
  return out
}

function loadPkg(path: string): Pkg {
  const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const scripts = (json.scripts ?? {}) as Record<string, string>
  const dir = path.slice(0, -'/package.json'.length)
  const changelog = join(dir, 'CHANGELOG.md')
  return {
    path,
    json,
    hasBuild: typeof scripts.build === 'string',
    changelogPath: existsSync(changelog) ? changelog : null,
  }
}

function nextVersion(current: string, bump: string): string {
  if (/^\d+\.\d+\.\d+/.test(bump)) return bump
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) die(`current version "${current}" is not semver`)
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (bump === 'major') return `${maj + 1}.0.0`
  if (bump === 'minor') return `${maj}.${min + 1}.0`
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`
  die(`unknown bump "${bump}"`)
}

function ensureClean(): void {
  const status = sh('git', ['status', '--porcelain'])
  if (status.stdout.trim().length > 0)
    die('working tree is dirty — commit or stash first')
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()
  if (branch !== 'main') die(`expected branch "main", got "${branch}"`)
}

function lastTag(): string | null {
  const r = sh('git', ['describe', '--tags', '--abbrev=0'])
  return r.code === 0 ? r.stdout.trim() : null
}

interface CommitEntry {
  hash: string
  type: string
  scope: string
  subject: string
}

function commitsSince(tag: string | null): CommitEntry[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const r = sh('git', ['log', range, '--no-merges', '--format=%h %s'])
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => parseCommit(line))
    .filter((c): c is CommitEntry => c !== null)
}

function parseCommit(line: string): CommitEntry | null {
  const spaceIdx = line.indexOf(' ')
  if (spaceIdx < 0) return null
  const hash = line.slice(0, spaceIdx)
  const rest = line.slice(spaceIdx + 1)
  const m = rest.match(/^(\w+)(?:\(([^)]+)\))?(!?):\s*(.+)$/)
  if (m) return { hash, type: m[1], scope: m[2] ?? '', subject: m[4] }
  return { hash, type: 'other', scope: '', subject: rest }
}

const TYPE_ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore', 'test', 'build', 'other']
const TYPE_HEADER: Record<string, string> = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Performance',
  refactor: 'Changed',
  docs: 'Docs',
  chore: 'Chore',
  test: 'Tests',
  build: 'Build',
  other: 'Other',
}

function draftChangelog(version: string, commits: CommitEntry[]): string {
  const today = new Date().toISOString().slice(0, 10)
  const buckets = new Map<string, CommitEntry[]>()
  for (const c of commits) {
    const k = TYPE_ORDER.includes(c.type) ? c.type : 'other'
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)?.push(c)
  }
  const lines = [`## ${version} — ${today}`, '']
  for (const type of TYPE_ORDER) {
    const list = buckets.get(type)
    if (!list || list.length === 0) continue
    lines.push(`### ${TYPE_HEADER[type]}`, '')
    for (const c of list) {
      const scope = c.scope ? `**${c.scope}**: ` : ''
      lines.push(`- ${scope}${c.subject} (${c.hash})`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function prependChangelog(path: string, block: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '# Changelog\n\n'
  const headerEnd = existing.indexOf('\n\n')
  const header = headerEnd >= 0 ? existing.slice(0, headerEnd + 2) : '# Changelog\n\n'
  const body = headerEnd >= 0 ? existing.slice(headerEnd + 2) : existing
  writeFileSync(path, `${header}${block}\n${body}`)
}

function bumpPackage(pkg: Pkg, version: string): void {
  pkg.json.version = version
  writeFileSync(pkg.path, `${JSON.stringify(pkg.json, null, 2)}\n`)
}

function buildIfNeeded(pkg: Pkg, dryRun: boolean): void {
  if (!pkg.hasBuild) return
  const dir = pkg.path.slice(0, -'/package.json'.length)
  process.stderr.write(`→ bun run build (${shortPath(dir)})\n`)
  if (dryRun) return
  const r = sh('bun', ['run', 'build'], dir)
  if (r.code !== 0) die(`build failed in ${dir}\n${r.stderr || r.stdout}`)
}

function shortPath(p: string): string {
  return p.startsWith(REPO) ? p.slice(REPO.length + 1) || '.' : p
}

function openEditorOn(paths: string[]): void {
  const editor = process.env.EDITOR
  if (!editor) {
    process.stderr.write('→ EDITOR not set, skipping interactive polish\n')
    return
  }
  process.stderr.write(`→ ${editor} ${paths.map(shortPath).join(' ')}\n`)
  const r = spawnSync(editor, paths, { stdio: 'inherit' })
  if (r.status !== 0) die('editor exited non-zero — aborting release')
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.dryRun) ensureClean()
  const packages = discoverPackages()
  const currentVersion = String(packages[0].json.version ?? '0.0.0')
  const newVersion = nextVersion(currentVersion, args.bumpOrVersion)
  const tag = lastTag()
  process.stderr.write(
    `release: bumping ${packages.length} package(s) ${currentVersion} → ${newVersion} (since ${tag ?? 'repo start'})\n`,
  )
  for (const pkg of packages) process.stderr.write(`  • ${shortPath(pkg.path)}\n`)

  const commits = commitsSince(tag)
  const block = draftChangelog(`v${newVersion}`, commits)
  process.stderr.write(`\n--- draft changelog ---\n${block}\n------------------------\n\n`)

  if (args.dryRun) {
    process.stderr.write('dry-run: stopping before any writes.\n')
    return
  }

  for (const pkg of packages) bumpPackage(pkg, newVersion)
  const rootChangelog = join(REPO, 'CHANGELOG.md')
  const written = new Set<string>()
  prependChangelog(rootChangelog, block)
  written.add(rootChangelog)
  for (const pkg of packages) {
    if (!pkg.changelogPath || written.has(pkg.changelogPath)) continue
    prependChangelog(pkg.changelogPath, block)
    written.add(pkg.changelogPath)
  }

  if (!args.yes) {
    const editTargets = [rootChangelog]
    for (const pkg of packages) if (pkg.changelogPath) editTargets.push(pkg.changelogPath)
    openEditorOn(editTargets)
  }

  for (const pkg of packages) buildIfNeeded(pkg, false)

  const toStage = [rootChangelog]
  for (const pkg of packages) {
    toStage.push(pkg.path)
    if (pkg.changelogPath) toStage.push(pkg.changelogPath)
  }
  const addArgs = ['add', '--', ...toStage]
  const add = sh('git', addArgs)
  if (add.code !== 0) die(`git add failed:\n${add.stderr}`)

  const commit = sh('git', ['commit', '-m', `chore(release): v${newVersion}`])
  if (commit.code !== 0) die(`git commit failed:\n${commit.stderr || commit.stdout}`)

  const tagResult = sh('git', ['tag', '-a', `v${newVersion}`, '-m', `v${newVersion}`])
  if (tagResult.code !== 0) die(`git tag failed:\n${tagResult.stderr || tagResult.stdout}`)

  process.stderr.write(`\nrelease: tagged v${newVersion}\n`)
  if (!args.noPushHint) {
    process.stderr.write(
      `next:\n  just release-push      # pushes main + v${newVersion}; CI builds binaries and publishes the GitHub Release\n  (raw: git push origin main && git push origin v${newVersion})\n`,
    )
  }
}

main()
