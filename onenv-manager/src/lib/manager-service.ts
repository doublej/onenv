import { validationError } from './errors.js'
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
  const perNamespace = await fetchEnabledPerNamespace(namespaces)
  return Object.fromEntries(perNamespace.flatMap(({ entries }) => entries))
}

export async function exportEnabledValuesStrict(
  namespaces: string[],
): Promise<Record<string, string>> {
  const perNamespace = await fetchEnabledPerNamespace(namespaces)
  const owners = collectKeyOwners(perNamespace)
  const conflicts = [...owners.entries()]
    .filter(([, ns]) => ns.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
  if (conflicts.length > 0) {
    const lines = conflicts.map(([k, ns]) => `  ${k}: ${ns.join(', ')}`).join('\n')
    throw validationError(
      `Key collisions across namespaces:\n${lines}`,
      'Remove the duplicate from one namespace, or disable it: onenv disable <ns> <key>',
    )
  }
  return Object.fromEntries(perNamespace.flatMap(({ entries }) => entries))
}

interface NamespaceEntries {
  ns: string
  entries: Array<[string, string]>
}

async function fetchEnabledPerNamespace(namespaces: string[]): Promise<NamespaceEntries[]> {
  const disabledMap = await getDisabledMap()
  return await Promise.all(
    namespaces.map(async (ns) => {
      const values = await listValues(ns)
      const disabled = new Set(disabledMap[ns] ?? [])
      const entries = Object.entries(values).filter(([key]) => !disabled.has(key))
      return { ns, entries }
    }),
  )
}

function collectKeyOwners(perNamespace: NamespaceEntries[]): Map<string, string[]> {
  const owners = new Map<string, string[]>()
  for (const { ns, entries } of perNamespace) {
    for (const [k] of entries) {
      const arr = owners.get(k) ?? []
      arr.push(ns)
      owners.set(k, arr)
    }
  }
  return owners
}
