import { describe, expect, it } from 'vitest'
import { type FlatEntry, flatten, unflatten } from './json-flatten.js'

function roundtrip(input: unknown): unknown {
  return unflatten(flatten(input))
}

describe('json-flatten', () => {
  const fixtures: Array<[string, unknown]> = [
    ['nested object', { installed: { client_id: 'abc', client_secret: 'xyz' } }],
    ['array of strings', { scopes: ['a', 'b', 'c'] }],
    ['mixed types', { count: 3, on: true, off: false, name: 'x', n: null }],
    ['empty object', {}],
    ['empty array', []],
    ['object with empty container', { a: {}, b: [] }],
    ['nested arrays of objects', { rows: [{ k: 1 }, { k: 2 }] }],
    ['top-level array of objects', [{ a: 1 }, { a: 2 }]],
    ['string with dots', { key: 'one.two.three' }],
    ['deep nesting', { a: { b: { c: { d: 'deep' } } } }],
    ['number variants', { i: 42, f: 1.5, neg: -7, zero: 0 }],
  ]

  for (const [name, input] of fixtures) {
    it(`round-trips ${name}`, () => {
      expect(roundtrip(input)).toEqual(input)
    })
  }

  it('round-trips a real-shaped OAuth credential file', () => {
    const input = {
      installed: {
        client_id: '123-abc.apps.googleusercontent.com',
        client_secret: 'secret-xyz',
        redirect_uris: ['http://localhost'],
      },
      scopes: ['openid', 'email'],
    }
    expect(roundtrip(input)).toEqual(input)
  })

  it('emits sentinel entries for empty containers', () => {
    const entries = flatten({ a: {}, b: [] })
    expect(entries.find((e) => e.path === 'a')?.type).toBe('empty-object')
    expect(entries.find((e) => e.path === 'b')?.type).toBe('empty-array')
  })

  it('round-trips a top-level primitive', () => {
    expect(roundtrip('hello')).toBe('hello')
    expect(roundtrip(42)).toBe(42)
    expect(roundtrip(null)).toBe(null)
  })

  it('errors on missing array index', () => {
    const entries: FlatEntry[] = [
      { path: '[0]', type: 'string', value: 'a' },
      { path: '[2]', type: 'string', value: 'c' },
    ]
    expect(() => unflatten(entries)).toThrow(/missing array index/)
  })

  it('errors on type mismatch', () => {
    const entries: FlatEntry[] = [{ path: 'n', type: 'number', value: 'not-a-number' }]
    expect(() => unflatten(entries)).toThrow(/invalid number/)
  })
})
