import { text } from 'node:stream/consumers'
import * as p from '@clack/prompts'
import { validationError } from '../lib/errors.js'

export function assertValue(input: unknown): string {
  if (typeof input !== 'string' || p.isCancel(input) || input.length === 0) {
    throw validationError('Value is required')
  }
  return input
}

export async function readValueFromPrompt(namespace: string, key: string): Promise<string> {
  const value = await p.password({
    message: `${namespace}.${key} value`,
    mask: '•',
    validate(candidate) {
      return candidate && candidate.length > 0 ? undefined : 'Value is required'
    },
  })
  return assertValue(value)
}

export async function readValueFromStdin(): Promise<string> {
  const raw = await text(process.stdin)
  const stripped = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  if (stripped.length === 0) {
    throw validationError(
      'Empty stdin value',
      'Pipe a non-empty value: echo -n "secret" | onenv set <ns> <key> --value-stdin',
    )
  }
  return stripped
}
