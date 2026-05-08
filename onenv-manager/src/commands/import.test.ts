import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../lib/errors.js'

const setValueWithMeta = vi.fn(async () => {})
const getItemWithMeta = vi.fn()

vi.mock('../lib/onenv-client.js', () => ({
  setValueWithMeta: (...args: unknown[]) => setValueWithMeta(...(args as [])),
  getItemWithMeta: (...args: unknown[]) => getItemWithMeta(...(args as [])),
}))

function notFound(): CliError {
  return new CliError('NOT_FOUND', 'item not found', 'user_error')
}

function tmpJson(name: string, body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'onenv-import-test-'))
  const file = join(dir, name)
  writeFileSync(file, JSON.stringify(body))
  return file
}

describe('importJsonFile', () => {
  beforeEach(() => {
    setValueWithMeta.mockClear()
    getItemWithMeta.mockReset()
    getItemWithMeta.mockRejectedValue(notFound())
  })

  it('flattens and writes each leaf with metadata', async () => {
    const file = tmpJson('config.json', { installed: { client_id: 'abc' }, scopes: ['a', 'b'] })
    const { importJsonFile } = await import('./import.js')
    const { group, rows } = await importJsonFile('test', file)
    expect(group).toBe('config')
    expect(rows.map((r) => r.key).sort()).toEqual(['INSTALLED_CLIENT_ID', 'SCOPES_0', 'SCOPES_1'])
    expect(setValueWithMeta).toHaveBeenCalledTimes(3)
    const call = setValueWithMeta.mock.calls.find(
      (args) => (args as unknown[])[1] === 'INSTALLED_CLIENT_ID',
    ) as unknown[] | undefined
    expect(call?.[2]).toBe('abc')
    expect(call?.[3]).toEqual({ group: 'config', path: 'installed.client_id', type: 'string' })
  })

  it('honors --dry-run by not writing', async () => {
    const file = tmpJson('config.json', { a: 1 })
    const { importJsonFile } = await import('./import.js')
    const result = await importJsonFile('test', file, { dryRun: true })
    expect(result.rows).toHaveLength(1)
    expect(setValueWithMeta).not.toHaveBeenCalled()
  })

  it('aborts on key collisions with leaf strategy', async () => {
    const file = tmpJson('config.json', { foo: { id: 'a' }, bar: { id: 'b' } })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file, { keys: 'leaf' })).rejects.toThrow(/collisions/)
  })

  it('refuses to overwrite an existing non-grouped key', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    getItemWithMeta.mockResolvedValue({ value: 'old' })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file)).rejects.toThrow(/without a group/)
  })

  it('refuses to overwrite a key from a different group', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    getItemWithMeta.mockResolvedValue({ value: 'old', group: 'other' })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file)).rejects.toThrow(/belongs to group "other"/)
  })

  it('applies a prefix to all derived keys', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    const { importJsonFile } = await import('./import.js')
    const { rows } = await importJsonFile('test', file, { prefix: 'OAUTH', dryRun: true })
    expect(rows[0].key).toBe('OAUTH_ID')
  })
})
