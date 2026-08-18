import { describe, expect, it } from 'vitest'
import { injectedEnv, renderShellExports } from './shell-export.js'

describe('renderShellExports', () => {
  it('renders one export line per key, sorted', () => {
    expect(renderShellExports({ B: '2', A: '1' })).toBe("export A='1'\nexport B='2'\n")
  })

  it('single-quotes values so shell metacharacters stay literal', () => {
    expect(renderShellExports({ K: 'a b;c|d$e"f' })).toBe("export K='a b;c|d$e\"f'\n")
  })

  it('escapes embedded single quotes', () => {
    expect(renderShellExports({ K: "a'b" })).toBe("export K='a'\\''b'\n")
  })

  it('returns an empty string when there are no values', () => {
    expect(renderShellExports({})).toBe('')
  })

  it('emits an ONENV_ACTIVE marker line when namespaces are given, sorted in place', () => {
    expect(renderShellExports({ ZED: '1', A: '2' }, ['aws', 'db'])).toBe(
      "export A='2'\nexport ONENV_ACTIVE='aws,db'\nexport ZED='1'\n",
    )
  })
})

describe('injectedEnv', () => {
  it('merges process.env, values, and the ONENV_ACTIVE marker', () => {
    const env = injectedEnv({ API_KEY: 'x' }, ['aws', 'db'])
    expect(env.API_KEY).toBe('x')
    expect(env.ONENV_ACTIVE).toBe('aws,db')
    expect(env.PATH).toBe(process.env.PATH)
  })
})
