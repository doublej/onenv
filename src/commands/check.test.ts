import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readProjectConfig = vi.fn()
const exportEnabledValuesStrict = vi.fn()

vi.mock('../lib/project-config.js', () => ({
  readProjectConfig: (...args: unknown[]) => readProjectConfig(...(args as [])),
}))

vi.mock('../index.js', () => ({
  exportEnabledValuesStrict: (...args: unknown[]) => exportEnabledValuesStrict(...(args as [])),
}))

const TRACKED_KEYS = ['AWS_KEY', 'DB_URL', 'API_TOKEN']
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  readProjectConfig.mockReset()
  exportEnabledValuesStrict.mockReset()
  readProjectConfig.mockResolvedValue({ namespaces: ['aws', 'app'] })
  exportEnabledValuesStrict.mockResolvedValue({
    AWS_KEY: 'aws-secret',
    DB_URL: 'postgres://x',
    API_TOKEN: 'token-1',
  })
  for (const k of TRACKED_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of TRACKED_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('runCheck', () => {
  it('marks all keys as match when process.env matches onenv', async () => {
    process.env.AWS_KEY = 'aws-secret'
    process.env.DB_URL = 'postgres://x'
    process.env.API_TOKEN = 'token-1'
    const { runCheck } = await import('./check.js')
    const rows = await runCheck()
    expect(rows).toEqual([
      { key: 'API_TOKEN', status: 'match' },
      { key: 'AWS_KEY', status: 'match' },
      { key: 'DB_URL', status: 'match' },
    ])
  })

  it('marks a key as differ when process.env value differs', async () => {
    process.env.AWS_KEY = 'aws-secret'
    process.env.DB_URL = 'wrong-value'
    process.env.API_TOKEN = 'token-1'
    const { runCheck } = await import('./check.js')
    const rows = await runCheck()
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.status]))
    expect(byKey).toEqual({
      AWS_KEY: 'match',
      DB_URL: 'differ',
      API_TOKEN: 'match',
    })
  })

  it('marks a key as missing when not in process.env', async () => {
    process.env.AWS_KEY = 'aws-secret'
    process.env.API_TOKEN = 'token-1'
    const { runCheck } = await import('./check.js')
    const rows = await runCheck()
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.status]))
    expect(byKey).toEqual({
      AWS_KEY: 'match',
      DB_URL: 'missing',
      API_TOKEN: 'match',
    })
  })

  it('returns rows sorted by key', async () => {
    const { runCheck } = await import('./check.js')
    const rows = await runCheck()
    expect(rows.map((r) => r.key)).toEqual(['API_TOKEN', 'AWS_KEY', 'DB_URL'])
  })

  it('emits only key + status — never values or fingerprints', async () => {
    process.env.AWS_KEY = 'aws-secret'
    process.env.DB_URL = 'wrong-value'
    const { runCheck } = await import('./check.js')
    const rows = await runCheck()
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['key', 'status'])
    }
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain('aws-secret')
    expect(serialized).not.toContain('postgres://x')
    expect(serialized).not.toContain('token-1')
    expect(serialized).not.toContain('wrong-value')
    expect(serialized).not.toContain('sha256:')
  })

  it('propagates errors from exportEnabledValuesStrict (e.g. collisions)', async () => {
    exportEnabledValuesStrict.mockRejectedValueOnce(new Error('collision: AWS_KEY'))
    const { runCheck } = await import('./check.js')
    await expect(runCheck()).rejects.toThrow(/collision/)
  })
})
