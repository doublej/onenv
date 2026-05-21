import type { Command } from 'commander'
import { editVar } from '../index.js'
import { success } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { readValueFromPrompt } from './_prompt.js'

export interface EditOptions {
  valueStdin?: boolean
}

export async function editAction(
  rawNamespace: string,
  key: string,
  _options: EditOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKey = validateKey(key)
  const next = await readValueFromPrompt(namespace, safeKey)
  await editVar(namespace, safeKey, next)
  await storeRefs([namespace])
  success(`Updated ${namespace}.${safeKey}`, { namespace, key: safeKey })
}

export function registerEditCommand(program: Command): void {
  program
    .command('edit')
    .description('Edit an existing variable value')
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('<key>', 'Variable name')
    .action(editAction)
}
