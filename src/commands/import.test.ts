import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../lib/errors.js'
import type { ImportOptions } from './import.js'

const setValueWithMeta = vi.fn(async (..._args: unknown[]) => {})
const getItemWithMeta = vi.fn()
const unsetValue = vi.fn(async (..._args: unknown[]) => {})

vi.mock('../lib/onenv-client.js', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/onenv-client.js')>('../lib/onenv-client.js')
  return {
    ...actual,
    setValueWithMeta: (...args: unknown[]) => setValueWithMeta(...args),
    getItemWithMeta: (...args: unknown[]) => getItemWithMeta(...args),
    unsetValue: (...args: unknown[]) => unsetValue(...args),
  }
})

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
    setValueWithMeta.mockImplementation(async () => {})
    getItemWithMeta.mockReset()
    getItemWithMeta.mockRejectedValue(notFound())
    unsetValue.mockClear()
    unsetValue.mockImplementation(async () => {})
  })

  it('flattens and writes each leaf with metadata', async () => {
    const file = tmpJson('config.json', { installed: { client_id: 'abc' }, scopes: ['a', 'b'] })
    const { importJsonFile } = await import('./import.js')
    const { group, rows } = await importJsonFile('test', file, { group: 'config' })
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
    const result = await importJsonFile('test', file, { group: 'config', dryRun: true })
    expect(result.rows).toHaveLength(1)
    expect(setValueWithMeta).not.toHaveBeenCalled()
  })

  it('aborts on key collisions with leaf strategy', async () => {
    const file = tmpJson('config.json', { foo: { id: 'a' }, bar: { id: 'b' } })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file, { group: 'config', keys: 'leaf' })).rejects.toThrow(
      /collisions/,
    )
  })

  it('refuses to overwrite an existing non-grouped key', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    getItemWithMeta.mockResolvedValue({ value: 'old' })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file, { group: 'config' })).rejects.toThrow(
      /without a group/,
    )
  })

  it('refuses to overwrite a key from a different group', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    getItemWithMeta.mockResolvedValue({ value: 'old', group: 'other' })
    const { importJsonFile } = await import('./import.js')
    await expect(importJsonFile('test', file, { group: 'config' })).rejects.toThrow(
      /belongs to group "other"/,
    )
  })

  it('applies a prefix to all derived keys', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    const { importJsonFile } = await import('./import.js')
    const { rows } = await importJsonFile('test', file, {
      group: 'config',
      prefix: 'OAUTH',
      dryRun: true,
    })
    expect(rows[0].key).toBe('OAUTH_ID')
  })

  it('requires explicit --group', async () => {
    const file = tmpJson('config.json', { id: 'a' })
    const { importJsonFile } = await import('./import.js')
    await expect(
      importJsonFile('test', file, { group: undefined as unknown as string } as ImportOptions),
    ).rejects.toThrow(/Group is required/)
  })

  it('--overwrite replaces existing values', async () => {
    const file = tmpJson('config.json', { id: 'new' })
    getItemWithMeta.mockResolvedValue({ value: 'old', group: 'other' })
    const { importJsonFile } = await import('./import.js')
    await importJsonFile('test', file, { group: 'config', overwrite: true })
    expect(setValueWithMeta).toHaveBeenCalledTimes(1)
    const args = setValueWithMeta.mock.calls[0] as unknown[]
    expect(args[1]).toBe('ID')
    expect(args[2]).toBe('new')
    expect(args[3]).toEqual({ group: 'config', path: 'id', type: 'string' })
  })

  it('--overwrite atomic rollback restores prior values on failure', async () => {
    const file = tmpJson('config.json', { a: 'newA', b: 'newB' })
    getItemWithMeta.mockImplementation(async (...args: unknown[]) => {
      const key = args[1] as string
      if (key === 'A') return { value: 'oldA', group: 'config', path: 'a', type: 'string' }
      if (key === 'B') return { value: 'oldB', group: 'config', path: 'b', type: 'string' }
      throw notFound()
    })
    setValueWithMeta.mockImplementation(async (...args: unknown[]) => {
      const key = args[1] as string
      if (key === 'B') throw new Error('write B failed')
    })
    const { importJsonFile } = await import('./import.js')
    await expect(
      importJsonFile('test', file, { group: 'config', overwrite: true }),
    ).rejects.toThrow(/write B failed/)
    // 1: write A (success), 2: write B (fails), 3: rollback A (restore old)
    expect(setValueWithMeta).toHaveBeenCalledTimes(3)
    const restoreCall = setValueWithMeta.mock.calls[2] as unknown[]
    expect(restoreCall[1]).toBe('A')
    expect(restoreCall[2]).toBe('oldA')
    expect(restoreCall[3]).toEqual({ group: 'config', path: 'a', type: 'string' })
    expect(unsetValue).not.toHaveBeenCalled()
  })

  it('--overwrite rollback deletes newly-created keys', async () => {
    // A exists (existing), B is new (created), C fails (never written).
    // Expect: A restored to 'oldA' AND B deleted via unsetValue.
    const file = tmpJson('config.json', { a: 'newA', b: 'newB', c: 'newC' })
    getItemWithMeta.mockImplementation(async (...args: unknown[]) => {
      const key = args[1] as string
      if (key === 'A') return { value: 'oldA', group: 'config', path: 'a', type: 'string' }
      throw notFound() // B and C are new
    })
    setValueWithMeta.mockImplementation(async (...args: unknown[]) => {
      const key = args[1] as string
      if (key === 'C') throw new Error('write C failed')
    })
    const { importJsonFile } = await import('./import.js')
    await expect(
      importJsonFile('test', file, { group: 'config', overwrite: true }),
    ).rejects.toThrow(/write C failed/)
    // After failure: rollback A (restore oldA) + unset B (newly created)
    const restoreCall = setValueWithMeta.mock.calls.find(
      (args) => (args as unknown[])[1] === 'A' && (args as unknown[])[2] === 'oldA',
    )
    expect(restoreCall).toBeDefined()
    expect(unsetValue).toHaveBeenCalledWith('test', 'B')
  })

  it('--raw stores the whole file as one key named after the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'onenv-import-test-'))
    const file = join(dir, 'AuthKey_U76TN79743.p8')
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
    writeFileSync(file, pem)
    const { importJsonFile } = await import('./import.js')
    const { rows } = await importJsonFile('apple', file, { group: 'authkey', raw: true })
    expect(rows).toEqual([
      { key: 'AUTHKEY_U76TN79743_P8', path: 'AuthKey_U76TN79743.p8', type: 'raw' },
    ])
    expect(setValueWithMeta).toHaveBeenCalledWith('apple', 'AUTHKEY_U76TN79743_P8', pem, {
      group: 'authkey',
      path: 'AuthKey_U76TN79743.p8',
      type: 'raw',
    })
  })

  it('--raw --key uses the explicit key name verbatim', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'onenv-import-test-'))
    const file = join(dir, 'AuthKey_U76TN79743.p8')
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
    writeFileSync(file, pem)
    const { importJsonFile } = await import('./import.js')
    const { rows } = await importJsonFile('apple', file, {
      group: 'authkey',
      raw: true,
      key: 'APNS_KEY',
    })
    expect(rows).toEqual([{ key: 'APNS_KEY', path: 'AuthKey_U76TN79743.p8', type: 'raw' }])
    expect(setValueWithMeta).toHaveBeenCalledWith('apple', 'APNS_KEY', pem, {
      group: 'authkey',
      path: 'AuthKey_U76TN79743.p8',
      type: 'raw',
    })
  })

  it('--raw --from-stdin names the key after the group', async () => {
    const fake = new PassThrough()
    const original = Object.getOwnPropertyDescriptor(process, 'stdin')
    Object.defineProperty(process, 'stdin', { value: fake, configurable: true })
    try {
      fake.end('not json at all')
      const { importJsonFile } = await import('./import.js')
      const { rows } = await importJsonFile('ns', undefined, {
        group: 'kube-config',
        raw: true,
        fromStdin: true,
        prefix: 'K8S',
      })
      expect(rows).toEqual([{ key: 'K8S_KUBE_CONFIG', path: 'kube-config', type: 'raw' }])
    } finally {
      if (original) Object.defineProperty(process, 'stdin', original)
    }
  })

  it('--from-stdin reads JSON from stdin', async () => {
    const fake = new PassThrough()
    const original = Object.getOwnPropertyDescriptor(process, 'stdin')
    Object.defineProperty(process, 'stdin', { value: fake, configurable: true })
    try {
      fake.end(JSON.stringify({ id: 'fromStdin' }))
      const { importJsonFile } = await import('./import.js')
      const { rows } = await importJsonFile('test', undefined, {
        group: 'config',
        fromStdin: true,
      })
      expect(rows.map((r) => r.key)).toEqual(['ID'])
      expect(setValueWithMeta).toHaveBeenCalledTimes(1)
      const args = setValueWithMeta.mock.calls[0] as unknown[]
      expect(args[2]).toBe('fromStdin')
    } finally {
      if (original) Object.defineProperty(process, 'stdin', original)
    }
  })
})
