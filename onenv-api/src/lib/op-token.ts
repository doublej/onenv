import { spawn } from 'node:child_process'

export async function resolveServiceAccountToken(): Promise<void> {
  const raw = process.env.OP_SERVICE_ACCOUNT_TOKEN
  if (!raw || !raw.startsWith('op://')) return

  const resolved = await opRead(raw)
  process.env.OP_SERVICE_ACCOUNT_TOKEN = resolved
}

async function opRead(reference: string): Promise<string> {
  const { OP_SERVICE_ACCOUNT_TOKEN: _omit, ...env } = process.env
  return await new Promise((resolve, reject) => {
    const child = spawn('op', ['read', reference], { stdio: ['pipe', 'pipe', 'pipe'], env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`op read ${reference} failed: ${stderr.trim()}`))
        return
      }
      resolve(stdout.trimEnd())
    })
    child.stdin.end()
  })
}
