import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scan } from './scan.js'

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'onenv-scan-'))
}

describe('scan', () => {
  it('returns empty result for a project with no env files', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    const r = await scan(dir)
    expect(r.env_files).toHaveLength(0)
    expect(r.keys).toHaveLength(0)
    expect(r.summary.total_keys).toBe(0)
  })

  it('parses and groups keys by suggested namespace', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(
      join(dir, '.env'),
      'STRIPE_API_KEY=sk_live_abcd\nAWS_ACCESS_KEY_ID=AKIA\nNODE_ENV=production\nWEIRD_THING=hi\n',
    )
    const r = await scan(dir)
    expect(r.summary.total_keys).toBe(4)
    expect(r.summary.by_role.secret).toBe(3)
    expect(r.summary.by_role.config).toBe(1)
    const byKey = Object.fromEntries(r.keys.map((k) => [k.key, k]))
    expect(byKey.STRIPE_API_KEY.suggested_namespace).toBe('stripe')
    expect(byKey.AWS_ACCESS_KEY_ID.suggested_namespace).toBe('aws')
    expect(byKey.NODE_ENV.role).toBe('config')
  })

  it('detects Next.js public prefix from package.json', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }))
    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_API_URL=https://api\nSESSION_SECRET=shh\n')
    const r = await scan(dir)
    expect(r.framework.kind).toBe('nextjs')
    const byKey = Object.fromEntries(r.keys.map((k) => [k.key, k]))
    expect(byKey.NEXT_PUBLIC_API_URL.role).toBe('public')
    expect(byKey.SESSION_SECRET.role).toBe('secret')
  })

  it('flags conflicts when same key has different values across env files', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'API_KEY=keepasecret\n')
    writeFileSync(join(dir, '.env.local'), 'API_KEY=different_value_here\n')
    const r = await scan(dir)
    const k = r.keys.find((x) => x.key === 'API_KEY')
    expect(k?.conflict).toBe(true)
    expect(k?.sources).toHaveLength(2)
    expect(r.summary.conflicts).toBe(1)
  })

  it('warns when env files are tracked by git', async () => {
    const dir = fixture()
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@t && git config user.name t', { cwd: dir })
    writeFileSync(join(dir, '.env'), 'API_KEY=secret\n')
    execSync('git add .env && git commit -q -m t', { cwd: dir })
    const r = await scan(dir)
    expect(r.summary.tracked_env_files).toBe(1)
    expect(r.warnings.some((w) => w.includes('.env'))).toBe(true)
  })

  it('never leaks raw values in summaries', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'API_KEY=super_secret_value_xyz\n')
    const r = await scan(dir)
    const json = JSON.stringify(r)
    expect(json).not.toContain('super_secret_value_xyz')
  })
})
