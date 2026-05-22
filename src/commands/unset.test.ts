import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../lib/errors.js'

const removeVar = vi.fn(async () => {})
const successFn = vi.fn()
const warnFn = vi.fn()
const resolveRef = vi.fn(async (s: string) => s)
const storeRefs = vi.fn(async () => {})
const confirmMock = vi.fn()
const CANCEL_SYMBOL = Symbol('clack.cancel')

vi.mock('../index.js', () => ({
  removeVar: (...args: unknown[]) => removeVar(...(args as [])),
}))

vi.mock('../lib/output.js', () => ({
  success: (...args: unknown[]) => successFn(...(args as [])),
  warn: (...args: unknown[]) => warnFn(...(args as [])),
}))

vi.mock('../lib/ref-store.js', () => ({
  resolveRef: (...args: unknown[]) => resolveRef(...(args as [string])),
  storeRefs: (...args: unknown[]) => storeRefs(...(args as [])),
}))

vi.mock('@clack/prompts', () => ({
  confirm: (...args: unknown[]) => confirmMock(...(args as [])),
  isCancel: (v: unknown) => v === CANCEL_SYMBOL,
}))

const originalIsTTY = process.stdout.isTTY

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true })
}

describe('unsetAction', () => {
  beforeEach(() => {
    removeVar.mockClear()
    successFn.mockClear()
    warnFn.mockClear()
    resolveRef.mockClear()
    storeRefs.mockClear()
    confirmMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    })
  })

  it('--yes in TTY: calls removeVar for each key, no prompt', async () => {
    setTTY(true)
    const { unsetAction } = await import('./unset.js')
    await unsetAction('aws', ['A', 'B'], { yes: true })
    expect(removeVar).toHaveBeenCalledTimes(2)
    expect(removeVar).toHaveBeenNthCalledWith(1, 'aws', 'A')
    expect(removeVar).toHaveBeenNthCalledWith(2, 'aws', 'B')
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('--yes in non-TTY: calls removeVar, no error', async () => {
    setTTY(false)
    const { unsetAction } = await import('./unset.js')
    await unsetAction('aws', ['A'], { yes: true })
    expect(removeVar).toHaveBeenCalledTimes(1)
    expect(removeVar).toHaveBeenCalledWith('aws', 'A')
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('no --yes in non-TTY: throws validationError mentioning --yes, removeVar NEVER called', async () => {
    setTTY(false)
    const { unsetAction } = await import('./unset.js')
    await expect(unsetAction('aws', ['A'], {})).rejects.toThrow(/--yes/)
    await expect(unsetAction('aws', ['A'], {})).rejects.toBeInstanceOf(CliError)
    expect(removeVar).not.toHaveBeenCalled()
  })

  it('no --yes in TTY + confirm true: calls removeVar', async () => {
    setTTY(true)
    confirmMock.mockResolvedValue(true)
    const { unsetAction } = await import('./unset.js')
    await unsetAction('aws', ['A'], {})
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(removeVar).toHaveBeenCalledWith('aws', 'A')
  })

  it('no --yes in TTY + confirm false: does NOT call removeVar, success called with "Cancelled"', async () => {
    setTTY(true)
    confirmMock.mockResolvedValue(false)
    const { unsetAction } = await import('./unset.js')
    await unsetAction('aws', ['A'], {})
    expect(removeVar).not.toHaveBeenCalled()
    expect(successFn).toHaveBeenCalledWith('Cancelled')
  })

  it('no --yes in TTY + confirm cancelled: does NOT call removeVar, success called with "Cancelled"', async () => {
    setTTY(true)
    confirmMock.mockResolvedValue(CANCEL_SYMBOL)
    const { unsetAction } = await import('./unset.js')
    await unsetAction('aws', ['A'], {})
    expect(removeVar).not.toHaveBeenCalled()
    expect(successFn).toHaveBeenCalledWith('Cancelled')
  })
})
