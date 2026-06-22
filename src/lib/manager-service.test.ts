import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./onenv-client.js', () => ({
  listValues: vi.fn(),
  listNamespaces: vi.fn(),
  listKeys: vi.fn(),
  listItemsWithMeta: vi.fn(),
  fetchAllItems: vi.fn(),
  listGroupEntries: vi.fn(),
  setValue: vi.fn(),
  setValueWithMeta: vi.fn(),
  unsetValue: vi.fn(),
}))

vi.mock('./state-store.js', () => ({
  getDisabledMap: vi.fn(),
  setDisabled: vi.fn(),
}))

const onenvClient = await import('./onenv-client.js')
const stateStore = await import('./state-store.js')
const { exportEnabledValuesStrict, getNamespaceVarsWithFingerprints } = await import(
  './manager-service.js'
)
const { fingerprint } = await import('./fingerprint.js')

type Values = Record<string, string>

function mockNamespaceValues(map: Record<string, Values>): void {
  vi.mocked(onenvClient.listValues).mockImplementation(async (ns: string) => map[ns] ?? {})
}

function mockDisabled(map: Record<string, string[]>): void {
  vi.mocked(stateStore.getDisabledMap).mockResolvedValue(map)
}

describe('exportEnabledValuesStrict', () => {
  beforeEach(() => {
    vi.mocked(onenvClient.listValues).mockReset()
    vi.mocked(stateStore.getDisabledMap).mockReset()
  })

  it('returns merged map for a single namespace', async () => {
    mockNamespaceValues({ aws: { AWS_KEY: 'a', AWS_SECRET: 'b' } })
    mockDisabled({})
    const result = await exportEnabledValuesStrict(['aws'])
    expect(result).toEqual({ AWS_KEY: 'a', AWS_SECRET: 'b' })
  })

  it('returns merged map for two namespaces with no overlap', async () => {
    mockNamespaceValues({
      aws: { AWS_KEY: 'a' },
      github: { GH_TOKEN: 't' },
    })
    mockDisabled({})
    const result = await exportEnabledValuesStrict(['aws', 'github'])
    expect(result).toEqual({ AWS_KEY: 'a', GH_TOKEN: 't' })
  })

  it('throws when one key collides across two namespaces', async () => {
    mockNamespaceValues({
      aws: { SHARED: '1', AWS_KEY: 'a' },
      project: { SHARED: '2', PROJ_KEY: 'p' },
    })
    mockDisabled({})
    await expect(exportEnabledValuesStrict(['aws', 'project'])).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('SHARED'),
    })
    await expect(exportEnabledValuesStrict(['aws', 'project'])).rejects.toMatchObject({
      message: expect.stringMatching(/aws.*project|project.*aws/),
    })
  })

  it('does not flag a collision when the duplicate is disabled in one namespace', async () => {
    mockNamespaceValues({
      aws: { SHARED: '1' },
      project: { SHARED: '2', PROJ_KEY: 'p' },
    })
    mockDisabled({ aws: ['SHARED'] })
    const result = await exportEnabledValuesStrict(['aws', 'project'])
    expect(result).toEqual({ SHARED: '2', PROJ_KEY: 'p' })
  })

  it('reports all conflicts across three namespaces, one line per key', async () => {
    mockNamespaceValues({
      a: { ALPHA: '1', BETA: '1' },
      b: { ALPHA: '2', BETA: '2' },
      c: { BETA: '3', GAMMA: '3' },
    })
    mockDisabled({})
    const err = await exportEnabledValuesStrict(['a', 'b', 'c']).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toContain('ALPHA')
    expect(message).toContain('BETA')
    const alphaIdx = message.indexOf('ALPHA')
    const betaIdx = message.indexOf('BETA')
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(betaIdx).toBeGreaterThan(alphaIdx)
    expect(message).toMatch(/ALPHA: a, b/)
    expect(message).toMatch(/BETA: a, b, c/)
  })
})

describe('getNamespaceVarsWithFingerprints', () => {
  beforeEach(() => {
    vi.mocked(onenvClient.fetchAllItems).mockReset()
    vi.mocked(stateStore.getDisabledMap).mockReset()
  })

  it('returns each key with its sha256 fingerprint and metadata', async () => {
    vi.mocked(onenvClient.fetchAllItems).mockResolvedValue([
      { key: 'AWS_KEY', value: 'a', group: 'aws', path: 'aws.key', type: 'string' },
      { key: 'AWS_SECRET', value: 'b', group: 'aws', path: 'aws.secret', type: 'string' },
    ])
    mockDisabled({ aws: ['AWS_SECRET'] })

    const result = await getNamespaceVarsWithFingerprints('aws')
    expect(result).toEqual([
      {
        key: 'AWS_KEY',
        disabled: false,
        group: 'aws',
        path: 'aws.key',
        type: 'string',
        fingerprint: fingerprint('a'),
      },
      {
        key: 'AWS_SECRET',
        disabled: true,
        group: 'aws',
        path: 'aws.secret',
        type: 'string',
        fingerprint: fingerprint('b'),
      },
    ])
  })

  it('never includes the raw value', async () => {
    vi.mocked(onenvClient.fetchAllItems).mockResolvedValue([
      { key: 'KEY', value: 'super-secret-value', group: 'g', path: 'p', type: 'string' },
    ])
    mockDisabled({})

    const result = await getNamespaceVarsWithFingerprints('ns')
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('super-secret-value')
    expect(result[0].fingerprint).toBe(fingerprint('super-secret-value'))
  })
})
