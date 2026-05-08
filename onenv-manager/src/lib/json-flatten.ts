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
  if (value === null) {
    emitLeaf(out, path, 'null', '')
    return
  }
  if (Array.isArray(value)) {
    walkArray(value, path, out)
    return
  }
  if (typeof value === 'object') {
    walkObject(value as Record<string, unknown>, path, out)
    return
  }
  walkPrimitive(value, path, out)
}

function walkPrimitive(value: unknown, path: string, out: FlatEntry[]): void {
  if (typeof value === 'string') {
    emitLeaf(out, path, 'string', value)
    return
  }
  if (typeof value === 'number') {
    emitLeaf(out, path, 'number', String(value))
    return
  }
  if (typeof value === 'boolean') {
    emitLeaf(out, path, 'boolean', value ? 'true' : 'false')
    return
  }
  throw new Error(`unsupported JSON value at ${path || '<root>'}`)
}

function walkArray(value: unknown[], path: string, out: FlatEntry[]): void {
  if (value.length === 0) {
    emitLeaf(out, path, 'empty-array', '')
    return
  }
  for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`, out)
}

function walkObject(value: Record<string, unknown>, path: string, out: FlatEntry[]): void {
  const keys = Object.keys(value)
  if (keys.length === 0) {
    emitLeaf(out, path, 'empty-object', '')
    return
  }
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
  if (firstTokens.length === 0) {
    throw new Error('mixed root-leaf and nested entries are not supported')
  }
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
  const state = { cur: '', i: 0 }
  while (state.i < path.length) {
    consumeChar(path, state, tokens)
  }
  if (state.cur) tokens.push(state.cur)
  return tokens
}

function consumeChar(path: string, state: { cur: string; i: number }, tokens: PathToken[]): void {
  const c = path[state.i]
  if (c === '.') {
    flushToken(state, tokens)
    state.i++
    return
  }
  if (c === '[') {
    flushToken(state, tokens)
    state.i = consumeBracket(path, state.i, tokens)
    return
  }
  state.cur += c
  state.i++
}

function flushToken(state: { cur: string }, tokens: PathToken[]): void {
  if (state.cur) tokens.push(state.cur)
  state.cur = ''
}

function consumeBracket(path: string, start: number, tokens: PathToken[]): number {
  const end = path.indexOf(']', start)
  if (end === -1) throw new Error(`unterminated bracket: ${path}`)
  const idx = Number.parseInt(path.slice(start + 1, end), 10)
  if (!Number.isInteger(idx) || idx < 0) throw new Error(`bad index: ${path}`)
  tokens.push(idx)
  return end + 1
}

function castLeaf(type: JsonLeafType, value: string, path: string): unknown {
  if (type === 'string') return value
  if (type === 'null') return null
  if (type === 'empty-array') return []
  if (type === 'empty-object') return {}
  if (type === 'boolean') return castBoolean(value, path)
  if (type === 'number') return castNumber(value, path)
  throw new Error(`unknown type at ${path || '<root>'}: ${type}`)
}

function castBoolean(value: string, path: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`invalid boolean at ${path || '<root>'}: ${value}`)
}

function castNumber(value: string, path: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`invalid number at ${path || '<root>'}: ${value}`)
  return n
}

function validateNoHoles(value: unknown, path = ''): void {
  if (Array.isArray(value)) {
    validateArrayHoles(value, path)
    return
  }
  if (value && typeof value === 'object') {
    validateObjectHoles(value as Record<string, unknown>, path)
  }
}

function validateArrayHoles(arr: unknown[], path: string): void {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === undefined) throw new Error(`missing array index at ${path}[${i}]`)
    validateNoHoles(arr[i], `${path}[${i}]`)
  }
}

function validateObjectHoles(obj: Record<string, unknown>, path: string): void {
  for (const k of Object.keys(obj)) {
    validateNoHoles(obj[k], path ? `${path}.${k}` : k)
  }
}
