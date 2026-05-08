import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listGroupEntries = vi.fn()

vi.mock('../lib/onenv-client.js', () => ({
  listGroupEntries: (...args: unknown[]) => listGroupEntries(...(args as [])),
}))

describe('buildFile', () => {
  let originalWrite: typeof process.stdout.write
  let captured: string[]

  beforeEach(() => {
    listGroupEntries.mockReset()
    captured = []
    originalWrite = process.stdout.write
    process.stdout.write = ((chunk: string) => {
      captured.push(String(chunk))
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  it('reassembles JSON to stdout', async () => {
    listGroupEntries.mockResolvedValue([
      { key: 'INSTALLED_CLIENT_ID', value: 'abc', path: 'installed.client_id', type: 'string' },
      { key: 'SCOPES_0', value: 'a', path: 'scopes[0]', type: 'string' },
      { key: 'SCOPES_1', value: 'b', path: 'scopes[1]', type: 'string' },
    ])
    const { buildFile } = await import('./build-file.js')
    await buildFile('test', 'config')
    const out = captured.join('')
    expect(JSON.parse(out)).toEqual({
      installed: { client_id: 'abc' },
      scopes: ['a', 'b'],
    })
  })

  it('writes to --out path with custom indent', async () => {
    listGroupEntries.mockResolvedValue([{ key: 'A', value: 'x', path: 'a', type: 'string' }])
    const dir = mkdtempSync(join(tmpdir(), 'onenv-build-test-'))
    const out = join(dir, 'rebuilt.json')
    const { buildFile } = await import('./build-file.js')
    await buildFile('test', 'config', { out, indent: 4 })
    const text = readFileSync(out, 'utf-8')
    expect(text).toBe(`${JSON.stringify({ a: 'x' }, null, 4)}\n`)
  })

  it('errors when the group is empty', async () => {
    listGroupEntries.mockResolvedValue([])
    const { buildFile } = await import('./build-file.js')
    await expect(buildFile('test', 'missing')).rejects.toThrow(/No entries found/)
  })

  it('errors on missing array index', async () => {
    listGroupEntries.mockResolvedValue([
      { key: 'A0', value: 'x', path: '[0]', type: 'string' },
      { key: 'A2', value: 'z', path: '[2]', type: 'string' },
    ])
    const { buildFile } = await import('./build-file.js')
    await expect(buildFile('test', 'config')).rejects.toThrow(/missing array index/)
  })
})
