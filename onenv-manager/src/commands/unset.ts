import type { Command } from 'commander'
import { removeVar } from '../index.js'
import { validationError } from '../lib/errors.js'
import { success } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'

export interface UnsetOptions {
  yes?: boolean
}

function requireKeys(keys: string[]): void {
  if (keys.length === 0) {
    throw validationError(
      'At least one key is required',
      'Provide key names as arguments: onenv unset <namespace> <key...>',
    )
  }
}

export async function unsetAction(
  rawNamespace: string,
  keys: string[],
  _options: UnsetOptions,
): Promise<void> {
  requireKeys(keys)
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKeys = keys.map(validateKey)
  for (const key of safeKeys) {
    await removeVar(namespace, key)
  }
  await storeRefs([namespace])
  success(`Unset ${safeKeys.length} variable(s) in ${namespace}`, { namespace, keys: safeKeys })
}

export function registerUnsetCommand(program: Command): void {
  program
    .command('unset')
    .description('Delete one or more variables from 1Password')
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('<keys...>', 'Variable names to remove')
    .action(unsetAction)
}
