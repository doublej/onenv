import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { ApiConfig, PermissionMode } from './config.js'

export interface PermissionRequest {
  action: 'set' | 'edit' | 'unset' | 'disable' | 'enable' | 'export'
  namespace?: string
  key?: string
  requestedBy: string
  details?: string
}

interface PermissionBroker {
  name: 'desktop' | 'telegram'
  isAvailable(): boolean
  requestApproval(request: PermissionRequest, timeoutMs: number): Promise<boolean>
}

interface TelegramUpdate {
  update_id: number
  message?: {
    text?: string
    chat?: {
      id?: number
    }
  }
}

type TelegramApiPayload = {
  ok: boolean
  result?: TelegramUpdate[]
}

async function execFileAsync(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

class DesktopPermissionBroker implements PermissionBroker {
  public readonly name = 'desktop' as const

  isAvailable(): boolean {
    return process.platform === 'darwin'
  }

  async requestApproval(request: PermissionRequest, timeoutMs: number): Promise<boolean> {
    const timeoutSeconds = Math.max(10, Math.floor(timeoutMs / 1000))
    const summary = [
      `Agent request: ${request.action}`,
      request.namespace ? `Namespace: ${request.namespace}` : null,
      request.key ? `Key: ${request.key}` : null,
      `Requester: ${request.requestedBy}`,
      request.details ? `Details: ${request.details}` : null,
      'Allow this operation?',
    ]
      .filter(Boolean)
      .join('\\n')

    const script = `display dialog ${JSON.stringify(summary)} buttons {"Deny", "Allow"} default button "Allow" with title "onenv-api" giving up after ${timeoutSeconds}`

    try {
      const result = await execFileAsync('osascript', ['-e', script])
      return result.stdout.includes('button returned:Allow')
    } catch {
      return false
    }
  }
}

class TelegramPermissionBroker implements PermissionBroker {
  public readonly name = 'telegram' as const
  private readonly token: string
  private readonly chatId: string
  private offset = 0

  constructor(token: string, chatId: string) {
    this.token = token
    this.chatId = chatId
  }

  isAvailable(): boolean {
    return this.token.length > 0 && this.chatId.length > 0
  }

  private get apiBase(): string {
    return `https://api.telegram.org/bot${this.token}`
  }

  private formatMessage(request: PermissionRequest, requestId: string): string {
    return [
      `onenv-api request ${requestId}`,
      `Action: ${request.action}`,
      request.namespace ? `Namespace: ${request.namespace}` : null,
      request.key ? `Key: ${request.key}` : null,
      `Requester: ${request.requestedBy}`,
      request.details ? `Details: ${request.details}` : null,
      '',
      `Reply with /allow ${requestId} or /deny ${requestId}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  private async sendRequestMessage(text: string): Promise<void> {
    await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
      }),
    })
  }

  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.apiBase}/getUpdates`)
    url.searchParams.set('timeout', '5')
    url.searchParams.set('offset', String(this.offset))

    const response = await fetch(url)
    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as TelegramApiPayload
    return payload.result ?? []
  }

  private isAllowedCommand(text: string, requestId: string): boolean {
    return text.trim() === `/allow ${requestId}`
  }

  private isDeniedCommand(text: string, requestId: string): boolean {
    return text.trim() === `/deny ${requestId}`
  }

  private parseDecision(update: TelegramUpdate, requestId: string): boolean | null {
    this.offset = Math.max(this.offset, update.update_id + 1)

    if (String(update.message?.chat?.id ?? '') !== this.chatId) {
      return null
    }

    const text = update.message?.text
    if (!text) {
      return null
    }

    if (this.isAllowedCommand(text, requestId)) {
      return true
    }

    if (this.isDeniedCommand(text, requestId)) {
      return false
    }

    return null
  }

  private async awaitDecision(requestId: string, timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const updates = await this.fetchUpdates()

      for (const update of updates) {
        const decision = this.parseDecision(update, requestId)
        if (decision !== null) {
          return decision
        }
      }

      await sleep(500)
    }

    return false
  }

  async requestApproval(request: PermissionRequest, timeoutMs: number): Promise<boolean> {
    const requestId = randomUUID().slice(0, 8)
    const message = this.formatMessage(request, requestId)

    await this.sendRequestMessage(message)
    return await this.awaitDecision(requestId, timeoutMs)
  }
}

function parseRequestedBy(headerValue: string | undefined): string {
  if (!headerValue) {
    return 'unknown-agent'
  }

  return headerValue.trim().slice(0, 128) || 'unknown-agent'
}

function shouldAllow(mode: PermissionMode, desktop: boolean, telegram: boolean): boolean {
  if (mode === 'desktop') {
    return desktop
  }

  if (mode === 'telegram') {
    return telegram
  }

  if (mode === 'both') {
    return desktop && telegram
  }

  return desktop || telegram
}

async function runBroker(
  broker: PermissionBroker | undefined,
  request: PermissionRequest,
  timeoutMs: number,
): Promise<boolean> {
  if (!broker?.isAvailable()) {
    return false
  }

  return await broker.requestApproval(request, timeoutMs)
}

export class PermissionService {
  private readonly mode: PermissionMode
  private readonly timeoutMs: number
  private readonly brokers: PermissionBroker[]

  constructor(config: ApiConfig) {
    this.mode = config.permissionMode
    this.timeoutMs = config.permissionTimeoutMs

    const brokers: PermissionBroker[] = [new DesktopPermissionBroker()]

    if (config.telegramBotToken && config.telegramChatId) {
      brokers.push(new TelegramPermissionBroker(config.telegramBotToken, config.telegramChatId))
    }

    this.brokers = brokers
  }

  async request(
    request: Omit<PermissionRequest, 'requestedBy'>,
    requestedByHeader: string | undefined,
  ): Promise<boolean> {
    const requestedBy = parseRequestedBy(requestedByHeader)
    const fullRequest: PermissionRequest = { ...request, requestedBy }

    const desktopBroker = this.brokers.find((broker) => broker.name === 'desktop')
    const telegramBroker = this.brokers.find((broker) => broker.name === 'telegram')

    const desktopAllowed = await runBroker(desktopBroker, fullRequest, this.timeoutMs)
    const telegramAllowed = await runBroker(telegramBroker, fullRequest, this.timeoutMs)

    return shouldAllow(this.mode, desktopAllowed, telegramAllowed)
  }
}
