import { writeFile } from 'node:fs/promises'
import { validationError } from '../lib/errors.js'
import { unflatten } from '../lib/json-flatten.js'
import { listGroupEntries } from '../lib/onenv-client.js'

export interface BuildFileOptions {
  out?: string
  indent?: number
}

export async function buildFile(
  namespace: string,
  group: string,
  opts: BuildFileOptions = {},
): Promise<string> {
  const entries = await listGroupEntries(namespace, group)
  if (entries.length === 0) {
    throw validationError(
      `No entries found in group ${namespace}:${group}`,
      'Run "onenv import" to populate, or check the group name with "onenv list <ns> --groups"',
    )
  }
  const obj = unflatten(entries)
  const indent = opts.indent ?? 2
  const text = JSON.stringify(obj, null, indent)
  if (opts.out) {
    await writeFile(opts.out, `${text}\n`)
  } else {
    process.stdout.write(`${text}\n`)
  }
  return text
}
