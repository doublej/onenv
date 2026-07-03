import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureServiceAccountToken } from './op-token.js'

let currentTempConfig: string | undefined
const savedEnv = process.env.OP_SERVICE_ACCOUNT_TOKEN

async function withTempConfig(): Promise<string> {
  currentTempConfig = await mkdtemp(join(tmpdir(), 'onenv-token-test-'))
  process.env.XDG_CONFIG_HOME = currentTempConfig
  const path = join(currentTempConfig, 'onenv-manager', 'op-token')
  await mkdir(join(currentTempConfig, 'onenv-manager'), { recursive: true })
  return path
}

beforeEach(() => {
  delete process.env.OP_SERVICE_ACCOUNT_TOKEN
})

afterEach(async () => {
  if (currentTempConfig) {
    await rm(currentTempConfig, { recursive: true, force: true })
    currentTempConfig = undefined
  }
  delete process.env.XDG_CONFIG_HOME
  if (savedEnv === undefined) delete process.env.OP_SERVICE_ACCOUNT_TOKEN
  else process.env.OP_SERVICE_ACCOUNT_TOKEN = savedEnv
})

describe.sequential('ensureServiceAccountToken', () => {
  it('loads the cached ops_ token when the env var is unset', async () => {
    const cachePath = await withTempConfig()
    await writeFile(cachePath, 'ops_cachedliteral')
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN

    await ensureServiceAccountToken()

    expect(process.env.OP_SERVICE_ACCOUNT_TOKEN).toBe('ops_cachedliteral')
  })

  it('leaves a literal env token untouched (no cache read)', async () => {
    const cachePath = await withTempConfig()
    await writeFile(cachePath, 'ops_cachedliteral')
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'ops_fromenv'

    await ensureServiceAccountToken()

    expect(process.env.OP_SERVICE_ACCOUNT_TOKEN).toBe('ops_fromenv')
  })

  it('stays unset when neither env var nor cache is present', async () => {
    await withTempConfig()
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN

    await ensureServiceAccountToken()

    expect(process.env.OP_SERVICE_ACCOUNT_TOKEN).toBeUndefined()
  })

  it('ignores a non-ops_ cache entry', async () => {
    const cachePath = await withTempConfig()
    await writeFile(cachePath, 'garbage')
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN

    await ensureServiceAccountToken()

    expect(process.env.OP_SERVICE_ACCOUNT_TOKEN).toBeUndefined()
  })
})
