// Locks the observable CLI contract that external consumers parse (e.g. wallgen
// shelling out to `onenv export`). When one of these fails, a backwards-compat
// promise is being broken — bump the major and document it in CHANGELOG, don't
// just update the assertion.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureBuilt, makeWorkspace, runCli, type StubItem } from './harness.js'

const ITEMS: StubItem[] = [
  { id: 'id-1', namespace: 'aws', key: 'AWS_ACCESS_KEY_ID', value: 'AKIA_EXAMPLE' },
  { id: 'id-2', namespace: 'aws', key: 'AWS_SECRET_ACCESS_KEY', value: 's3cr3t/value' },
]

let ws: string

beforeAll(() => {
  ensureBuilt()
  ws = makeWorkspace(ITEMS)
}, 60_000)

describe('export', () => {
  it('refuses to print without --reveal: structured error on stdout, non-zero exit', () => {
    const r = runCli(['export', 'aws'], ws)
    expect(r.code).not.toBe(0)
    const payload = r.json() as { error?: Record<string, unknown> }
    expect(payload.error).toMatchObject({
      code: 'VALIDATION',
      category: 'user_error',
      retryable: false,
    })
  })

  it('--reveal prints a flat {KEY: value} JSON object', () => {
    const r = runCli(['export', 'aws', '--reveal'], ws)
    expect(r.code).toBe(0)
    expect(r.json()).toEqual({
      AWS_ACCESS_KEY_ID: 'AKIA_EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 's3cr3t/value',
    })
  })

  it('--reveal --format shell emits sorted, eval-able export lines', () => {
    const r = runCli(['export', 'aws', '--reveal', '--format', 'shell'], ws)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(
      "export AWS_ACCESS_KEY_ID='AKIA_EXAMPLE'\nexport AWS_SECRET_ACCESS_KEY='s3cr3t/value'\nexport ONENV_ACTIVE='aws'\n",
    )
  })

  it('inject mode marks the child env with ONENV_ACTIVE', () => {
    const r = runCli(
      ['export', 'aws', '--', 'node', '-e', 'process.stdout.write(process.env.ONENV_ACTIVE||"")'],
      ws,
    )
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('aws')
  })

  it('inject mode (-- cmd) needs no --reveal and never prints the secret', () => {
    const r = runCli(
      [
        'export',
        'aws',
        '--',
        'node',
        '-e',
        'process.stdout.write(process.env.AWS_ACCESS_KEY_ID||"")',
      ],
      ws,
    )
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('AKIA_EXAMPLE')
  })
})

describe('list', () => {
  it('bare list returns a JSON array of namespace strings', () => {
    const r = runCli(['list'], ws)
    expect(r.code).toBe(0)
    expect(r.json()).toEqual(['aws'])
  })

  it('list <ns> returns [{key, disabled}] sorted by key', () => {
    const r = runCli(['list', 'aws'], ws)
    expect(r.code).toBe(0)
    expect(r.json()).toEqual([
      { key: 'AWS_ACCESS_KEY_ID', disabled: false },
      { key: 'AWS_SECRET_ACCESS_KEY', disabled: false },
    ])
  })
})

describe('get', () => {
  it('prints the raw value (no JSON wrapping) even when piped', () => {
    const r = runCli(['get', 'aws', 'AWS_ACCESS_KEY_ID'], ws)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('AKIA_EXAMPLE\n')
  })

  it('--json opts into the {value} shape', () => {
    const r = runCli(['get', 'aws', 'AWS_ACCESS_KEY_ID', '--json'], ws)
    expect(r.json()).toEqual({ value: 'AKIA_EXAMPLE' })
  })

  it('--fingerprint prints sha256:<hex> and never the value', () => {
    const r = runCli(['get', 'aws', 'AWS_ACCESS_KEY_ID', '--fingerprint'], ws)
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(r.stdout).not.toContain('AKIA_EXAMPLE')
  })
})

describe('disable/enable', () => {
  function disabledKeys(workspace: string, namespace: string): string[] | undefined {
    const raw = readFileSync(join(workspace, 'config', 'onenv-manager', 'state.json'), 'utf-8')
    return (JSON.parse(raw) as { disabled: Record<string, string[]> }).disabled[namespace]
  }

  it('disable persists every key to state.json over a piped (non-TTY) run', () => {
    const dws = makeWorkspace(ITEMS)
    const r = runCli(['disable', 'aws', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], dws)
    expect(r.code).toBe(0)
    expect(r.json()).toMatchObject({
      ok: true,
      namespace: 'aws',
      keys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    })
    // Both keys must land — not just the first — even though stdout is a pipe.
    expect(disabledKeys(dws, 'aws')).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
  })

  it('enable removes the keys and prunes the empty namespace', () => {
    const dws = makeWorkspace(ITEMS)
    runCli(['disable', 'aws', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], dws)
    const r = runCli(['enable', 'aws', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], dws)
    expect(r.code).toBe(0)
    expect(disabledKeys(dws, 'aws')).toBeUndefined()
  })
})

