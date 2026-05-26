#!/usr/bin/env node
import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'
import { Command } from 'commander'
import { buildFile } from './commands/build-file.js'
import { registerCheckCommand } from './commands/check.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerEditCommand } from './commands/edit.js'
import { registerGetCommand } from './commands/get.js'
import { ROOT_HELP_EXAMPLES } from './commands/help-examples.js'
import { registerImportCommand } from './commands/import.js'
import { registerMigrateCommand } from './commands/migrate/index.js'
import { printPrime } from './commands/prime.js'
import { LOGO } from './commands/prime-logo.js'
import { bindChildCleanup, prepareFileInjections } from './commands/run-files.js'
import { registerSetCommand } from './commands/set.js'
import { runTui } from './commands/tui.js'
import { registerUnsetCommand } from './commands/unset.js'
import {
  disableVar,
  enableVar,
  exportEnabledValuesStrict,
  getNamespaces,
  getNamespaceVars,
} from './index.js'
import { validationError } from './lib/errors.js'
import {
  getNamespaceVarsWithFingerprints,
  getNamespaceVarsWithMeta,
} from './lib/manager-service.js'
import { ensureServiceAccountToken } from './lib/op-token.js'
import { handleError, output, setJsonMode, success } from './lib/output.js'
import { shouldUseJsonOutput } from './lib/output-mode.js'
import { readProjectConfig, writeProjectConfig } from './lib/project-config.js'
import { resolveRef, storeRefs } from './lib/ref-store.js'
import type { NamespaceVar } from './lib/types.js'
import { validateKey, validateNamespace } from './lib/validation.js'
import { getPackageVersion } from './lib/version.js'

const program = new Command()
  .name('onenv')
  .version(getPackageVersion())
  .description('Manage 1Password-backed variables with an interactive TUI and scriptable commands.')
  .option('--json', 'Force JSON output (auto-enabled when piped, except get)')
  .addHelpText('before', `${LOGO}\n`)
  .addHelpText('after', ROOT_HELP_EXAMPLES)

function requireKeys(keys: string[], command: string): void {
  if (keys.length === 0) {
    throw validationError(
      'At least one key is required',
      `Provide key names as arguments: onenv ${command} <namespace> <key...>`,
    )
  }
}

function argsAfterDoubleDash(): string[] | null {
  const dashIndex = process.argv.indexOf('--')
  return dashIndex === -1 ? null : process.argv.slice(dashIndex + 1)
}

program
  .command('prime')
  .description('Print agent primer (XML on TTY, Markdown when piped, JSON with --json)')
  .option(
    '--no-detect',
    'Skip the cwd snapshot block (project marker, env files, .onenv.json status)',
  )
  .action(async (options: { detect: boolean }) => {
    const explicitJson = Boolean(program.opts().json)
    const format = explicitJson ? 'json' : process.stdout.isTTY ? 'xml' : 'md'
    await printPrime(format, { detect: options.detect })
  })

program
  .command('tui')
  .description('Open interactive terminal UI')
  .action(async () => {
    await runTui()
  })

program
  .command('list')
  .description('List namespaces or variables in a namespace')
  .argument('[namespace]', 'Namespace (supports @refs)')
  .option('--groups', 'Group keys by their group field (slower: fetches metadata per item)')
  .option('--meta', 'Include group, path, type, and sha256 fingerprint per key (slower)')
  .action(
    async (rawNamespace: string | undefined, options: { groups?: boolean; meta?: boolean }) => {
      if (!rawNamespace) {
        const namespaces = await getNamespaces()
        await storeRefs(namespaces)
        output(namespaces)
        return
      }
      const namespace = validateNamespace(await resolveRef(rawNamespace))
      await storeRefs([namespace])
      if (options.groups) {
        output(groupVars(await getNamespaceVarsWithMeta(namespace)))
        return
      }
      if (options.meta) {
        output(await getNamespaceVarsWithFingerprints(namespace))
        return
      }
      output(await getNamespaceVars(namespace))
    },
  )
  .addHelpText(
    'after',
    `
Examples:
  $ onenv list
      List every namespace onenv knows about
  $ onenv list aws
      List variables in the aws namespace
  $ onenv list aws --meta
      Include group/path/type plus sha256 fingerprints
  $ onenv list aws --groups
      Bucket vars by their group field`,
  )

