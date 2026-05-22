import { describe, expect, it } from 'vitest'
import { classifyKey, suggestNamespace } from './classify-keys.js'
import type { Framework } from './types.js'

const generic: Framework = { kind: 'generic', public_prefix: null }
const next: Framework = { kind: 'nextjs', public_prefix: 'NEXT_PUBLIC_' }

describe('classifyKey', () => {
  it('treats NODE_ENV / PORT / DEBUG as config', () => {
    expect(classifyKey('NODE_ENV', generic)).toBe('config')
    expect(classifyKey('PORT', generic)).toBe('config')
    expect(classifyKey('DEBUG', generic)).toBe('config')
  })

  it('treats keys with the framework public prefix as public', () => {
    expect(classifyKey('NEXT_PUBLIC_API_URL', next)).toBe('public')
  })

  it('treats keys ending in known secret hints as secret', () => {
    expect(classifyKey('STRIPE_API_KEY', generic)).toBe('secret')
    expect(classifyKey('DATABASE_PASSWORD', generic)).toBe('secret')
    expect(classifyKey('AUTH_TOKEN', generic)).toBe('secret')
  })

  it('defaults unknown keys to secret (conservative)', () => {
    expect(classifyKey('WEIRD_THING', generic)).toBe('secret')
  })
})

describe('suggestNamespace', () => {
  it('uses prefix table when available', () => {
    expect(suggestNamespace('STRIPE_API_KEY', 'my-app')).toBe('stripe')
    expect(suggestNamespace('AWS_SECRET_ACCESS_KEY', 'my-app')).toBe('aws')
    expect(suggestNamespace('DBX_REFRESH_TOKEN', 'my-app')).toBe('dropbox')
  })

  it('falls back to project name when no prefix matches', () => {
    expect(suggestNamespace('DATABASE_URL', 'my-app')).toBe('database')
    expect(suggestNamespace('CUSTOM_API_KEY', 'my-app')).toBe('my-app')
  })
})
