#!/usr/bin/env node
import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'
import { Command } from 'commander'
import { printPrime } from './commands/prime.js'
import { runTui } from './commands/tui.js'
import {
  createOrUpdateVar,
  disableVar,
  editVar,
  enableVar,
  exportEnabledValues,
  getNamespaceVars,
  getNamespaces,
  removeVar,
} from './index.js'
import { validationError } from './lib/errors.js'
import { ensureServiceAccountToken } from './lib/op-token.js'
import { handleError, output, setJsonMode, success } from './lib/output.js'
import { readProjectConfig, writeProjectConfig } from './lib/project-config.js'
import { resolveRef, storeRefs } from './lib/ref-store.js'

const program = new Command()
  .name('onenv')
  .version('0.2.0')
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
  if (typeof input !== 'string' || p.isCancel(input) || input.trim().length === 0) {
    throw validationError('Value is required')
  }
  return input.trim()
}

async function readValueFromPrompt(namespace: string, key: string): Promise<string> {
  const value = await p.password({
    message: `${namespace}.${key} value`,
    mask: '•',
    validate(candidate) {
      return candidate.length > 0 ? undefined : 'Value is required'
    },
  })
  return assertValue(value)
}

program
  .command('prime')
  .description('Print XML primer for agent consumption')
  .action(() => {
    printPrime()
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
  .action(async (rawNamespace?: string) => {
    if (!rawNamespace) {
      const namespaces = await getNamespaces()
      await storeRefs(namespaces)
      output(namespaces)
      return
    }
    const namespace = await resolveRef(rawNamespace)
    const vars = await getNamespaceVars(namespace)
    await storeRefs([namespace])
    output(vars)
  })

program
  .command('set')
  .description('Create or update a variable')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<key>', 'Variable name')
  .argument('[value]', 'Variable value (prompts if omitted)')
  .action(async (rawNamespace: string, key: string, value?: string) => {
    const namespace = await resolveRef(rawNamespace)
    const next = value ?? (await readValueFromPrompt(namespace, key))
    await createOrUpdateVar(namespace, key, next)
    await storeRefs([namespace])
    success(`Saved ${namespace}.${key}`, { namespace, key })
  })

program
  .command('edit')
  .description('Edit an existing variable value')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<key>', 'Variable name')
  .argument('[value]', 'Variable value (prompts if omitted)')
  .action(async (rawNamespace: string, key: string, value?: string) => {
    const namespace = await resolveRef(rawNamespace)
    const next = value ?? (await readValueFromPrompt(namespace, key))
    await editVar(namespace, key, next)
    await storeRefs([namespace])
    success(`Updated ${namespace}.${key}`, { namespace, key })
  })

program
  .command('unset')
  .description('Delete one or more variables from 1Password')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to remove')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'unset')
    const namespace = await resolveRef(rawNamespace)
    for (const key of keys) {
      await removeVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Unset ${keys.length} variable(s) in ${namespace}`, { namespace, keys })
  })

program
  .command('disable')
  .description('Disable one or more variables without deleting')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to disable')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'disable')
    const namespace = await resolveRef(rawNamespace)
    for (const key of keys) {
      await disableVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Disabled ${keys.length} variable(s) in ${namespace}`, { namespace, keys })
  })

program
  .command('enable')
  .description('Re-enable one or more previously disabled variables')
  .argument('<namespace>', 'Namespace (supports @refs)')
  .argument('<keys...>', 'Variable names to enable')
  .action(async (rawNamespace: string, keys: string[]) => {
    requireKeys(keys, 'enable')
    const namespace = await resolveRef(rawNamespace)
    for (const key of keys) {
      await enableVar(namespace, key)
    }
    await storeRefs([namespace])
    success(`Enabled ${keys.length} variable(s) in ${namespace}`, { namespace, keys })
  })

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

    const run = await p.text({
      message: 'Command to run (e.g. bun run dev, python app.py)',
      validate: (v) => (v.trim().length > 0 ? undefined : 'Required'),
    })
    if (p.isCancel(run)) return

    const path = await writeProjectConfig({
      namespaces: selected as string[],
      run: run.trim(),
    })
    success(`Created ${path}`)
  })

program
  .command('run')
  .description('Run project command with secrets injected from .onenv.json')
  .action(async () => {
    const config = await readProjectConfig()
    const values = await exportEnabledValues(config.namespaces)
    const parts = config.run.split(' ')

    const child = spawn(parts[0], parts.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...values },
    })
    child.on('close', (code) => process.exit(code ?? 1))
  })

program
  .command('export')
  .description('Export enabled variable values as JSON, or run a command with them injected')
  .argument('<namespaces>', 'Comma-separated namespaces, e.g. aws,project (supports @refs)')
  .argument('[-- command...]', 'Command to run with exported vars as env')
  .allowExcessArguments(true)
  .action(async (rawNamespaces: string) => {
    const dashIndex = process.argv.indexOf('--')
    const parts = rawNamespaces
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      throw validationError('At least one namespace is required', 'onenv export aws,project')
    }
    const namespaces = await Promise.all(parts.map(resolveRef))
    await storeRefs(namespaces)
    const values = await exportEnabledValues(namespaces)

    if (dashIndex === -1) {
      output(values)
      return
    }

    const cmd = process.argv.slice(dashIndex + 1)
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
    const vars = await getNamespaceVars(namespace)
    await storeRefs([namespace])
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
