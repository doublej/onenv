import chalk from 'chalk'
import { CliError } from './errors.js'

let jsonMode = false

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled
}

export function isJsonMode(): boolean {
  return jsonMode
}

export function output(data: unknown): void {
  // Compact single-line JSON (NDJSON-style): every structured payload — success
  // envelopes, error objects, data dumps — is one line, so `head -1` / `tail -1`
  // capture the whole thing instead of truncating a pretty-printed object to `}`.
  process.stdout.write(`${JSON.stringify(data)}\n`)
}

export function success(message: string, data?: Record<string, unknown>): void {
  if (jsonMode) {
    output({ ok: true, message, ...data })
    return
  }
  console.log(chalk.green(message))
}

export function warn(message: string): void {
  if (jsonMode) {
    output({ ok: true, message, warning: true })
    return
  }
  console.log(chalk.yellow(message))
}

export function handleError(error: unknown): never {
  if (error instanceof CliError) {
    printCliError(error)
  } else {
    const message = error instanceof Error ? error.message : String(error)
    printUnknownError(message)
  }
  process.exit(1)
}

function printCliError(error: CliError): void {
  if (jsonMode) {
    output(error.toJSON())
    return
  }
  console.error(`Error [${error.code}]: ${error.message}`)
  if (error.hint) console.error(`Hint: ${error.hint}`)
  if (error.suggestion) console.error(`Try: ${error.suggestion}`)
}

function printUnknownError(message: string): void {
  if (jsonMode) {
    output({ error: { code: 'INTERNAL', message, category: 'internal', retryable: false } })
    return
  }
  console.error(message)
}
