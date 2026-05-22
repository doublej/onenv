import { suggestNamespaceFromPrefix } from './prefix-table.js'
import type { Framework, KeyRole } from './types.js'

const CONFIG_KEYS = new Set([
  'NODE_ENV',
  'PORT',
  'HOST',
  'HOSTNAME',
  'DEBUG',
  'LOG_LEVEL',
  'LOG_FORMAT',
  'TZ',
  'CI',
])

const SECRET_HINTS = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_PASS|_DSN|_CREDENTIAL|_PRIVATE)/

export function classifyKey(key: string, framework: Framework): KeyRole {
  if (framework.public_prefix && key.startsWith(framework.public_prefix)) return 'public'
  if (CONFIG_KEYS.has(key)) return 'config'
  if (SECRET_HINTS.test(key)) return 'secret'
  // Conservative default: treat unknown keys as secret. Easier to override
  // down to public/config than to recover from a leaked secret.
  return 'secret'
}

export function suggestNamespace(key: string, fallback: string): string {
  return suggestNamespaceFromPrefix(key) ?? fallback
}
