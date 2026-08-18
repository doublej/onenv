import { spawn } from 'node:child_process'
import type { Command } from 'commander'
import { exportEnabledValuesStrict } from '../index.js'
import { argsAfterDoubleDash } from '../lib/argv.js'
import { validationError } from '../lib/errors.js'
import { output } from '../lib/output.js'
import { resolveRef, storeRefs } from '../lib/ref-store.js'
import { injectedEnv, renderShellExports } from '../lib/shell-export.js'
import { validateNamespace } from '../lib/validation.js'

export interface ExportOptions {
  reveal?: boolean
  format?: string
}

export async function resolveNamespaceList(raw: string): Promise<string[]> {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    throw validationError('At least one namespace is required', 'onenv export aws,project')
  }
  return (await Promise.all(parts.map(resolveRef))).map(validateNamespace)
}

function runWithValues(cmd: string[], values: Record<string, string>, namespaces: string[]): void {
  if (cmd.length === 0) {
    throw validationError('No command provided after --', 'onenv export porkbun -- python demo.py')
  }
  const child = spawn(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    env: injectedEnv(values, namespaces),
  })
  child.on('close', (code) => process.exit(code ?? 1))
}

// Validate the print request up front, before any 1Password round-trip, so a
// missing --reveal or bad --format fails instantly instead of after the fetch.
export function assertRevealAllowed(options: ExportOptions): void {
  if (!options.reveal) {
    throw validationError(
      'Refusing to print secret values without --reveal',
      'Inject instead: onenv export <ns> -- <cmd> · or eval "$(onenv export <ns> --reveal --format shell)"',
    )
  }
  if (options.format !== 'json' && options.format !== 'shell') {
    throw validationError(
      `Unknown --format "${options.format}"`,
      'Use --format json or --format shell',
    )
  }
}

function printValues(
  values: Record<string, string>,
  format: string | undefined,
  namespaces: string[],
): void {
  if (format === 'shell') {
    process.stdout.write(renderShellExports(values, namespaces))
    return
  }
  output(values)
}

export function registerExportCommand(program: Command): void {
  const command = program
    .command('export')
    .description(
      'Inject enabled variables into a command, or print them with --reveal (add --format shell to eval into your shell)',
    )
    .argument('<namespaces>', 'Comma-separated namespaces, e.g. aws,project (supports @refs)')
    .argument('[-- command...]', 'Command to run with exported vars as env')
    .option(
      '--reveal',
      'Print secret values to stdout (required to print; not needed with -- <cmd>)',
    )
    .option('--format <fmt>', 'Output shape with --reveal: json (default) or shell', 'json')
    .allowExcessArguments(true)
    .action(async (rawNamespaces: string) => {
      const cmd = argsAfterDoubleDash()
      const options = command.opts<ExportOptions>()
      if (!cmd) assertRevealAllowed(options)
      const namespaces = await resolveNamespaceList(rawNamespaces)
      await storeRefs(namespaces)
      const values = await exportEnabledValuesStrict(namespaces)
      if (cmd) {
        runWithValues(cmd, values, namespaces)
        return
      }
      printValues(values, options.format, namespaces)
    })
  command.addHelpText(
    'after',
    `
Examples:
  $ onenv export aws -- terraform apply
      Inject aws vars into a command (never printed; no --reveal needed)
  $ onenv export aws -- $SHELL
      Start a subshell with aws vars loaded (see also: onenv shell)
  $ onenv export aws --reveal
      Print enabled vars as JSON — refuses without --reveal
  $ eval "$(onenv export aws --reveal --format shell)"
      Load the namespace's vars into your current shell`,
  )
}
