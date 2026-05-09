export interface ApiConfig {
  host: string
  port: number
  authToken: string
  permissionTimeoutMs: number
  onenvVault: string
  onenvCategory: string
}

function parsePositiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? String(fallback))
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`)
  }
  return value
}

export function loadConfig(): ApiConfig {
  const authToken = process.env.AGENT_API_TOKEN
  if (!authToken) {
    throw new Error('AGENT_API_TOKEN is required')
  }

  return {
    host: process.env.API_HOST ?? '127.0.0.1',
    port: parsePositiveInteger('API_PORT', process.env.API_PORT, 4317),
    authToken,
    permissionTimeoutMs: parsePositiveInteger(
      'PERMISSION_TIMEOUT_MS',
      process.env.PERMISSION_TIMEOUT_MS,
      120000,
    ),
    onenvVault: process.env.ONENV_VAULT ?? 'onenv',
    onenvCategory: process.env.ONENV_CATEGORY ?? 'API Credential',
  }
}
