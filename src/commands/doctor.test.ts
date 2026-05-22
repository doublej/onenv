import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProjectChecks } from './doctor-project-checks.js'
import { detectProjectMarker } from './doctor-project-marker.js'

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'onenv-doctor-'))
}

describe('detectProjectMarker', () => {
  it('returns null for an empty dir', () => {
    expect(detectProjectMarker(fixture())).toBeNull()
  })

  it('detects node by package.json', () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    expect(detectProjectMarker(dir)).toEqual({ kind: 'node', file: 'package.json' })
  })

  it('prefers package.json over .git when both exist', () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, '.git'))
    expect(detectProjectMarker(dir)?.kind).toBe('node')
  })
})

describe('runProjectChecks', () => {
  it('skips when no marker', async () => {
    const checks = await runProjectChecks(fixture(), null)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
  })

  it('warns when env files sit alongside .onenv.json', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.onenv.json'), JSON.stringify({ namespaces: ['demo'] }))
    writeFileSync(join(dir, '.env'), 'FOO=bar\n')
    const checks = await runProjectChecks(dir, { kind: 'node', file: 'package.json' })
    const env = checks.find((c) => c.name === 'env files in cwd')
    expect(env?.status).toBe('warn')
    expect(env?.detail).toContain('.env')
  })

  it('errors on .onenv.json with empty namespaces', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.onenv.json'), JSON.stringify({ namespaces: [] }))
    const checks = await runProjectChecks(dir, { kind: 'node', file: 'package.json' })
    const cfg = checks.find((c) => c.name === '.onenv.json')
    expect(cfg?.status).toBe('error')
  })

  it('errors when git-tracked env files are present', async () => {
    const dir = fixture()
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@t', { cwd: dir })
    execSync('git config user.name t', { cwd: dir })
    writeFileSync(join(dir, '.env'), 'A=1\n')
    execSync('git add .env && git commit -q -m t', { cwd: dir })
    const checks = await runProjectChecks(dir, { kind: 'git', file: '.git' })
    const tracked = checks.find((c) => c.name === 'git-tracked env files')
    expect(tracked?.status).toBe('error')
    expect(tracked?.detail).toContain('.env')
  })
})
