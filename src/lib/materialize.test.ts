import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listGroupEntries = vi.fn()

vi.mock('./onenv-client.js', () => ({
  listGroupEntries: (...args: unknown[]) => listGroupEntries(...(args as [])),
}))

describe('materializeFile', () => {
  beforeEach(() => listGroupEntries.mockReset())

  it('writes JSON groups as <group>.json', async () => {
    listGroupEntries.mockResolvedValue([{ key: 'A', value: 'x', path: 'a', type: 'string' }])
    const { materializeFile } = await import('./materialize.js')
    const m = await materializeFile('ns', 'sa')
    expect(basename(m.path)).toBe('sa.json')
    expect(m.raw).toBe(false)
    expect(JSON.parse(readFileSync(m.path, 'utf-8'))).toEqual({ a: 'x' })
    m.cleanup()
  })

  it('writes raw groups verbatim under the original filename', async () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
    listGroupEntries.mockResolvedValue([
      { key: 'K', value: pem, path: '../AuthKey_U76TN79743.p8', type: 'raw' },
    ])
    const { materializeFile } = await import('./materialize.js')
    const m = await materializeFile('apple', 'authkey')
    expect(basename(m.path)).toBe('AuthKey_U76TN79743.p8')
    expect(m.raw).toBe(true)
    expect(readFileSync(m.path, 'utf-8')).toBe(pem)
    expect(statSync(m.path).mode & 0o777).toBe(0o600)
    m.cleanup()
  })

  it('rejects a group mixing raw and JSON entries', async () => {
    listGroupEntries.mockResolvedValue([
      { key: 'K', value: 'pem', path: 'k.p8', type: 'raw' },
      { key: 'A', value: 'x', path: 'a', type: 'string' },
    ])
    const { materializeFile } = await import('./materialize.js')
    await expect(materializeFile('ns', 'g')).rejects.toThrow(/exactly one entry/)
  })
})
