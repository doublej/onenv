import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPlan } from './plan.js'

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'onenv-plan-'))
}

describe('buildPlan', () => {
  it('produces a versioned plan with sorted actions', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'STRIPE_API_KEY=sk_live_x\nAWS_ACCESS_KEY_ID=AKIA\n')
    const plan = await buildPlan(dir)
    expect(plan.version).toBe(1)
    expect(plan.actions.map((a) => a.key)).toEqual(['AWS_ACCESS_KEY_ID', 'STRIPE_API_KEY'])
    expect(plan.config.namespaces).toEqual(['aws', 'stripe'])
  })

  it('records previews but never the raw value', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'API_KEY=super_secret_value_xyz\n')
    const plan = await buildPlan(dir)
    const json = JSON.stringify(plan)
    expect(json).not.toContain('super_secret_value_xyz')
    expect(plan.actions[0].value_preview).toMatch(/su…yz/)
  })

  it('flags blockers when keys conflict across env files', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'API_KEY=one\n')
    writeFileSync(join(dir, '.env.local'), 'API_KEY=two\n')
    const plan = await buildPlan(dir)
    expect(plan.blockers).toHaveLength(1)
    expect(plan.blockers[0]).toMatch(/Conflicting values/)
    const action = plan.actions.find((a) => a.key === 'API_KEY')
    expect(action?.conflicts).toBeTruthy()
  })

  it('includes archive plan for each env file', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'A=1\n')
    writeFileSync(join(dir, '.env.local'), 'B=2\n')
    const plan = await buildPlan(dir)
    expect(plan.archive.files.sort()).toEqual(['.env', '.env.local'])
    expect(plan.archive.dir.startsWith('.onenv-archive/')).toBe(true)
  })
})
