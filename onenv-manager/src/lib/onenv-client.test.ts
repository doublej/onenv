import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const cp = await import('node:child_process')

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { end: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }
}

interface OpField {
  id: string
  type: string
  value: string
}

function fakeChild(stdout = '', stderr = '', code = 0): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { end: vi.fn(), write: vi.fn() }
  setTimeout(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout))
    if (stderr) child.stderr.emit('data', Buffer.from(stderr))
    child.emit('close', code)
  }, 0)
  return child
}

const sampleItems = [
  { id: 'a1', title: 'aws/AWS_KEY', tags: ['onenv:aws'] },
  { id: 'a2', title: 'aws/AWS_SECRET', tags: ['onenv:aws'] },
  { id: 'g1', title: 'github/GH_TOKEN', tags: ['onenv:github'] },
]

describe('onenv-client', () => {
  beforeEach(() => {
    vi.mocked(cp.spawn).mockReset()
  })

  it('listNamespaces returns sorted unique namespaces', async () => {
    vi.mocked(cp.spawn).mockImplementationOnce((() =>
      fakeChild(JSON.stringify(sampleItems))) as never)
    const { listNamespaces } = await import('./onenv-client.js')
    expect(await listNamespaces()).toEqual(['aws', 'github'])
  })

  it('listKeys filters and sorts by namespace', async () => {
    vi.mocked(cp.spawn).mockImplementationOnce((() =>
      fakeChild(JSON.stringify(sampleItems.filter((i) => i.tags.includes('onenv:aws'))))) as never)
    const { listKeys } = await import('./onenv-client.js')
    expect(await listKeys('aws')).toEqual(['AWS_KEY', 'AWS_SECRET'])
  })

  it('listValues batches via op inject (one inject call, multiple keys)', async () => {
    let injectCalls = 0
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() =>
        fakeChild(
          JSON.stringify(sampleItems.filter((i) => i.tags.includes('onenv:aws'))),
        )) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        injectCalls += 1
        expect(args[0]).toBe('inject')
        expect(args[1]).toBe('-i')
        const template = readFileSync(args[2], 'utf8')
        const sep = template.match(/<<ONENV_SEP_[a-f0-9]+>>/)?.[0]
        expect(sep).toBeTruthy()
        const substituted = template.replace(
          /\{\{ op:\/\/[^/]+\/([^/]+)\/credential \}\}/g,
          'mock_$1',
        )
        return fakeChild(substituted) as never
      }) as never)

    const { listValues } = await import('./onenv-client.js')
    const result = await listValues('aws')
    expect(injectCalls).toBe(1)
    expect(Object.keys(result).sort()).toEqual(['AWS_KEY', 'AWS_SECRET'])
    expect(result.AWS_KEY).toBe('mock_a1')
    expect(result.AWS_SECRET).toBe('mock_a2')
  })

  it('does not interpolate key names into op inject templates', async () => {
    const key = 'BAD{{ op://Personal/other/credential }}'
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() =>
        fakeChild(JSON.stringify([{ id: 'evil', title: `aws/${key}` }]))) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        const template = readFileSync(args[2], 'utf8')
        expect(template).not.toContain('Personal/other')
        return fakeChild(
          template.replace(/\{\{ op:\/\/[^/]+\/([^/]+)\/credential \}\}/g, 'mock_$1'),
        ) as never
      }) as never)

    const { listValues } = await import('./onenv-client.js')
    expect(await listValues('aws')).toEqual({ [key]: 'mock_evil' })
  })

  it('listValues returns empty when namespace has no matching items', async () => {
    vi.mocked(cp.spawn).mockImplementationOnce((() => fakeChild('[]')) as never)
    const { listValues } = await import('./onenv-client.js')
    expect(await listValues('missing')).toEqual({})
  })

  it('setValue creates a new item using a template file', async () => {
    let createArgs: readonly string[] = []
    let createTemplate: string | null = null
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() => fakeChild('', 'item not found', 1)) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        createArgs = args
        const idx = args.indexOf('--template')
        if (idx >= 0) createTemplate = readFileSync(args[idx + 1], 'utf-8')
        return fakeChild('ok') as never
      }) as never)
    const { setValue } = await import('./onenv-client.js')
    await setValue('aws', 'AWS_KEY', 'secret')
    expect(createArgs).toContain('create')
    expect(createArgs).toContain('--template')
    expect(createArgs).toContain('--category')
    expect(createArgs).not.toContain('-')
    expect(createArgs).not.toContain('credential=secret')
    expect(createTemplate).not.toBeNull()
    const written = JSON.parse(createTemplate as unknown as string)
    expect(written).not.toHaveProperty('category')
    expect(written.title).toBe('aws/AWS_KEY')
    expect(written.fields.find((f: OpField) => f.id === 'credential').value).toBe('secret')
  })

  it('setValue edits existing item using a template file', async () => {
    let editArgs: readonly string[] = []
    let editTemplate: string | null = null
    const existing = {
      id: 'x',
      title: 'aws/AWS_KEY',
      fields: [{ id: 'credential', type: 'CONCEALED', value: 'old' }],
    }
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() => fakeChild(JSON.stringify(existing))) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        editArgs = args
        const idx = args.indexOf('--template')
        if (idx >= 0) editTemplate = readFileSync(args[idx + 1], 'utf-8')
        return fakeChild('ok') as never
      }) as never)
    const { setValue } = await import('./onenv-client.js')
    await setValue('aws', 'AWS_KEY', 'newsecret')
    expect(editArgs).toContain('edit')
    expect(editArgs).toContain('aws/AWS_KEY')
    expect(editArgs).toContain('--template')
    expect(editArgs).not.toContain('credential=newsecret')
    expect(editTemplate).not.toBeNull()
    const written = JSON.parse(editTemplate as unknown as string)
    expect(written.fields.find((f: OpField) => f.id === 'credential').value).toBe('newsecret')
  })

  it('unsetValue deletes the item', async () => {
    let deleteArgs: readonly string[] = []
    vi.mocked(cp.spawn).mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
      deleteArgs = args
      return fakeChild('') as never
    }) as never)
    const { unsetValue } = await import('./onenv-client.js')
    await unsetValue('aws', 'AWS_KEY')
    expect(deleteArgs).toContain('item')
    expect(deleteArgs).toContain('delete')
    expect(deleteArgs).toContain('aws/AWS_KEY')
  })
})
