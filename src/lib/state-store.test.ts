import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getDisabledMap, isDisabled, setDisabled } from './state-store.js'

let currentTempConfig: string | undefined

async function withTempConfig(): Promise<void> {
  currentTempConfig = await mkdtemp(join(tmpdir(), 'onenv-test-'))
  process.env.XDG_CONFIG_HOME = currentTempConfig
}

afterEach(async () => {
  if (currentTempConfig) {
    await rm(currentTempConfig, { recursive: true, force: true })
    currentTempConfig = undefined
  }

  process.env.XDG_CONFIG_HOME = undefined
})

describe.sequential('state-store', () => {
  it('marks and unmarks disabled keys', async () => {
    await withTempConfig()

    await setDisabled('aws', 'AWS_SECRET_ACCESS_KEY', true)
    await setDisabled('aws', 'AWS_ACCESS_KEY_ID', true)

    expect(await isDisabled('aws', 'AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(await isDisabled('aws', 'AWS_ACCESS_KEY_ID')).toBe(true)

    await setDisabled('aws', 'AWS_ACCESS_KEY_ID', false)

    expect(await isDisabled('aws', 'AWS_ACCESS_KEY_ID')).toBe(false)
    expect(await isDisabled('aws', 'AWS_SECRET_ACCESS_KEY')).toBe(true)
  })

  it('removes keys from the target namespace', async () => {
    await withTempConfig()

    await setDisabled('project', 'TOKEN', true)
    await setDisabled('project', 'TOKEN', false)

    const disabledMap = await getDisabledMap()
    expect(disabledMap.project ?? []).toEqual([])
  })
})
