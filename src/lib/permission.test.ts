import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { confirmMutation } from './permission.js'

const originalFlag = process.env.ONENV_CONFIRM_MUTATIONS

describe('confirmMutation', () => {
  beforeEach(() => {
    delete process.env.ONENV_CONFIRM_MUTATIONS
  })

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.ONENV_CONFIRM_MUTATIONS
    } else {
      process.env.ONENV_CONFIRM_MUTATIONS = originalFlag
    }
  })

  it('is a no-op when ONENV_CONFIRM_MUTATIONS is unset', async () => {
    await expect(confirmMutation({ action: 'set', namespace: 'demo' })).resolves.toBeUndefined()
  })

  it('is a no-op when ONENV_CONFIRM_MUTATIONS is set to anything other than "1"', async () => {
    process.env.ONENV_CONFIRM_MUTATIONS = 'true'
    await expect(confirmMutation({ action: 'edit', namespace: 'demo' })).resolves.toBeUndefined()
  })

  it('throws PERMISSION_UNSUPPORTED on non-darwin when enabled', async () => {
    if (process.platform === 'darwin') return
    process.env.ONENV_CONFIRM_MUTATIONS = '1'
    await expect(confirmMutation({ action: 'unset', namespace: 'demo' })).rejects.toBeInstanceOf(
      CliError,
    )
  })
})
