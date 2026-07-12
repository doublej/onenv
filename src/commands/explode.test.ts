import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../lib/errors.js'
import type { ExternalItem } from '../lib/external-item.js'

const getExternalItem = vi.fn()
const setValue = vi.fn(async (..._args: unknown[]) => {})
const setValueWithMeta = vi.fn(async (..._args: unknown[]) => {})
const getItemWithMeta = vi.fn()
const unsetValue = vi.fn(async (..._args: unknown[]) => {})

vi.mock('../lib/external-item.js', () => ({
  getExternalItem: (...args: unknown[]) => getExternalItem(...args),
}))

vi.mock('../lib/onenv-client.js', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/onenv-client.js')>('../lib/onenv-client.js')
  return {
    ...actual,
    setValue: (...args: unknown[]) => setValue(...args),
    setValueWithMeta: (...args: unknown[]) => setValueWithMeta(...args),
    getItemWithMeta: (...args: unknown[]) => getItemWithMeta(...args),
    unsetValue: (...args: unknown[]) => unsetValue(...args),
  }
})

function notFound(): CliError {
  return new CliError('NOT_FOUND', 'item not found', 'user_error')
}

function loginItem(overrides: Partial<ExternalItem> = {}): ExternalItem {
  return {
    title: 'GitHub',
    category: 'LOGIN',
    primaryUrl: 'https://github.com',
    fields: [
      { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'username', value: 'jj' },
      {
        id: 'password',
        type: 'CONCEALED',
        purpose: 'PASSWORD',
        label: 'password',
        value: 's3cret',
      },
      { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: 'a note' },
      { id: 'empty', type: 'STRING', label: 'empty field' },
    ],
    ...overrides,
  }
}

describe('explodeItem', () => {
  beforeEach(() => {
    getExternalItem.mockReset()
    getExternalItem.mockResolvedValue(loginItem())
    setValue.mockClear()
    setValue.mockImplementation(async () => {})
    setValueWithMeta.mockClear()
    getItemWithMeta.mockReset()
    getItemWithMeta.mockRejectedValue(notFound())
    unsetValue.mockClear()
  })

  it('explodes non-empty fields plus the primary URL, skipping notes', async () => {
    const { explodeItem } = await import('./explode.js')
    const { item, rows } = await explodeItem('github', 'GitHub', {})
    expect(item).toBe('GitHub')
    expect(rows.map((r) => r.key)).toEqual(['USERNAME', 'PASSWORD', 'URL'])
    expect(setValue).toHaveBeenCalledTimes(3)
    expect(setValue).toHaveBeenCalledWith('github', 'USERNAME', 'jj')
    expect(setValue).toHaveBeenCalledWith('github', 'PASSWORD', 's3cret')
    expect(setValue).toHaveBeenCalledWith('github', 'URL', 'https://github.com')
  })

  it('passes the source vault through to getExternalItem', async () => {
    const { explodeItem } = await import('./explode.js')
    await explodeItem('github', 'GitHub', { vault: 'Private' })
    expect(getExternalItem).toHaveBeenCalledWith('GitHub', 'Private')
  })

  it('honors --dry-run by not writing', async () => {
    const { explodeItem } = await import('./explode.js')
    const { rows } = await explodeItem('github', 'GitHub', { dryRun: true })
    expect(rows).toHaveLength(3)
    expect(setValue).not.toHaveBeenCalled()
    expect(getItemWithMeta).not.toHaveBeenCalled()
  })

  it('applies a prefix to all derived keys', async () => {
    const { explodeItem } = await import('./explode.js')
    const { rows } = await explodeItem('github', 'GitHub', { prefix: 'GH', dryRun: true })
    expect(rows.map((r) => r.key)).toEqual(['GH_USERNAME', 'GH_PASSWORD', 'GH_URL'])
  })

  it('upper-snakes labels and guards digit-leading keys', async () => {
    getExternalItem.mockResolvedValue(
      loginItem({
        primaryUrl: undefined,
        fields: [
          { id: 'f1', type: 'STRING', label: 'api key (read only)', value: 'k' },
          { id: 'f2', type: 'OTP', label: '2fa secret', value: 'otpauth://x' },
        ],
      }),
    )
    const { explodeItem } = await import('./explode.js')
    const { rows } = await explodeItem('github', 'GitHub', { dryRun: true })
    expect(rows.map((r) => r.key)).toEqual(['API_KEY_READ_ONLY', '_2FA_SECRET'])
  })

  it('refuses existing keys without --overwrite', async () => {
    getItemWithMeta.mockResolvedValue({ value: 'old' })
    const { explodeItem } = await import('./explode.js')
    await expect(explodeItem('github', 'GitHub', {})).rejects.toThrow(/already exist/)
    expect(setValue).not.toHaveBeenCalled()
  })

  it('--overwrite replaces existing keys', async () => {
    getItemWithMeta.mockResolvedValue({ value: 'old' })
    const { explodeItem } = await import('./explode.js')
    await explodeItem('github', 'GitHub', { overwrite: true })
    expect(setValue).toHaveBeenCalledTimes(3)
  })

  it('rolls back on mid-write failure: restores prior values, deletes created keys', async () => {
    // USERNAME exists (restore), PASSWORD is new (delete), URL fails (never written)
    getItemWithMeta.mockImplementation(async (...args: unknown[]) => {
      if (args[1] === 'USERNAME') return { value: 'oldUser' }
      throw notFound()
    })
    setValue.mockImplementation(async (...args: unknown[]) => {
      if (args[1] === 'URL') throw new Error('write URL failed')
    })
    const { explodeItem } = await import('./explode.js')
    await expect(explodeItem('github', 'GitHub', { overwrite: true })).rejects.toThrow(
      /write URL failed/,
    )
    expect(setValueWithMeta).toHaveBeenCalledWith('github', 'USERNAME', 'oldUser', {
      group: undefined,
      path: undefined,
      type: undefined,
    })
    expect(unsetValue).toHaveBeenCalledWith('github', 'PASSWORD')
  })

  it('errors on key collisions between fields', async () => {
    getExternalItem.mockResolvedValue(
      loginItem({
        primaryUrl: undefined,
        fields: [
          { id: 'f1', type: 'STRING', label: 'api key', value: 'a' },
          { id: 'f2', type: 'CONCEALED', label: 'API_KEY', value: 'b' },
        ],
      }),
    )
    const { explodeItem } = await import('./explode.js')
    await expect(explodeItem('github', 'GitHub', { dryRun: true })).rejects.toThrow(/collisions/)
  })

  it('errors when the item has no usable fields', async () => {
    getExternalItem.mockResolvedValue(
      loginItem({
        primaryUrl: undefined,
        fields: [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', value: 'note' }],
      }),
    )
    const { explodeItem } = await import('./explode.js')
    await expect(explodeItem('github', 'GitHub', {})).rejects.toThrow(/no usable fields/)
  })
})
