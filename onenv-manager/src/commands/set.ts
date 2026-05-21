import type { Command } from 'commander'
import { createOrUpdateVar } from '../index.js'
import { success } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { readValueFromPrompt } from './_prompt.js'

export interface SetOptions {
  valueStdin?: boolean
}

export async function setAction(
  rawNamespace: string,
  key: string,
  _options: SetOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKey = validateKey(key)
  const next = await readValueFromPrompt(namespace, safeKey)
  await createOrUpdateVar(namespace, safeKey, next)
  await storeRefs([namespace])
  success(`Saved ${namespace}.${safeKey}`, { namespace, key: safeKey })
}

export function registerSetCommand(program: Command): void {
  program
    .command('set')
    .description('Create or update a variable')
    .argument('<namespace>', 'Namespace (supports @refs)')
    .argument('<key>', 'Variable name')
    .action(setAction)
}
