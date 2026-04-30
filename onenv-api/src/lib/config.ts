export type PermissionMode = 'desktop' | 'telegram' | 'either' | 'both'

export interface ApiConfig {
  host: string
  port: number
  authToken: string
  permissionMode: PermissionMode
  permissionTimeoutMs: number
  onenvVault: string
  onenvCategory: string
  telegramBotToken?: string
  telegramChatId?: string
}

function parsePermissionMode(raw: string | undefined): PermissionMode {
  if (!raw) {
    return 'desktop'
  }

  if (raw === 'desktop' || raw === 'telegram' || raw === 'either' || raw === 'both') {
    return raw
  }

  throw new Error(`Invalid PERMISSION_MODE: ${raw}`)
}

export function loadConfig(): ApiConfig {
  const authToken = process.env.AGENT_API_TOKEN
  if (!authToken) {
    throw new Error('AGENT_API_TOKEN is required')
  }

  return {
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? '4317'),
    authToken,
    permissionMode: parsePermissionMode(process.env.PERMISSION_MODE),
    permissionTimeoutMs: Number(process.env.PERMISSION_TIMEOUT_MS ?? '120000'),
    onenvVault: process.env.ONENV_VAULT ?? 'onenv',
    onenvCategory: process.env.ONENV_CATEGORY ?? 'API Credential',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
  }
}
