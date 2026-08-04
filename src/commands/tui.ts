import * as p from '@clack/prompts'
import chalk from 'chalk'
import {
  createOrUpdateVar,
  disableVar,
  editVar,
  enableVar,
  getNamespaceVarsWithValues,
  removeVar,
} from '../lib/manager-service.js'
import type { NamespaceVar } from '../lib/types.js'
import { validateKey } from '../lib/validation.js'
import { chooseNamespace, expectValue } from './_prompts.js'
import { runExplodeTui } from './explode-tui.js'

type Action = 'set' | 'edit' | 'unset' | 'disable' | 'enable' | 'explode' | 'switch' | 'exit'

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

async function chooseVar(namespace: string, action: string): Promise<string | null> {
  const vars = await getNamespaceVarsWithValues(namespace)
  if (vars.length === 0) {
    p.log.warn('No variables found in this namespace.')
    return null
  }

  return expectValue<string>(
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
  return expectValue<string>(
    await p.password({
      message,
      mask: '•',
      validate(value) {
        return value && value.length > 0 ? undefined : 'Value is required'
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
  const key = validateKey(
    expectValue<string>(
      await p.text({
        message: 'Variable name',
        placeholder: 'AWS_SECRET_ACCESS_KEY',
        validate(value) {
          return value && value.trim().length > 0 ? undefined : 'Variable name is required'
        },
      }),
    ),
  )

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

  const key = expectValue<string>(
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

  const key = expectValue<string>(
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
    explode: async () => await runExplodeTui({ namespace }),
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
  return expectValue<string>(
    await p.select({
      message: 'What do you want to do?',
      options: [
        { label: 'Set variable', value: 'set' },
        { label: 'Edit variable', value: 'edit' },
        { label: 'Unset variable', value: 'unset' },
        { label: 'Disable variable', value: 'disable' },
        { label: 'Enable variable', value: 'enable' },
        { label: 'Explode a 1Password item into this namespace', value: 'explode' },
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
