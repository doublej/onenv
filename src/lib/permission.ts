import { execFile } from 'node:child_process'
import { CliError } from './errors.js'

export type MutationAction = 'set' | 'edit' | 'unset' | 'import' | 'explode'

export interface ConfirmOptions {
  action: MutationAction
  namespace: string
  details?: string
}

const DEFAULT_TIMEOUT_MS = 120_000

export async function confirmMutation(opts: ConfirmOptions): Promise<void> {
  if (process.env.ONENV_CONFIRM_MUTATIONS !== '1') return
  if (process.platform !== 'darwin') {
    throw new CliError(
      'PERMISSION_UNSUPPORTED',
      'ONENV_CONFIRM_MUTATIONS is set but only macOS is supported',
      'user_error',
      'Unset ONENV_CONFIRM_MUTATIONS or run on macOS',
    )
  }
  const allowed = await showDialog(opts, parseTimeoutMs())
  if (!allowed) {
    throw new CliError(
      'PERMISSION_DENIED',
      `Permission denied for ${opts.action} on ${opts.namespace}`,
      'user_error',
      'Click Allow in the system dialog, or unset ONENV_CONFIRM_MUTATIONS to skip the prompt',
    )
  }
}

function parseTimeoutMs(): number {
  const raw = process.env.PERMISSION_TIMEOUT_MS
  if (!raw) return DEFAULT_TIMEOUT_MS
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS
}

async function showDialog(opts: ConfirmOptions, timeoutMs: number): Promise<boolean> {
  const timeoutSeconds = Math.max(10, Math.floor(timeoutMs / 1000))
  const summary = [
    `Action: ${opts.action}`,
    `Namespace: ${opts.namespace}`,
    opts.details ? `Details: ${opts.details}` : null,
    'Allow this operation?',
  ]
    .filter(Boolean)
    .join('\\n')

  const script = `display dialog ${JSON.stringify(summary)} buttons {"Deny", "Allow"} default button "Deny" with title "onenv" giving up after ${timeoutSeconds}`

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    return stdout.includes('button returned:Allow') && !stdout.includes('gave up:true')
  } catch {
    return false
  }
}

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}
