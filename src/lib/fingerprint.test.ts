import { describe, expect, it } from 'vitest'
import { fingerprint } from './fingerprint.js'

describe('fingerprint', () => {
  it('produces the known sha256 for a known input', () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(fingerprint('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('is deterministic for the same input', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
  })
})
