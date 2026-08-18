import { describe, expect, it } from 'vitest'
import { assertNotNested, resolveShellNamespaces } from './shell.js'

describe('assertNotNested', () => {
  it('throws VALIDATION when ONENV_ACTIVE is already set', () => {
    expect(() => assertNotNested({ ONENV_ACTIVE: 'aws' })).toThrowError(/already inside/i)
  })

  it('passes when ONENV_ACTIVE is unset', () => {
    expect(() => assertNotNested({})).not.toThrow()
  })
})

describe('resolveShellNamespaces', () => {
  it('parses an explicit comma list', async () => {
    await expect(resolveShellNamespaces('aws, db')).resolves.toEqual(['aws', 'db'])
  })

  it('rejects an empty explicit list', async () => {
    await expect(resolveShellNamespaces(',')).rejects.toThrowError(/at least one namespace/i)
  })
})
