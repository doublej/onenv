import { listKeys, listNamespaces, listValues, setValue, unsetValue } from './onenv-client.js'
import { getDisabledMap, setDisabled } from './state-store.js'

export interface NamespaceVarSummary {
  key: string
  disabled: boolean
}

export async function getNamespaces(): Promise<string[]> {
  return await listNamespaces()
}

export async function getNamespaceVars(namespace: string): Promise<NamespaceVarSummary[]> {
  const keys = await listKeys(namespace)
  const disabledMap = await getDisabledMap()
  const disabled = new Set(disabledMap[namespace] ?? [])

  return keys.map((key) => ({
    key,
    disabled: disabled.has(key),
  }))
}

export async function setVar(namespace: string, key: string, value: string): Promise<void> {
  await setValue(namespace, key, value)
  await setDisabled(namespace, key, false)
}

export async function editVar(namespace: string, key: string, value: string): Promise<void> {
  await setValue(namespace, key, value)
}

export async function unsetVar(namespace: string, key: string): Promise<void> {
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
