import * as p from '@clack/prompts'
import chalk from 'chalk'
import {
  createOrUpdateVar,
  disableVar,
  editVar,
  enableVar,
  getNamespaceVarsWithValues,
  getNamespaces,
  removeVar,
} from '../lib/manager-service.js'
import type { NamespaceVar } from '../lib/types.js'

type Action = 'set' | 'edit' | 'unset' | 'disable' | 'enable' | 'switch' | 'exit'

function expectPromptString(value: unknown): string {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  if (typeof value !== 'string') {
    throw new Error('Prompt returned unexpected value')
  }

  return value
}

function formatRows(vars: NamespaceVar[]): string {
  if (vars.length === 0) {
    return chalk.dim('No variables in this namespace yet.')
  }

  const rows = vars.map((item) => {
    const status = item.disabled ? chalk.yellow('disabled') : chalk.green('enabled ')
    const preview = item.value
      ? `${'*'.repeat(Math.min(item.value.length, 8))}${item.value.length > 8 ? '…' : ''}`
      : ''

    return `${status}  ${item.key}${preview ? `  ${chalk.dim(preview)}` : ''}`
  })

  return rows.join('\n')
}

async function chooseNamespace(): Promise<string> {
  const namespaces = await getNamespaces()
  const selected = expectPromptString(
    await p.select({
      message: 'Select a namespace',
      options: [
        ...namespaces.map((name) => ({ label: name, value: name })),
        { label: 'Create new namespace', value: '__new__' },
      ],
      initialValue: namespaces[0] ?? '__new__',
    }),
  )

  if (selected !== '__new__') {
    return selected
  }

  const created = expectPromptString(
    await p.text({
      message: 'Namespace name',
      placeholder: 'project-name',
      validate(value) {
        return value.trim().length > 0 ? undefined : 'Namespace is required'
      },
    }),
  )

  return created.trim()
}

async function chooseVar(namespace: string, action: string): Promise<string | null> {
  const vars = await getNamespaceVarsWithValues(namespace)
  if (vars.length === 0) {
    p.log.warn('No variables found in this namespace.')
    return null
  }

  return expectPromptString(
    await p.select({
      message: `${action}: pick a variable`,
      options: vars.map((item) => ({
        label: `${item.key} (${item.disabled ? 'disabled' : 'enabled'})`,
        value: item.key,
      })),
    }),
  )
}

async function promptSecret(message: string): Promise<string> {
  return expectPromptString(
    await p.password({
      message,
      mask: '•',
      validate(value) {
        return value.length > 0 ? undefined : 'Value is required'
      },
    }),
  )
}

async function printNamespace(namespace: string): Promise<void> {
  const vars = await getNamespaceVarsWithValues(namespace)
  p.log.info(`Namespace: ${chalk.cyan(namespace)}`)
  p.log.message(formatRows(vars))
}

async function handleSet(namespace: string): Promise<void> {
  const key = expectPromptString(
    await p.text({
      message: 'Variable name',
      placeholder: 'AWS_SECRET_ACCESS_KEY',
      validate(value) {
        return value.trim().length > 0 ? undefined : 'Variable name is required'
      },
    }),
  ).trim()

  const value = await promptSecret(`${namespace}.${key} value`)
  await createOrUpdateVar(namespace, key, value)
  p.log.success(`Saved ${namespace}.${key}`)
}

async function handleEdit(namespace: string): Promise<void> {
  const key = await chooseVar(namespace, 'Edit')
  if (!key) {
    return
  }

  const nextValue = await promptSecret(`New value for ${namespace}.${key}`)
  await editVar(namespace, key, nextValue)
  p.log.success(`Updated ${namespace}.${key}`)
}

async function handleUnset(namespace: string): Promise<void> {
  const key = await chooseVar(namespace, 'Unset')
  if (!key) {
    return
  }

  const confirmed = await p.confirm({
    message: `Remove ${namespace}.${key} from 1Password?`,
    initialValue: false,
  })

  if (p.isCancel(confirmed)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  if (!confirmed) {
    p.log.info('Skipped')
    return
  }

  await removeVar(namespace, key)
  p.log.success(`Unset ${namespace}.${key}`)
}

async function handleDisable(namespace: string): Promise<void> {
  const vars = await getNamespaceVarsWithValues(namespace)
  const enabled = vars.filter((item) => !item.disabled)

  if (enabled.length === 0) {
    p.log.warn('No enabled variables to disable.')
    return
  }

  const key = expectPromptString(
    await p.select({
      message: 'Disable: pick a variable',
      options: enabled.map((item) => ({ label: item.key, value: item.key })),
    }),
  )

  await disableVar(namespace, key)
  p.log.success(`Disabled ${namespace}.${key}`)
}

async function handleEnable(namespace: string): Promise<void> {
  const vars = await getNamespaceVarsWithValues(namespace)
  const disabled = vars.filter((item) => item.disabled)

  if (disabled.length === 0) {
    p.log.warn('No disabled variables to enable.')
    return
  }

  const key = expectPromptString(
    await p.select({
      message: 'Enable: pick a variable',
      options: disabled.map((item) => ({ label: item.key, value: item.key })),
    }),
  )

  await enableVar(namespace, key)
  p.log.success(`Enabled ${namespace}.${key}`)
}

async function executeAction(namespace: string, action: Action): Promise<string> {
  const handlers: Record<Exclude<Action, 'switch' | 'exit'>, () => Promise<void>> = {
    set: async () => await handleSet(namespace),
    edit: async () => await handleEdit(namespace),
    unset: async () => await handleUnset(namespace),
    disable: async () => await handleDisable(namespace),
    enable: async () => await handleEnable(namespace),
  }

  if (action === 'switch') {
    return await chooseNamespace()
  }

  if (action === 'exit') {
    return namespace
  }

  await handlers[action]()
  return namespace
}

async function chooseAction(): Promise<Action> {
  return expectPromptString(
    await p.select({
      message: 'What do you want to do?',
      options: [
        { label: 'Set variable', value: 'set' },
        { label: 'Edit variable', value: 'edit' },
        { label: 'Unset variable', value: 'unset' },
        { label: 'Disable variable', value: 'disable' },
        { label: 'Enable variable', value: 'enable' },
        { label: 'Switch namespace', value: 'switch' },
        { label: 'Exit', value: 'exit' },
      ],
    }),
  ) as Action
}

export async function runTui(): Promise<void> {
  p.intro(chalk.bold('onenv-manager'))

  let namespace = await chooseNamespace()

  while (true) {
    await printNamespace(namespace)
    const action = await chooseAction()

    if (action === 'exit') {
      break
    }

    namespace = await executeAction(namespace, action)
  }

  p.outro('Done')
}
