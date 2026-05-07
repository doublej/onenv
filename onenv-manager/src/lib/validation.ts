import { validationError } from './errors.js'

const NAMESPACE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateNamespace(namespace: string): string {
  const trimmed = namespace.trim()
  if (trimmed.length === 0 || trimmed.length > 128 || !NAMESPACE_RE.test(trimmed)) {
    throw validationError('Invalid namespace', 'Use letters, numbers, dots, underscores, or dashes')
  }
  return trimmed
}

export function validateKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length === 0 || trimmed.length > 128 || !KEY_RE.test(trimmed)) {
    throw validationError('Invalid key', 'Use shell-style names like AWS_SECRET_ACCESS_KEY')
  }
  return trimmed
}
