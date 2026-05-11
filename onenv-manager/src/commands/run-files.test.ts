import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const importJsonFile = vi.fn(async () => ({ group: 'token', rows: [] }))

vi.mock('./import.js', () => ({
  importJsonFile: (...args: unknown[]) => importJsonFile(...(args as [])),
}))

function tmpFile(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'onenv-rwb-test-'))
  const file = join(dir, name)
  writeFileSync(file, body)
  return file
}

describe('runWritebacks', () => {
  beforeEach(() => {
    importJsonFile.mockClear()
  })

  it('skips injections without writeback', async () => {
    const file = tmpFile('token.json', '{"a":1}')
    const { runWritebacks } = await import('./run-files.js')
    await runWritebacks([
      {
        namespace: 'ns',
        group: 'token',
        path: file,
        cleanup: () => {},
        writeback: false,
        initialHash: '',
      },
    ])
    expect(importJsonFile).not.toHaveBeenCalled()
  })

  it('skips when hash unchanged', async () => {
    const file = tmpFile('token.json', '{"a":1}')
    const { runWritebacks } = await import('./run-files.js')
    const { createHash } = await import('node:crypto')
    const { readFileSync } = await import('node:fs')
    const initialHash = createHash('sha256').update(readFileSync(file)).digest('hex')
    await runWritebacks([
      {
        namespace: 'ns',
        group: 'token',
        path: file,
        cleanup: () => {},
        writeback: true,
        initialHash,
      },
    ])
    expect(importJsonFile).not.toHaveBeenCalled()
  })

  it('imports back when hash changed', async () => {
    const file = tmpFile('token.json', '{"a":1}')
    const { runWritebacks } = await import('./run-files.js')
    await runWritebacks([
      {
        namespace: 'ns',
        group: 'token',
        path: file,
        cleanup: () => {},
        writeback: true,
        initialHash: 'stale',
      },
    ])
    expect(importJsonFile).toHaveBeenCalledWith('ns', file, { group: 'token' })
  })

  it('swallows import errors with stderr log', async () => {
    importJsonFile.mockRejectedValueOnce(new Error('boom'))
    const file = tmpFile('token.json', '{"a":1}')
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { runWritebacks } = await import('./run-files.js')
    await runWritebacks([
      {
        namespace: 'ns',
        group: 'token',
        path: file,
        cleanup: () => {},
        writeback: true,
        initialHash: 'stale',
      },
    ])
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('writeback failed for ns:token'))
    errSpy.mockRestore()
  })

  it('skips when file vanished', async () => {
    const { runWritebacks } = await import('./run-files.js')
    await runWritebacks([
      {
        namespace: 'ns',
        group: 'token',
        path: '/nonexistent/path/x.json',
        cleanup: () => {},
        writeback: true,
        initialHash: 'stale',
      },
    ])
    expect(importJsonFile).not.toHaveBeenCalled()
  })
})
