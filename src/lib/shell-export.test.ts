import { describe, expect, it } from 'vitest'
import { renderShellExports } from './shell-export.js'

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
})
