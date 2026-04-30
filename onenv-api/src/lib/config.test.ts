import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

const ENV_KEYS = [
  'AGENT_API_TOKEN',
  'PERMISSION_MODE',
  'API_HOST',
  'API_PORT',
  'ONENV_VAULT',
  'ONENV_CATEGORY',
] as const

// biome-ignore lint/performance/noDelete: process.env requires delete (= undefined sets string "undefined")
function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key]
}

afterEach(clearEnv)

describe('loadConfig', () => {
  it('loads defaults with required token', () => {
    process.env.AGENT_API_TOKEN = 'token'

    const config = loadConfig()

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(4317)
    expect(config.permissionMode).toBe('desktop')
    expect(config.onenvVault).toBe('onenv')
    expect(config.onenvCategory).toBe('API Credential')
  })

  it('reads custom ONENV_VAULT and ONENV_CATEGORY', () => {
    process.env.AGENT_API_TOKEN = 'token'
    process.env.ONENV_VAULT = 'my-vault'
    process.env.ONENV_CATEGORY = 'Login'

    const config = loadConfig()

    expect(config.onenvVault).toBe('my-vault')
    expect(config.onenvCategory).toBe('Login')
  })

  it('throws for invalid permission mode', () => {
    process.env.AGENT_API_TOKEN = 'token'
    process.env.PERMISSION_MODE = 'invalid'

    expect(() => loadConfig()).toThrow('Invalid PERMISSION_MODE: invalid')
  })
})
