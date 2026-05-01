import { listKeys, listNamespaces, listValues, setValue, unsetValue } from './onenv-client.js'
import { getDisabledMap, setDisabled } from './state-store.js'
import type { NamespaceVar } from './types.js'

export async function getNamespaces(): Promise<string[]> {
  return await listNamespaces()
}

export async function getNamespaceVars(namespace: string): Promise<NamespaceVar[]> {
  const keys = await listKeys(namespace)
  const disabledMap = await getDisabledMap()
  const disabled = new Set(disabledMap[namespace] ?? [])

  return keys.map((key) => ({
    key,
    disabled: disabled.has(key),
  }))
}

export async function getNamespaceVarsWithValues(namespace: string): Promise<NamespaceVar[]> {
  const values = await listValues(namespace)
  const disabledMap = await getDisabledMap()
  const disabled = new Set(disabledMap[namespace] ?? [])

  return Object.entries(values)
    .map(([key, value]) => ({
      key,
      value,
      disabled: disabled.has(key),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
}

export async function createOrUpdateVar(
  namespace: string,
  key: string,
  value: string,
  keepDisabled = false,
): Promise<void> {
  await setValue(namespace, key, value)
  if (!keepDisabled) {
    await setDisabled(namespace, key, false)
  }
}

export async function editVar(namespace: string, key: string, value: string): Promise<void> {
  await setValue(namespace, key, value)
}

export async function removeVar(namespace: string, key: string): Promise<void> {
  await unsetValue(namespace, key)
  await setDisabled(namespace, key, false)
}

export async function disableVar(namespace: string, key: string): Promise<void> {
  await setDisabled(namespace, key, true)
}

export async function enableVar(namespace: string, key: string): Promise<void> {
  await setDisabled(namespace, key, false)
}

export async function exportEnabledValues(namespaces: string[]): Promise<Record<string, string>> {
  const disabledMap = await getDisabledMap()

  const perNamespace = await Promise.all(
    namespaces.map(async (namespace) => {
      const values = await listValues(namespace)
      const disabled = new Set(disabledMap[namespace] ?? [])
      return Object.entries(values).filter(([key]) => !disabled.has(key))
    }),
  )

  return Object.fromEntries(perNamespace.flat())
}
