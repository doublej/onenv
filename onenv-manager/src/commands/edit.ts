import type { Command } from 'commander'
import { editVar } from '../index.js'
import { validationError } from '../lib/errors.js'
import { success } from '../lib/output.js'
import { confirmMutation } from '../lib/permission.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { readValueFromPrompt, readValueFromStdin } from './_prompt.js'

export interface EditOptions {
  valueStdin?: boolean
}

async function resolveValue(namespace: string, key: string, options: EditOptions): Promise<string> {
  if (options.valueStdin) return readValueFromStdin()
  if (!process.stdin.isTTY) {
    throw validationError(
      'Refusing to read from non-TTY stdin without --value-stdin',
      'Use --value-stdin to read a piped value, or run interactively in a TTY',
    )
  }
  return readValueFromPrompt(namespace, key)
}

export async function editAction(
  rawNamespace: string,
  key: string,
  options: EditOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKey = validateKey(key)
  const next = await resolveValue(namespace, safeKey, options)
  await confirmMutation({ action: 'edit', namespace, details: `key=${safeKey}` })
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
    .option('--value-stdin', 'Read value from stdin (strips one trailing newline)')
    .action(editAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv edit cloudflare CLOUDFLARE_API_TOKEN
      Interactive prompt for the new value (TTY only)
  $ pbpaste | onenv edit cloudflare CLOUDFLARE_API_TOKEN --value-stdin
      Replace the value with whatever is on the clipboard`,
    )
}
