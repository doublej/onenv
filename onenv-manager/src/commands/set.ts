import type { Command } from 'commander'
import { createOrUpdateVar } from '../index.js'
import { validationError } from '../lib/errors.js'
import { success } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { validateKey, validateNamespace } from '../lib/validation.js'
import { readValueFromPrompt, readValueFromStdin } from './_prompt.js'

export interface SetOptions {
  valueStdin?: boolean
}

async function resolveValue(namespace: string, key: string, options: SetOptions): Promise<string> {
  if (options.valueStdin) return readValueFromStdin()
  if (!process.stdin.isTTY) {
    throw validationError(
      'Refusing to read from non-TTY stdin without --value-stdin',
      'Use --value-stdin to read a piped value, or run interactively in a TTY',
    )
  }
  return readValueFromPrompt(namespace, key)
}

export async function setAction(
  rawNamespace: string,
  key: string,
  options: SetOptions,
): Promise<void> {
  const namespace = validateNamespace(await resolveRef(rawNamespace))
  const safeKey = validateKey(key)
  const next = await resolveValue(namespace, safeKey, options)
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
    .option('--value-stdin', 'Read value from stdin (strips one trailing newline)')
    .action(setAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv set aws AWS_SECRET_ACCESS_KEY
      Interactive prompt for the value (TTY only)
  $ echo -n "$AWS_SECRET" | onenv set aws AWS_SECRET_ACCESS_KEY --value-stdin
      Read the value from stdin, no shell history
  $ op read "op://Private/aws/credential" | onenv set aws AWS_SECRET_ACCESS_KEY --value-stdin
      Pipe directly from a 1Password reference`,
    )
}
