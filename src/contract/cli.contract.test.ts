// Locks the observable CLI contract that external consumers parse (e.g. wallgen
// shelling out to `onenv export`). When one of these fails, a backwards-compat
// promise is being broken — bump the major and document it in CHANGELOG, don't
// just update the assertion.
import { readFileSync } from 'node:fs'
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
      "export AWS_ACCESS_KEY_ID='AKIA_EXAMPLE'\nexport AWS_SECRET_ACCESS_KEY='s3cr3t/value'\n",
    )
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

describe('errors', () => {
  it('a missing key yields a NOT_FOUND structured error and non-zero exit', () => {
    const r = runCli(['get', 'aws', 'NOPE', '--json'], ws)
    expect(r.code).not.toBe(0)
    const payload = r.json() as { error?: { code?: string } }
    expect(payload.error?.code).toBe('NOT_FOUND')
  })
})
