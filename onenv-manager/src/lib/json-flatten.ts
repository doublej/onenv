import type { JsonLeafType } from './types.js'

export interface FlatEntry {
  path: string
  type: JsonLeafType
  value: string
}

type PathToken = string | number

export function flatten(input: unknown): FlatEntry[] {
  const out: FlatEntry[] = []
  walk(input, '', out)
  return out
}

function walk(value: unknown, path: string, out: FlatEntry[]): void {
  if (value === null) return emitLeaf(out, path, 'null', '')
  if (Array.isArray(value)) return walkArray(value, path, out)
  if (typeof value === 'object') return walkObject(value as Record<string, unknown>, path, out)
  if (typeof value === 'string') return emitLeaf(out, path, 'string', value)
  if (typeof value === 'number') return emitLeaf(out, path, 'number', String(value))
  if (typeof value === 'boolean') return emitLeaf(out, path, 'boolean', value ? 'true' : 'false')
  throw new Error(`unsupported JSON value at ${path || '<root>'}`)
}

function walkArray(value: unknown[], path: string, out: FlatEntry[]): void {
  if (value.length === 0) return emitLeaf(out, path, 'empty-array', '')
  for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`, out)
}

function walkObject(value: Record<string, unknown>, path: string, out: FlatEntry[]): void {
  const keys = Object.keys(value)
  if (keys.length === 0) return emitLeaf(out, path, 'empty-object', '')
  for (const k of keys) walk(value[k], path ? `${path}.${k}` : k, out)
}

function emitLeaf(out: FlatEntry[], path: string, type: JsonLeafType, value: string): void {
  out.push({ path, type, value })
}

export function unflatten(entries: FlatEntry[]): unknown {
  if (entries.length === 0) throw new Error('cannot unflatten empty entry list')
  if (entries.length === 1 && entries[0].path === '') {
    return castLeaf(entries[0].type, entries[0].value, '')
  }
  const root = createRoot(parsePath(entries[0].path))
  for (const e of entries) applyEntry(root, e)
  validateNoHoles(root)
  return root
}

function createRoot(firstTokens: PathToken[]): Record<string, unknown> | unknown[] {
  if (firstTokens.length === 0) throw new Error('mixed root-leaf and nested entries are not supported')
  return typeof firstTokens[0] === 'number' ? [] : {}
}

function applyEntry(root: Record<string, unknown> | unknown[], entry: FlatEntry): void {
  const tokens = parsePath(entry.path)
  if (tokens.length === 0) throw new Error('mixed root-leaf and nested entries are not supported')
  setAt(root, tokens, castLeaf(entry.type, entry.value, entry.path))
}

function setAt(
  root: Record<string, unknown> | unknown[],
  tokens: PathToken[],
  leaf: unknown,
): void {
  let node = root
  for (let i = 0; i < tokens.length - 1; i++) {
    node = descend(node, tokens[i], typeof tokens[i + 1] === 'number')
  }
  assignLeaf(node, tokens[tokens.length - 1], leaf)
}

function descend(
  node: Record<string, unknown> | unknown[],
  token: PathToken,
  wantArray: boolean,
): Record<string, unknown> | unknown[] {
  const empty = wantArray ? [] : {}
  if (typeof token === 'number') {
    const arr = node as unknown[]
    if (arr[token] === undefined) arr[token] = empty
    return arr[token] as Record<string, unknown> | unknown[]
  }
  const obj = node as Record<string, unknown>
  if (obj[token] === undefined) obj[token] = empty
  return obj[token] as Record<string, unknown> | unknown[]
}

function assignLeaf(
  node: Record<string, unknown> | unknown[],
  last: PathToken,
  leaf: unknown,
): void {
  if (typeof last === 'number') (node as unknown[])[last] = leaf
  else (node as Record<string, unknown>)[last] = leaf
}

function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = []
  let cur = ''
  let i = 0
  while (i < path.length) {
    const c = path[i]
    if (c === '.') {
      if (cur) tokens.push(cur)
      cur = ''
      i++
      continue
    }
    if (c === '[') {
      if (cur) tokens.push(cur)
      cur = ''
      const end = path.indexOf(']', i)
      if (end === -1) throw new Error(`unterminated bracket: ${path}`)
      const idx = Number.parseInt(path.slice(i + 1, end), 10)
      if (!Number.isInteger(idx) || idx < 0) throw new Error(`bad index: ${path}`)
      tokens.push(idx)
      i = end + 1
      continue
    }
    cur += c
    i++
  }
  if (cur) tokens.push(cur)
  return tokens
}

function castLeaf(type: JsonLeafType, value: string, path: string): unknown {
  if (type === 'string') return value
  if (type === 'null') return null
  if (type === 'empty-array') return []
  if (type === 'empty-object') return {}
  if (type === 'boolean') {
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error(`invalid boolean at ${path || '<root>'}: ${value}`)
  }
  if (type === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`invalid number at ${path || '<root>'}: ${value}`)
    return n
  }
  throw new Error(`unknown type at ${path || '<root>'}: ${type}`)
}

function validateNoHoles(value: unknown, path = ''): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) throw new Error(`missing array index at ${path}[${i}]`)
      validateNoHoles(value[i], `${path}[${i}]`)
    }
    return
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      validateNoHoles((value as Record<string, unknown>)[k], path ? `${path}.${k}` : k)
    }
  }
}
