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

function lastStdin(child: FakeChild): string {
  const calls = child.stdin.end.mock.calls
  return calls.length === 0 ? '' : String(calls[calls.length - 1][0] ?? '')
}

const sampleItems = [
  { id: 'a1', title: 'aws/AWS_KEY', tags: ['aws'] },
  { id: 'a2', title: 'aws/AWS_SECRET', tags: ['aws'] },
  { id: 'g1', title: 'github/GH_TOKEN', tags: ['github'] },
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
      fakeChild(JSON.stringify(sampleItems.filter((i) => i.tags.includes('aws'))))) as never)
    const { listKeys } = await import('./onenv-client.js')
    expect(await listKeys('aws')).toEqual(['AWS_KEY', 'AWS_SECRET'])
  })

  it('listValues batches via op inject (one inject call, multiple keys)', async () => {
    let injectCalls = 0
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() =>
        fakeChild(JSON.stringify(sampleItems.filter((i) => i.tags.includes('aws'))))) as never)
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

  it('listValues returns empty when namespace has no matching items', async () => {
    vi.mocked(cp.spawn).mockImplementationOnce((() => fakeChild('[]')) as never)
    const { listValues } = await import('./onenv-client.js')
    expect(await listValues('missing')).toEqual({})
  })

  it('setValue creates a new item with secret piped via stdin', async () => {
    let createArgs: readonly string[] = []
    let createChild: FakeChild | null = null
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() => fakeChild('', 'item not found', 1)) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        createArgs = args
        createChild = fakeChild('ok')
        return createChild as never
      }) as never)
    const { setValue } = await import('./onenv-client.js')
    await setValue('aws', 'AWS_KEY', 'secret')
    expect(createArgs).toContain('create')
    expect(createArgs).toContain('-')
    expect(createArgs).not.toContain('credential=secret')
    const stdin = JSON.parse(lastStdin(createChild as unknown as FakeChild))
    expect(stdin.title).toBe('aws/AWS_KEY')
    expect(stdin.fields.find((f: OpField) => f.id === 'credential').value).toBe('secret')
  })

  it('setValue edits existing item via stdin-piped JSON', async () => {
    let editArgs: readonly string[] = []
    let editChild: FakeChild | null = null
    const existing = {
      id: 'x',
      title: 'aws/AWS_KEY',
      fields: [{ id: 'credential', type: 'CONCEALED', value: 'old' }],
    }
    vi.mocked(cp.spawn)
      .mockImplementationOnce((() => fakeChild(JSON.stringify(existing))) as never)
      .mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
        editArgs = args
        editChild = fakeChild('ok')
        return editChild as never
      }) as never)
    const { setValue } = await import('./onenv-client.js')
    await setValue('aws', 'AWS_KEY', 'newsecret')
    expect(editArgs).toContain('edit')
    expect(editArgs).toContain('aws/AWS_KEY')
    expect(editArgs).not.toContain('credential=newsecret')
    const stdin = JSON.parse(lastStdin(editChild as unknown as FakeChild))
    expect(stdin.fields.find((f: OpField) => f.id === 'credential').value).toBe('newsecret')
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