function groupVars(vars: NamespaceVar[]): Record<string, NamespaceVar[]> {
  const buckets: Record<string, NamespaceVar[]> = {}
  for (const v of vars) {
    const g = v.group ?? '(ungrouped)'
    if (!buckets[g]) buckets[g] = []
    buckets[g].push(v)
  }
  return buckets
}

registerGetCommand(program)
registerSetCommand(program)
registerEditCommand(program)
registerUnsetCommand(program)
registerCheckCommand(program)
registerDoctorCommand(program)

program
  .command('disable')
  .description('Disable one or more variables without deleting')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to disable')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'disable')
    const namespace = validateNamespace(await resolveRef(rawNamespace))
    const safeKeys = keys.map(validateKey)
    for (const key of safeKeys) {
      await disableVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Disabled ${safeKeys.length} variable(s) in ${namespace}`, {
      namespace,
      keys: safeKeys,
    })
  })
  .addHelpText(
    'after',
    `
Examples:
  $ onenv disable aws AWS_OLD_KEY
      Stop exporting AWS_OLD_KEY without deleting it
  $ onenv disable aws AWS_OLD_KEY AWS_OLDER_KEY
      Disable multiple keys at once`,
  )

program
  .command('enable')
  .description('Re-enable one or more previously disabled variables')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to enable')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'enable')
    const namespace = validateNamespace(await resolveRef(rawNamespace))
    const safeKeys = keys.map(validateKey)
    for (const key of safeKeys) {
      await enableVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Enabled ${safeKeys.length} variable(s) in ${namespace}`, { namespace, keys: safeKeys })
  })
  .addHelpText(
    'after',
    `
Examples:
  $ onenv enable aws AWS_OLD_KEY
      Re-enable a previously disabled key
  $ onenv enable aws AWS_OLD_KEY AWS_OLDER_KEY
      Re-enable multiple keys at once`,
  )

registerImportCommand(program)
registerMigrateCommand(program)

program
  .command('build-file')
  .description('Reassemble a grouped JSON file from onenv keys')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .requiredOption('-g, --group <name>', 'Group name to rebuild')
  .option('-o, --out <path>', 'Output path (default: stdout)')
  .option('--indent <n>', 'JSON indent width (default: 2)', (v) => Number.parseInt(v, 10), 2)
  .action(
    async (rawNamespace: string, options: { group: string; out?: string; indent: number }) => {
      const namespace = validateNamespace(await resolveRef(rawNamespace))
      await buildFile(namespace, options.group, { out: options.out, indent: options.indent })
      await storeRefs([namespace])
      if (options.out) {
        success(`Wrote ${options.out}`, {
          namespace,
          group: options.group,
          out: options.out,
        })
      }
    },
  )
  .addHelpText(
    'after',
    `
Examples:
  $ onenv build-file oauth --group client_secret
      Reassemble the JSON file and print it to stdout
  $ onenv build-file oauth --group client_secret --out ./client_secret.json
      Write the reassembled JSON to a file`,
  )

program
  .command('init')
  .description('Set up .onenv.json for the current project')
  .action(async () => {
    const namespaces = await getNamespaces()
    if (namespaces.length === 0) {
      throw validationError(
        'No namespaces found',
        'Create variables first: onenv set <namespace> <key>',
      )
    }

    const selected = await p.multiselect({
      message: 'Which namespaces does this project need?',
      options: namespaces.map((ns) => ({ value: ns, label: ns })),
      required: true,
    })
    if (p.isCancel(selected)) return

    const path = await writeProjectConfig({
      namespaces: (selected as string[]).map(validateNamespace),
    })
    success(`Created ${path}`)
  })
  .addHelpText(
    'after',
    `
Examples:
  $ onenv init
      Interactive picker — choose namespaces for .onenv.json`,
  )

