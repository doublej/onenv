import * as p from '@clack/prompts'
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

async function confirmOrAbort(namespace: string, safeKeys: string[]): Promise<boolean> {
  if (!process.stdout.isTTY) {
    throw validationError(
      'Refusing to unset non-interactively without --yes',
      `onenv unset ${namespace} ${safeKeys.join(' ')} --yes`,
    )
  }
  const result = await p.confirm({
    message: `Delete ${safeKeys.length} variable(s) in ${namespace}? (${safeKeys.join(', ')})`,
    initialValue: false,
  })
  if (p.isCancel(result) || result === false) {
    success('Cancelled')
    return false
  }
  return true
}

export async function unsetAction(
  rawNamespace: string,
  keys: string[],
  options: UnsetOptions,
): Promise<void> {
  requireKeys(keys)
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKeys = keys.map(validateKey)
  if (!options.yes) {
    const proceed = await confirmOrAbort(namespace, safeKeys)
    if (!proceed) return
  }
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
    .option('-y, --yes', 'Skip confirmation (required in non-interactive contexts)')
    .action(unsetAction)
}
