import { execFile } from 'node:child_process'
import type { ApiConfig } from './config.js'

export interface PermissionRequest {
  action: 'set' | 'edit' | 'unset' | 'disable' | 'enable' | 'export'
  namespace?: string
  key?: string
  requestedBy: string
  details?: string
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

async function showDesktopDialog(request: PermissionRequest, timeoutMs: number): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }

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

  const script = `display dialog ${JSON.stringify(summary)} buttons {"Deny", "Allow"} default button "Deny" with title "onenv-api" giving up after ${timeoutSeconds}`

  try {
    const result = await execFileAsync('osascript', ['-e', script])
    return (
      result.stdout.includes('button returned:Allow') && !result.stdout.includes('gave up:true')
    )
  } catch {
    return false
  }
}

function parseRequestedBy(headerValue: string | undefined): string {
  if (!headerValue) {
    return 'unknown-agent'
  }

  return headerValue.trim().slice(0, 128) || 'unknown-agent'
}

export class PermissionService {
  private readonly timeoutMs: number

  constructor(config: ApiConfig) {
    this.timeoutMs = config.permissionTimeoutMs
  }

  async request(
    request: Omit<PermissionRequest, 'requestedBy'>,
    requestedByHeader: string | undefined,
  ): Promise<boolean> {
    const fullRequest: PermissionRequest = {
      ...request,
      requestedBy: parseRequestedBy(requestedByHeader),
    }
    return await showDesktopDialog(fullRequest, this.timeoutMs)
  }
}