describe('fileOnlyNamespaces (run)', () => {
  // app is flat-injected; gws-x and gws-y deliberately share key names (ACCESS,
  // REFRESH) in a "token" group — the per-account OAuth shape that hard-collides
  // under flat injection unless the namespaces are declared fileOnly.
  const FILE_ITEMS: StubItem[] = [
    { id: 'f-app', namespace: 'app', key: 'APP_KEY', value: 'app-val' },
    // biome-ignore format: keep one item per line for readability
    { id: 'f-x1', namespace: 'gws-x', key: 'ACCESS', value: 'x-access', group: 'token', path: 'access', type: 'string' },
    // biome-ignore format: keep one item per line for readability
    { id: 'f-x2', namespace: 'gws-x', key: 'REFRESH', value: 'x-refresh', group: 'token', path: 'refresh', type: 'string' },
    // biome-ignore format: keep one item per line for readability
    { id: 'f-y1', namespace: 'gws-y', key: 'ACCESS', value: 'y-access', group: 'token', path: 'access', type: 'string' },
    // biome-ignore format: keep one item per line for readability
    { id: 'f-y2', namespace: 'gws-y', key: 'REFRESH', value: 'y-refresh', group: 'token', path: 'refresh', type: 'string' },
  ]

  function workspaceWith(config: object): string {
    const fws = makeWorkspace(FILE_ITEMS)
    writeFileSync(join(fws, '.onenv.json'), JSON.stringify(config))
    return fws
  }

  const ALL = { namespaces: ['app', 'gws-x', 'gws-y'], fileOnlyNamespaces: ['gws-x', 'gws-y'] }
  const PRINT_ENV =
    'process.stdout.write((process.env.APP_KEY||"none")+":"+(process.env.ACCESS||"none"))'
  const PRINT_FILE = 'process.stdout.write(require("fs").readFileSync(process.env.TOK,"utf-8"))'

  it('flat-injects non-fileOnly namespaces and skips fileOnly ones', () => {
    const r = runCli(['run', '--', 'node', '-e', PRINT_ENV], workspaceWith(ALL))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('app-val:none')
  })

  it('does not error on a key collision confined to fileOnly namespaces', () => {
    const r = runCli(['run', '--', 'node', '-e', 'process.stdout.write("ok")'], workspaceWith(ALL))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('ok')
  })

  it('still errors on a collision between NON-fileOnly namespaces', () => {
    const fws = workspaceWith({ namespaces: ['gws-x', 'gws-y'] })
    const r = runCli(['run', '--', 'node', '-e', 'process.stdout.write("ok")'], fws)
    expect(r.code).not.toBe(0)
    expect((r.json() as { error?: { code?: string } }).error?.code).toBe('VALIDATION')
  })

  it('materializes --file from a fileOnly namespace', () => {
    const r = runCli(
      ['run', '--file', 'gws-x/token:TOK', '--', 'node', '-e', PRINT_FILE],
      workspaceWith(ALL),
    )
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ access: 'x-access', refresh: 'x-refresh' })
  })

  it('handles an all-fileOnly project with --file (empty flat values, no crash)', () => {
    const fws = workspaceWith({
      namespaces: ['gws-x', 'gws-y'],
      fileOnlyNamespaces: ['gws-x', 'gws-y'],
    })
    const r = runCli(['run', '--file', 'gws-y/token:TOK', '--', 'node', '-e', PRINT_FILE], fws)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ access: 'y-access', refresh: 'y-refresh' })
  })

  it('export of a fileOnly namespace still prints — fileOnly only governs run', () => {
    const r = runCli(['export', 'gws-x', '--reveal'], workspaceWith(ALL))
    expect(r.code).toBe(0)
    expect(r.json()).toEqual({ ACCESS: 'x-access', REFRESH: 'x-refresh' })
  })
})

describe('errors', () => {
  it('a missing key yields a NOT_FOUND structured error and non-zero exit', () => {
    const r = runCli(['get', 'aws', 'NOPE', '--json'], ws)
    expect(r.code).not.toBe(0)
    const payload = r.json() as { error?: { code?: string } }
    expect(payload.error?.code).toBe('NOT_FOUND')
  })
})