program
  .command('run')
  .description('Run project command with secrets injected from .onenv.json')
  .argument('[-- command...]', 'Command to run with exported vars as env')
  .option(
    '-f, --file <spec>',
    'Materialize a grouped JSON and expose its path: [namespace/]group:ENV_VAR',
    collectOption,
    [] as string[],
  )
  .option(
    '-w, --file-rw <spec>',
    'Same as --file, but write back to onenv on clean exit: [namespace/]group:ENV_VAR',
    collectOption,
    [] as string[],
  )
  .allowExcessArguments(true)
  .action(async (_commandArgs: string[], options: { file: string[]; fileRw: string[] }) => {
    const config = await readProjectConfig()
    const values = await exportEnabledValuesStrict(config.namespaces)
    const cmd = argsAfterDoubleDash()
    if (!cmd || cmd.length === 0) {
      throw validationError('No command provided after --', 'onenv run -- node app.js')
    }
    const { fileEnv, injections } = await prepareFileInjections(
      options.file ?? [],
      options.fileRw ?? [],
      config.namespaces,
    )
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...values, ...fileEnv },
    })
    bindChildCleanup(child, injections)
  })
  .addHelpText(
    'after',
    `
Examples:
  $ onenv run -- node app.js
      Inject .onenv.json namespaces as env vars and run the command
  $ onenv run --file gcp-sa:GOOGLE_APPLICATION_CREDENTIALS -- python upload.py
      Materialize a grouped JSON to a tempfile and expose its path
  $ onenv run --file-rw oauth/client_secret:GOOGLE_CREDS -- python refresh.py
      Same as --file, but write the tempfile back to onenv on clean exit`,
  )

function collectOption(value: string, prev: string[]): string[] {
  return [...prev, value]
}

program
  .command('export')
  .description('Export enabled variable values as JSON, or run a command with them injected')
  .argument('<namespaces>', 'Comma-separated namespaces, e.g. aws,project (supports @refs)')
  .argument('[-- command...]', 'Command to run with exported vars as env')
  .allowExcessArguments(true)
  .action(async (rawNamespaces: string) => {
    const parts = rawNamespaces
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      throw validationError('At least one namespace is required', 'onenv export aws,project')
    }
    const namespaces = (await Promise.all(parts.map(resolveRef))).map(validateNamespace)
    await storeRefs(namespaces)
    const values = await exportEnabledValuesStrict(namespaces)
    const cmd = argsAfterDoubleDash()

    if (!cmd) {
      output(values)
      return
    }

    if (cmd.length === 0) {
      throw validationError(
        'No command provided after --',
        'onenv export porkbun -- python demo.py',
      )
    }

    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...values },
    })
    child.on('close', (code) => process.exit(code ?? 1))
  })
  .addHelpText(
    'after',
    `
Examples:
  $ onenv export aws,cloudflare
      Print enabled vars from both namespaces as JSON
  $ onenv export aws -- terraform apply
      Inject aws vars into the environment for a single command`,
  )

// Intent-first routing: bare argument → list namespace, no args → tui
program
  .argument('[input]', 'Namespace name or @ref → auto-routes to list')
  .action(async (input?: string) => {
    if (!input) {
      await runTui()
      return
    }
    const namespace = await resolveRef(input)
    const safeNamespace = validateNamespace(namespace)
    const vars = await getNamespaceVars(safeNamespace)
    await storeRefs([safeNamespace])
    output(vars)
  })

program.hook('preAction', (_thisCommand, actionCommand) => {
  const enable = shouldUseJsonOutput({
    explicitJson: Boolean(program.opts().json),
    isTty: Boolean(process.stdout.isTTY),
    commandName: actionCommand.name(),
  })
  if (enable) setJsonMode(true)
})

ensureServiceAccountToken()
  .then(() => program.parseAsync())
  .catch(handleError)
