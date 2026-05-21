import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createOrUpdateVar = vi.fn(async () => {})
const editVar = vi.fn(async () => {})
const success = vi.fn()
const resolveRef = vi.fn(async (s: string) => s)
const storeRefs = vi.fn(async (_n: string[]) => {})
const password = vi.fn(async () => 'prompted-value')
const stdinText = vi.fn(async () => '')

vi.mock('../index.js', () => ({
  createOrUpdateVar: (...args: unknown[]) => createOrUpdateVar(...(args as [])),
  editVar: (...args: unknown[]) => editVar(...(args as [])),
}))

vi.mock('../lib/output.js', () => ({
  success: (...args: unknown[]) => success(...(args as [])),
}))

vi.mock('../lib/ref-store.js', () => ({
  resolveRef: (s: string) => resolveRef(s),
  storeRefs: (n: string[]) => storeRefs(n),
}))

vi.mock('node:stream/consumers', () => ({
  text: (_stream?: unknown) => stdinText(),
}))

vi.mock('@clack/prompts', () => ({
  password: (...args: unknown[]) => password(...(args as [])),
  isCancel: () => false,
}))

const originalIsTTY = process.stdin.isTTY

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
}

describe('editAction', () => {
  beforeEach(() => {
    createOrUpdateVar.mockClear()
    editVar.mockClear()
    success.mockClear()
    resolveRef.mockClear()
    storeRefs.mockClear()
    password.mockClear()
    stdinText.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    })
  })

  it('reads piped value with --value-stdin and strips trailing newline', async () => {
    setTTY(false)
    stdinText.mockResolvedValue('hello\n')
    const { editAction } = await import('./edit.js')
    await editAction('test', 'MY_KEY', { valueStdin: true })
    expect(editVar).toHaveBeenCalledWith('test', 'MY_KEY', 'hello')
  })

  it('throws on empty stdin with --value-stdin', async () => {
    setTTY(false)
    stdinText.mockResolvedValue('')
    const { editAction } = await import('./edit.js')
    await expect(editAction('test', 'MY_KEY', { valueStdin: true })).rejects.toThrow(/Empty stdin/)
    expect(editVar).not.toHaveBeenCalled()
  })

  it('strips only one trailing newline from multi-line stdin', async () => {
    setTTY(false)
    stdinText.mockResolvedValue('line1\nline2\n')
    const { editAction } = await import('./edit.js')
    await editAction('test', 'MY_KEY', { valueStdin: true })
    expect(editVar).toHaveBeenCalledWith('test', 'MY_KEY', 'line1\nline2')
  })

  it('refuses non-TTY stdin without --value-stdin', async () => {
    setTTY(false)
    const { editAction } = await import('./edit.js')
    await expect(editAction('test', 'MY_KEY', {})).rejects.toThrow(/Refusing to read/)
    expect(editVar).not.toHaveBeenCalled()
    expect(password).not.toHaveBeenCalled()
  })

  it('uses interactive prompt when TTY and no --value-stdin', async () => {
    setTTY(true)
    password.mockResolvedValue('prompted-value')
    const { editAction } = await import('./edit.js')
    await editAction('test', 'MY_KEY', {})
    expect(password).toHaveBeenCalledTimes(1)
    expect(editVar).toHaveBeenCalledWith('test', 'MY_KEY', 'prompted-value')
  })
})
