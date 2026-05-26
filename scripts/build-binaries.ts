#!/usr/bin/env bun
/**
 * Cross-compile standalone `onenv` binaries.
 *
 *   bun run scripts/build-binaries.ts
 *
 * Produces one self-contained executable per target in `dist-bin/`, plus a
 * `SHA256SUMS` manifest. Details that matter:
 *
 *   • The version is baked in at build time via `--env=ONENV_VERSION*` (see
 *     src/lib/version.ts) — a compiled binary has no package.json on disk.
 *   • `--no-compile-autoload-dotenv` stops the binary from silently sourcing
 *     .env files; onenv deliberately has no dotenv loader.
 *   • Bun cross-compiles every target from a single host (downloading each
 *     target runtime on first use), so CI builds all four on one Linux runner.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dir, '..')
const OUT_DIR = join(REPO, 'dist-bin')
const ENTRY = join(REPO, 'src/cli.ts')

const TARGETS: ReadonlyArray<{ triple: string; asset: string }> = [
  { triple: 'bun-darwin-arm64', asset: 'onenv-darwin-arm64' },
  { triple: 'bun-darwin-x64', asset: 'onenv-darwin-x64' },
  { triple: 'bun-linux-x64', asset: 'onenv-linux-x64' },
  { triple: 'bun-linux-arm64', asset: 'onenv-linux-arm64' },
]

function die(msg: string): never {
  process.stderr.write(`build-binaries: ${msg}\n`)
  process.exit(1)
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version?: string }
  return pkg.version || die('package.json has no version')
}

function compile(triple: string, asset: string, version: string): void {
  const args = [
    'build',
    ENTRY,
    '--compile',
    '--minify',
    '--no-compile-autoload-dotenv',
    '--env=ONENV_VERSION*',
    `--target=${triple}`,
    `--outfile=${join(OUT_DIR, asset)}`,
  ]
  const env = { ...process.env, ONENV_VERSION: version }
  const r = spawnSync('bun', args, { cwd: REPO, stdio: 'inherit', env })
  if (r.status !== 0) die(`compile failed for ${triple}`)
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function writeChecksums(): void {
  const lines = readdirSync(OUT_DIR)
    .filter((name) => name !== 'SHA256SUMS')
    .sort()
    .map((name) => `${sha256(join(OUT_DIR, name))}  ${name}`)
  writeFileSync(join(OUT_DIR, 'SHA256SUMS'), `${lines.join('\n')}\n`)
}

function main(): void {
  const version = readVersion()
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  process.stderr.write(`→ onenv v${version} → dist-bin/\n`)
  for (const target of TARGETS) {
    process.stderr.write(`→ ${target.triple}\n`)
    compile(target.triple, target.asset, version)
  }
  writeChecksums()
  process.stderr.write(`✓ ${TARGETS.length} binaries + SHA256SUMS\n`)
}

main()
