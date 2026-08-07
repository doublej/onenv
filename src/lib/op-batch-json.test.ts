import { describe, expect, it } from 'vitest'
import { parseConcatenatedJson } from './op-batch-json.js'

describe('parseConcatenatedJson', () => {
  it('returns empty array for blank input', () => {
    expect(parseConcatenatedJson('')).toEqual([])
    expect(parseConcatenatedJson('   ')).toEqual([])
  })

  it('parses a real JSON array unchanged', () => {
    expect(parseConcatenatedJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('parses a single pretty-printed object', () => {
    const raw = JSON.stringify({ a: 1, nested: { b: 2 } }, null, 2)
    expect(parseConcatenatedJson(raw)).toEqual([{ a: 1, nested: { b: 2 } }])
  })

  it('splits multiple pretty-printed objects concatenated back-to-back', () => {
    const objs = [
      { a: 1, nested: { b: 2 } },
      { a: 3, nested: { b: 4 } },
    ]
    const raw = objs.map((o) => JSON.stringify(o, null, 2)).join('\n')
    expect(parseConcatenatedJson(raw)).toEqual(objs)
  })
})
