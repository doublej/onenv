import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { readProjectConfig } from './project-config.js'

let dir: string
let original: string

beforeEach(async () => {
  original = process.cwd()
  dir = await mkdtemp(join(tmpdir(), 'onenv-cfg-'))
  process.chdir(dir)
})

afterEach(async () => {
  process.chdir(original)
  await rm(dir, { recursive: true, force: true })
})

async function writeConfig(obj: unknown): Promise<void> {
  await writeFile(join(dir, '.onenv.json'), JSON.stringify(obj))
}

describe.sequential('readProjectConfig fileOnlyNamespaces', () => {
  it('parses a valid subset of namespaces', async () => {
    await writeConfig({ namespaces: ['a', 'b', 'c'], fileOnlyNamespaces: ['b', 'c'] })
    const config = await readProjectConfig()
    expect(config.namespaces).toEqual(['a', 'b', 'c'])
    expect(config.fileOnlyNamespaces).toEqual(['b', 'c'])
  })

  it('defaults to an empty array when the field is absent', async () => {
    await writeConfig({ namespaces: ['a'] })
    expect((await readProjectConfig()).fileOnlyNamespaces).toEqual([])
  })

  it('allows every namespace to be file-only', async () => {
    await writeConfig({ namespaces: ['a', 'b'], fileOnlyNamespaces: ['a', 'b'] })
    expect((await readProjectConfig()).fileOnlyNamespaces).toEqual(['a', 'b'])
  })

  it('de-dupes repeated entries', async () => {
    await writeConfig({ namespaces: ['a', 'b'], fileOnlyNamespaces: ['a', 'a', 'b'] })
    expect((await readProjectConfig()).fileOnlyNamespaces).toEqual(['a', 'b'])
  })

  it('rejects an entry that is not a subset, naming the offender', async () => {
    await writeConfig({ namespaces: ['a'], fileOnlyNamespaces: ['a', 'ghost'] })
    await expect(readProjectConfig()).rejects.toThrow(/ghost/)
  })

  it('rejects a non-array fileOnlyNamespaces', async () => {
    await writeConfig({ namespaces: ['a'], fileOnlyNamespaces: 'a' })
    await expect(readProjectConfig()).rejects.toThrow(CliError)
  })

  it('rejects non-string entries', async () => {
    await writeConfig({ namespaces: ['a'], fileOnlyNamespaces: [1] })
    await expect(readProjectConfig()).rejects.toThrow(/strings/)
  })
})
