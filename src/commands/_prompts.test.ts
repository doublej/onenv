import { describe, expect, it } from 'vitest'
import { fuzzyMatch, optionFilter } from './_prompts.js'

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyMatch('gthb', 'GitHub')).toBe(true)
    expect(fuzzyMatch('GH', 'GitHub')).toBe(true)
    expect(fuzzyMatch('hubgit', 'GitHub')).toBe(false)
  })

  it('treats an empty search as match-all and ignores spaces', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true)
    expect(fuzzyMatch('   ', 'anything')).toBe(true)
    expect(fuzzyMatch('git hub', 'GitHub')).toBe(true)
  })

  it('requires characters in order, not just presence', () => {
    expect(fuzzyMatch('aws', 'AWS root account')).toBe(true)
    expect(fuzzyMatch('swa', 'AWS root account')).toBe(false)
  })
})

describe('optionFilter', () => {
  it('matches against the label and the hint', () => {
    const option = { label: 'GitHub', hint: 'Personal · login', value: 'id1' }
    expect(optionFilter('ghb', option)).toBe(true)
    expect(optionFilter('persnl', option)).toBe(true)
    expect(optionFilter('zzz', option)).toBe(false)
  })

  it('falls back to the value when there is no label', () => {
    expect(optionFilter('abc', { value: 'abcdef' })).toBe(true)
  })
})
