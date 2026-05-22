import { describe, expect, it } from 'vitest'
import { parseEnvFile } from './parse-env.js'

describe('parseEnvFile', () => {
  it('parses basic KEY=value', () => {
    expect(parseEnvFile('FOO=bar\nBAZ=qux\n')).toEqual([
      { key: 'FOO', value: 'bar', line: 1 },
      { key: 'BAZ', value: 'qux', line: 2 },
    ])
  })

  it('skips blank lines and comments, preserves line numbers', () => {
    const out = parseEnvFile('# header\n\nFOO=bar\n# inline note\nBAZ=qux\n')
    expect(out).toEqual([
      { key: 'FOO', value: 'bar', line: 3 },
      { key: 'BAZ', value: 'qux', line: 5 },
    ])
  })

  it('strips double and single quotes', () => {
    expect(parseEnvFile('A="hello"\nB=\'world\'\n')).toEqual([
      { key: 'A', value: 'hello', line: 1 },
      { key: 'B', value: 'world', line: 2 },
    ])
  })

  it('handles export prefix', () => {
    expect(parseEnvFile('export TOKEN=abc\n')).toEqual([{ key: 'TOKEN', value: 'abc', line: 1 }])
  })

  it('strips inline comments only for unquoted values', () => {
    expect(parseEnvFile('A=hello # trailing\nB="hello # kept"\n')).toEqual([
      { key: 'A', value: 'hello', line: 1 },
      { key: 'B', value: 'hello # kept', line: 2 },
    ])
  })

  it('unescapes common sequences in double quotes', () => {
    expect(parseEnvFile('MULTI="line1\\nline2"\n')).toEqual([
      { key: 'MULTI', value: 'line1\nline2', line: 1 },
    ])
  })

  it('ignores malformed lines instead of throwing', () => {
    expect(parseEnvFile('not-a-pair\nFOO=bar\n')).toEqual([{ key: 'FOO', value: 'bar', line: 2 }])
  })
})
