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
