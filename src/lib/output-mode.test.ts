import { describe, expect, it } from 'vitest'
import { shouldUseJsonOutput } from './output-mode.js'

describe('shouldUseJsonOutput', () => {
  it('non-get command defaults to JSON when piped', () => {
    expect(shouldUseJsonOutput({ explicitJson: false, isTty: false, commandName: 'list' })).toBe(
      true,
    )
  })

  it('non-get command stays text on a TTY', () => {
    expect(shouldUseJsonOutput({ explicitJson: false, isTty: true, commandName: 'list' })).toBe(
      false,
    )
  })

  it('get stays text when piped (the raw-value contract)', () => {
    expect(shouldUseJsonOutput({ explicitJson: false, isTty: false, commandName: 'get' })).toBe(
      false,
    )
  })

  it('get stays text on a TTY', () => {
    expect(shouldUseJsonOutput({ explicitJson: false, isTty: true, commandName: 'get' })).toBe(
      false,
    )
  })

  it('explicit --json forces JSON even for get', () => {
    expect(shouldUseJsonOutput({ explicitJson: true, isTty: false, commandName: 'get' })).toBe(true)
    expect(shouldUseJsonOutput({ explicitJson: true, isTty: true, commandName: 'get' })).toBe(true)
  })
})
