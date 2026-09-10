import { writeFile } from 'node:fs/promises'
import { validationError } from '../lib/errors.js'
import { findRawEntry, unflatten } from '../lib/json-flatten.js'
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
  const raw = findRawEntry(entries)
  const text = raw ? raw.value : `${JSON.stringify(unflatten(entries), null, opts.indent ?? 2)}\n`
  if (opts.out) {
    await writeFile(opts.out, text)
  } else {
    process.stdout.write(text)
  }
  return text
}
