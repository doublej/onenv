import { spawn } from 'node:child_process'
import type { Command } from 'commander'
import { exportEnabledValuesStrict } from '../index.js'
import { validationError } from '../lib/errors.js'
import { readProjectConfig } from '../lib/project-config.js'
import { storeRefs } from '../lib/ref-store.js'
import { injectedEnv } from '../lib/shell-export.js'
import { resolveNamespaceList } from './export.js'

// Nested primed shells hide which namespaces are actually loaded (the outer
// marker would be silently overwritten), so refuse instead.
export function assertNotNested(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ONENV_ACTIVE) {
    throw validationError(
      `Already inside an onenv shell (ONENV_ACTIVE=${env.ONENV_ACTIVE})`,
      'Run commands directly — secrets are already loaded. `exit` first to start a session with different namespaces.',
    )
  }
}

// Explicit namespaces win; otherwise fall back to .onenv.json, skipping
// fileOnlyNamespaces exactly like `onenv run` does.
export async function resolveShellNamespaces(raw?: string): Promise<string[]> {
  if (raw) return resolveNamespaceList(raw)
  const config = await readProjectConfig()
  const fileOnly = new Set(config.fileOnlyNamespaces)
  return config.namespaces.filter((ns) => !fileOnly.has(ns))
}

export function registerShellCommand(program: Command): void {
  program
    .command('shell')
    .description(
      'Start a subshell with secrets injected for the whole session (marked with ONENV_ACTIVE)',
    )
    .argument(
      '[namespaces]',
      'Comma-separated namespaces, e.g. aws,project (supports @refs); defaults to .onenv.json',
    )
    .action(async (rawNamespaces?: string) => {
      assertNotNested()
      const namespaces = await resolveShellNamespaces(rawNamespaces)
      await storeRefs(namespaces)
      const values = await exportEnabledValuesStrict(namespaces)
      const child = spawn(process.env.SHELL ?? '/bin/sh', [], {
        stdio: 'inherit',
        env: injectedEnv(values, namespaces),
      })
      child.on('close', (code) => process.exit(code ?? 1))
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv shell
      Subshell with the .onenv.json namespaces loaded for the whole session
  $ onenv shell aws,project
      Subshell with explicit namespaces (supports @refs)

The subshell carries ONENV_ACTIVE=<ns1,ns2,...> so tools (and \`onenv prime\`)
can tell the environment is primed. Nesting is refused — \`exit\` first.`,
    )
}
