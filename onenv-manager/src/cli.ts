#!/usr/bin/env node
import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'
import { Command } from 'commander'
import { buildFile } from './commands/build-file.js'
import { importJsonFile } from './commands/import.js'
import { printPrime } from './commands/prime.js'
import { bindChildCleanup, prepareFileInjections } from './commands/run-files.js'
import { runTui } from './commands/tui.js'
import {
  createOrUpdateVar,
  disableVar,
  editVar,
  enableVar,
  exportEnabledValues,
  getNamespaces,
  getNamespaceVars,
  removeVar,
} from './index.js'
import { validationError } from './lib/errors.js'
import { getNamespaceVarsWithMeta } from './lib/manager-service.js'
import { ensureServiceAccountToken } from './lib/op-token.js'
import { handleError, isJsonMode, output, setJsonMode, success } from './lib/output.js'
import { readProjectConfig, writeProjectConfig } from './lib/project-config.js'
import { resolveRef, storeRefs } from './lib/ref-store.js'
import type { NamespaceVar } from './lib/types.js'
import { validateKey, validateNamespace } from './lib/validation.js'
import { getPackageVersion } from './lib/version.js'

const program = new Command()
  .name('onenv')
  .version(getPackageVersion())
  .description('Manage 1Password-backed variables with an interactive TUI and scriptable commands.')
  .option('--json', 'Force JSON output (default when piped)')

function requireKeys(keys: string[], command: string): void {
  if (keys.length === 0) {
    throw validationError(
      'At least one key is required',
      `Provide key names as arguments: onenv ${command} <namespace> <key...>`,
    )
  }
}

function assertValue(input: unknown): string {
  if (typeof input !== 'string' || p.isCancel(input) || input.length === 0) {
    throw validationError('Value is required')
  }
  return input
}

async function readValueFromPrompt(namespace: string, key: string): Promise<string> {
  const value = await p.password({
    message: `${namespace}.${key} value`,
    mask: '•',
    validate(candidate) {
      return candidate && candidate.length > 0 ? undefined : 'Value is required'
    },
  })
  return assertValue(value)
}

function argsAfterDoubleDash(): string[] | null {
  const dashIndex = process.argv.indexOf('--')
  return dashIndex === -1 ? null : process.argv.slice(dashIndex + 1)
}

program
  .command('prime')
  .description('Print agent primer (XML by default; JSON when --json or stdout is not a TTY)')
  .action(() => {
    printPrime(isJsonMode())
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
  .action(async (rawNamespace: string | undefined, options: { groups?: boolean }) => {
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
    output(await getNamespaceVars(namespace))
  })

function groupVars(vars: NamespaceVar[]): Record<string, NamespaceVar[]> {
  const buckets: Record<string, NamespaceVar[]> = {}
  for (const v of vars) {
    const g = v.group ?? '(ungrouped)'
    if (!buckets[g]) buckets[g] = []
    buckets[g].push(v)
  }
  return buckets
}

program
  .command('set')
  .description('Create or update a variable')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<key>', 'Variable name')
  .action(async (rawNamespace: string, key: string) => {
    const namespace = validateNamespace(await resolveRef(rawNamespace))
    const safeKey = validateKey(key)
    const next = await readValueFromPrompt(namespace, safeKey)
    await createOrUpdateVar(namespace, safeKey, next)
    await storeRefs([namespace])
    success(`Saved ${namespace}.${safeKey}`, { namespace, key: safeKey })
  })

program
  .command('edit')
  .description('Edit an existing variable value')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<key>', 'Variable name')
  .action(async (rawNamespace: string, key: string) => {
    const namespace = validateNamespace(await resolveRef(rawNamespace))
    const safeKey = validateKey(key)
    const next = await readValueFromPrompt(namespace, safeKey)
    await editVar(namespace, safeKey, next)
    await storeRefs([namespace])
    success(`Updated ${namespace}.${safeKey}`, { namespace, key: safeKey })
  })

program
  .command('unset')
  .description('Delete one or more variables from 1Password')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to remove')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'unset')
    const namespace = validateNamespace(await resolveRef(rawNamespace))
    const safeKeys = keys.map(validateKey)
    for (const key of safeKeys) {
      await removeVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Unset ${safeKeys.length} variable(s) in ${namespace}`, { namespace, keys: safeKeys })
  })

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

program
  .command('import')
  .description('Flatten a JSON file into onenv keys with reassembly metadata')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<file>', 'Path to a JSON file to import')
  .option('-g, --group <name>', 'Group name (defaults to filename without extension)')
  .option('-k, --keys <strategy>', 'Key naming: upper-snake (default) or leaf', 'upper-snake')
  .option('-p, --prefix <prefix>', 'Prefix prepended to every derived key')
  .option('--dry-run', 'Print the import plan without writing')
  .action(
    async (
      rawNamespace: string,
      file: string,
      options: { group?: string; keys?: string; prefix?: string; dryRun?: boolean },
    ) => {
      const namespace = validateNamespace(await resolveRef(rawNamespace))
      const strategy = options.keys === 'leaf' ? 'leaf' : 'upper-snake'
      const result = await importJsonFile(namespace, file, {
        group: options.group,
        keys: strategy,
        prefix: options.prefix,
        dryRun: options.dryRun,
      })
      await storeRefs([namespace])
      if (options.dryRun) {
        output({ namespace, group: result.group, plan: result.rows })
        return
      }
      success(`Imported ${result.rows.length} keys into ${namespace} (group: ${result.group})`, {
        namespace,
        group: result.group,
        count: result.rows.length,
      })
    },
  )

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
    const values = await exportEnabledValues(config.namespaces)
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
    const values = await exportEnabledValues(namespaces)
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

program.hook('preAction', () => {
  const opts = program.opts()
  if (opts.json || !process.stdout.isTTY) {
    setJsonMode(true)
  }
})

ensureServiceAccountToken()
  .then(() => program.parseAsync())
  .catch(handleError)
