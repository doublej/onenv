import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createOrUpdateVar = vi.fn()

vi.mock('../../lib/manager-service.js', () => ({
  createOrUpdateVar: (...args: unknown[]) => createOrUpdateVar(...(args as [])),
}))

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'onenv-apply-'))
}

describe('applyPlan', () => {
  beforeEach(() => {
    createOrUpdateVar.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('dry-run sets nothing, archives nothing, but resolves all values', async () => {
    const dir = fixture()
    writeFileSync(join(dir, '.env'), 'API_KEY=one\n')
    const { buildPlan } = await import('./plan.js')
    const { applyPlan } = await import('./apply.js')
    const plan = await buildPlan(dir)
    const result = await applyPlan(plan, { dryRun: true })
    expect(createOrUpdateVar).not.toHaveBeenCalled()
    expect(result.set).toHaveLength(1)
    expect(existsSync(join(dir, '.env'))).toBe(true)
    expect(result.dry_run).toBe(true)
  })

  it('non-dry-run sets keys, writes .onenv.json, archives env files', async () => {
    const dir = fixture()
    writeFileSync(join(dir, '.env'), 'STRIPE_API_KEY=sk\nDB_PASSWORD=hunter2\n')
    const { buildPlan } = await import('./plan.js')
    const { applyPlan } = await import('./apply.js')
    const plan = await buildPlan(dir)
    const result = await applyPlan(plan, { dryRun: false })
    expect(createOrUpdateVar).toHaveBeenCalledTimes(2)
    expect(createOrUpdateVar).toHaveBeenCalledWith('stripe', 'STRIPE_API_KEY', 'sk')
    expect(createOrUpdateVar).toHaveBeenCalledWith('database', 'DB_PASSWORD', 'hunter2')
    expect(existsSync(join(dir, '.env'))).toBe(false)
    expect(result.archive.archived).toContain('.env')
    expect(JSON.parse(readFileSync(join(dir, '.onenv.json'), 'utf-8'))).toEqual({
      namespaces: ['database', 'stripe'],
    })
  })

  it('appends /.onenv-archive/ to .gitignore for git projects', async () => {
    const dir = fixture()
    execSync('git init -q', { cwd: dir })
    writeFileSync(join(dir, '.env'), 'A=1\n')
    const { buildPlan } = await import('./plan.js')
    const { applyPlan } = await import('./apply.js')
    const plan = await buildPlan(dir)
    await applyPlan(plan, { dryRun: false })
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8')
    expect(gi).toMatch(/\/\.onenv-archive\//)
  })

  it('refuses to apply a plan with blockers', async () => {
    const dir = fixture()
    writeFileSync(join(dir, '.env'), 'API_KEY=one\n')
    writeFileSync(join(dir, '.env.local'), 'API_KEY=two\n')
    const { buildPlan } = await import('./plan.js')
    const { applyPlan } = await import('./apply.js')
    const plan = await buildPlan(dir)
    await expect(applyPlan(plan, { dryRun: false })).rejects.toThrow(/blocker/i)
  })

  it('errors when a source env file is missing', async () => {
    const dir = fixture()
    writeFileSync(join(dir, '.env'), 'A=1\n')
    const { buildPlan } = await import('./plan.js')
    const { applyPlan } = await import('./apply.js')
    const plan = await buildPlan(dir)
    execSync(`rm ${join(dir, '.env')}`)
    await expect(applyPlan(plan, { dryRun: false })).rejects.toThrow(/Source file missing/)
  })
})
