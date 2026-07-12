import { afterEach, describe, expect, it, vi } from 'vitest'

const runOp = vi.fn()

vi.mock('./onenv-client.js', () => ({
  runOp: (...args: unknown[]) => runOp(...args),
}))

describe('getExternalItem', () => {
  afterEach(() => {
    runOp.mockReset()
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN
  })

  it('strips the service-account token so op uses the user auth', async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'ops_secret'
    runOp.mockResolvedValue(JSON.stringify({ title: 'GitHub', fields: [] }))
    const { getExternalItem } = await import('./external-item.js')
    await getExternalItem('GitHub', 'Personal')
    expect(runOp).toHaveBeenCalledTimes(1)
    const [args, stdin, env] = runOp.mock.calls[0] as [string[], unknown, NodeJS.ProcessEnv]
    expect(args).toEqual(['item', 'get', 'GitHub', '--format', 'json', '--vault', 'Personal'])
    expect(stdin).toBeUndefined()
    expect(env.OP_SERVICE_ACCOUNT_TOKEN).toBeUndefined()
  })

  it('picks the primary URL and passes fields through', async () => {
    runOp.mockResolvedValue(
      JSON.stringify({
        title: 'GitHub',
        category: 'LOGIN',
        urls: [{ href: 'https://gist.github.com' }, { primary: true, href: 'https://github.com' }],
        fields: [{ id: 'username', type: 'STRING', label: 'username', value: 'jj' }],
      }),
    )
    const { getExternalItem } = await import('./external-item.js')
    const item = await getExternalItem('GitHub')
    expect(item.primaryUrl).toBe('https://github.com')
    expect(item.fields).toEqual([
      { id: 'username', type: 'STRING', label: 'username', value: 'jj' },
    ])
  })
})
