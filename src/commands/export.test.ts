import { describe, expect, it } from 'vitest'
import { assertRevealAllowed } from './export.js'

describe('assertRevealAllowed', () => {
  it('throws VALIDATION when --reveal is absent', () => {
    expect(() => assertRevealAllowed({ format: 'json' })).toThrowError(/--reveal/)
  })

  it('throws VALIDATION on an unknown --format', () => {
    expect(() => assertRevealAllowed({ reveal: true, format: 'yaml' })).toThrowError(/--format/)
  })

  it('allows reveal with json or shell', () => {
    expect(() => assertRevealAllowed({ reveal: true, format: 'json' })).not.toThrow()
    expect(() => assertRevealAllowed({ reveal: true, format: 'shell' })).not.toThrow()
  })
})
