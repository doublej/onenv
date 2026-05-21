import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fingerprint } from '../lib/fingerprint.js'

const getItemWithMeta = vi.fn()
const output = vi.fn()
const isJsonMode = vi.fn(() => true)

vi.mock('../lib/onenv-client.js', () => ({
  getItemWithMeta: (...args: unknown[]) => getItemWithMeta(...(args as [])),
}))

vi.mock('../lib/output.js', () => ({
  output: (...args: unknown[]) => output(...(args as [])),
  isJsonMode: () => isJsonMode(),
  setJsonMode: vi.fn(),
}))

vi.mock('../lib/ref-store.js', () => ({
  resolveRef: async (s: string) => s,
  storeRefs: vi.fn(async () => {}),
}))

const SAMPLE = { value: 'hello', group: 'g', path: 'p', type: 'string' as const }
let stdoutSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  getItemWithMeta.mockReset()
  output.mockClear()
  isJsonMode.mockReturnValue(true)
  getItemWithMeta.mockResolvedValue(SAMPLE)
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stdoutSpy.mockRestore()
})

describe('getAction', () => {
  it('default (json) outputs the value', async () => {
    const { getAction } = await import('./get.js')
    await getAction('ns', 'KEY', {})
    expect(output).toHaveBeenCalledWith({ value: 'hello' })
  })

  it('--fingerprint (json) outputs sha256 of the value', async () => {
    const { getAction } = await import('./get.js')
    await getAction('ns', 'KEY', { fingerprint: true })
    expect(output).toHaveBeenCalledWith({ fingerprint: fingerprint('hello') })
  })

  it('--meta (json) outputs value plus metadata', async () => {
    const { getAction } = await import('./get.js')
    await getAction('ns', 'KEY', { meta: true })
    expect(output).toHaveBeenCalledWith({
      value: 'hello',
      group: 'g',
      path: 'p',
      type: 'string',
    })
  })

  it('--fingerprint --meta (json) swaps value for fingerprint', async () => {
    const { getAction } = await import('./get.js')
    await getAction('ns', 'KEY', { fingerprint: true, meta: true })
    expect(output).toHaveBeenCalledWith({
      fingerprint: fingerprint('hello'),
      group: 'g',
      path: 'p',
      type: 'string',
    })
  })

  it('--fingerprint never includes the raw value (json or text)', async () => {
    const { getAction } = await import('./get.js')

    await getAction('ns', 'KEY', { fingerprint: true })
    for (const call of output.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('hello')
    }

    output.mockClear()
    await getAction('ns', 'KEY', { fingerprint: true, meta: true })
    for (const call of output.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('hello')
    }

    // text mode
    isJsonMode.mockReturnValue(false)
    stdoutSpy.mockClear()
    await getAction('ns', 'KEY', { fingerprint: true })
    for (const call of stdoutSpy.mock.calls) {
      expect(String(call[0])).not.toContain('hello')
    }

    stdoutSpy.mockClear()
    await getAction('ns', 'KEY', { fingerprint: true, meta: true })
    for (const call of stdoutSpy.mock.calls) {
      expect(String(call[0])).not.toContain('hello')
    }
  })
})
