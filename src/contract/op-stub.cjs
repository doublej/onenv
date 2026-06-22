#!/usr/bin/env node
'use strict'
// Fake `op` CLI for onenv contract tests. Reads a fixture from ONENV_STUB_DB
// and answers the subset of `op` commands onenv invokes (see onenv-client.ts):
// item list/get/create/edit/delete and inject. Output shapes mirror real op so
// the contract suite exercises the genuine parsing/rendering path end-to-end.
const fs = require('node:fs')

const TAG_PREFIX = 'onenv:'

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function loadDb() {
  const path = process.env.ONENV_STUB_DB
  if (!path) fail('stub op: ONENV_STUB_DB not set')
  return JSON.parse(fs.readFileSync(path, 'utf-8'))
}

function saveDb(db) {
  fs.writeFileSync(process.env.ONENV_STUB_DB, JSON.stringify(db, null, 2))
}

function flag(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function titleOf(item) {
  return `${item.namespace}/${item.key}`
}

function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2))
}

function toSummary(item) {
  return { id: item.id, title: titleOf(item), tags: [`${TAG_PREFIX}${item.namespace}`] }
}

function toDetail(item) {
  const fields = [{ id: 'credential', type: 'CONCEALED', value: item.value, label: 'credential' }]
  for (const id of ['group', 'path', 'type']) {
    if (item[id] !== undefined) {
      fields.push({ id, type: 'STRING', value: String(item[id]), label: id })
    }
  }
  return { id: item.id, title: titleOf(item), vault: { name: 'onenv' }, fields }
}

function fieldValue(template, id) {
  const field = (template.fields || []).find((f) => f.id === id)
  return field ? field.value : undefined
}

function itemFromTemplate(template) {
  const sep = template.title.indexOf('/')
  return {
    id: template.id || `id-${Math.random().toString(16).slice(2, 10)}`,
    namespace: template.title.slice(0, sep),
    key: template.title.slice(sep + 1),
    value: fieldValue(template, 'credential') ?? '',
    group: fieldValue(template, 'group'),
    path: fieldValue(template, 'path'),
    type: fieldValue(template, 'type'),
  }
}

function itemList(args) {
  const tag = flag(args, '--tags')
  const ns = tag?.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : undefined
  emit(
    loadDb()
      .filter((it) => !ns || it.namespace === ns)
      .map(toSummary),
  )
}

function itemGet(args) {
  const specifier = args[2]
  const db = loadDb()
  if (specifier === '-') {
    // Batch form: `op item get -` reads a JSON array of {id} specifiers on stdin
    // and returns an array of item details (see onenv-client.ts fetchAllItems).
    const stdin = fs.readFileSync(0, 'utf-8').trim()
    const specs = stdin ? JSON.parse(stdin) : []
    const ids = new Set(specs.map((s) => s.id))
    emit(db.filter((it) => ids.has(it.id)).map(toDetail))
    return
  }
  const item = db.find((it) => titleOf(it) === specifier)
  if (!item) fail(`"${specifier}" isn't an item. Specify the item with its UUID, name, or domain.`)
  emit(toDetail(item))
}

function itemCreate(args) {
  const db = loadDb()
  db.push(itemFromTemplate(JSON.parse(fs.readFileSync(flag(args, '--template'), 'utf-8'))))
  saveDb(db)
}

function itemEdit(args) {
  const title = args[2]
  const db = loadDb()
  const idx = db.findIndex((it) => titleOf(it) === title)
  if (idx < 0) fail(`"${title}" isn't an item.`)
  const next = itemFromTemplate(JSON.parse(fs.readFileSync(flag(args, '--template'), 'utf-8')))
  next.id = db[idx].id
  db[idx] = next
  saveDb(db)
}

function itemDelete(args) {
  saveDb(loadDb().filter((it) => titleOf(it) !== args[2]))
}

function inject(args) {
  const byId = new Map(loadDb().map((it) => [it.id, it.value]))
  const template = fs.readFileSync(flag(args, '-i'), 'utf-8')
  process.stdout.write(
    template.replace(/\{\{\s*op:\/\/[^/]+\/([^/]+)\/credential\s*\}\}/g, (_match, id) => {
      const value = byId.get(id)
      if (value === undefined) fail(`stub op: could not resolve credential for ${id}`)
      return value
    }),
  )
}

const HANDLERS = {
  'item list': itemList,
  'item get': itemGet,
  'item create': itemCreate,
  'item edit': itemEdit,
  'item delete': itemDelete,
  inject,
}

function main() {
  const args = process.argv.slice(2)
  const key = args[0] === 'inject' ? 'inject' : `${args[0]} ${args[1]}`
  const handler = HANDLERS[key]
  if (!handler) fail(`stub op: unsupported command: ${args.join(' ')}`)
  handler(args)
}

main()
