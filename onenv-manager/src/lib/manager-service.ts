import {
  type GroupEntry,
  type ItemMeta,
  listGroupEntries,
  listItemsWithMeta,
  listKeys,
  listNamespaces,
  listValues,
  setValue,
  setValueWithMeta,
  unsetValue,
} from './onenv-client.js'
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

export async function setVarWithMeta(
  namespace: string,
  key: string,
  value: string,
  meta: ItemMeta,
): Promise<void> {
  await setValueWithMeta(namespace, key, value, meta)
  await setDisabled(namespace, key, false)
}

export async function getNamespaceVarsWithMeta(namespace: string): Promise<NamespaceVar[]> {
  const items = await listItemsWithMeta(namespace)
  const disabledMap = await getDisabledMap()
  const disabled = new Set(disabledMap[namespace] ?? [])
  return items.map((it) => ({
    key: it.key,
    disabled: disabled.has(it.key),
    group: it.group,
    path: it.path,
    type: it.type,
  }))
}

export async function getGroupEntries(namespace: string, group: string): Promise<GroupEntry[]> {
  return await listGroupEntries(namespace, group)
}

export async function listGroupsForNamespace(namespace: string): Promise<string[]> {
  const items = await listItemsWithMeta(namespace)
  const groups = new Set<string>()
  for (const it of items) if (it.group) groups.add(it.group)
  return [...groups].sort()
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
