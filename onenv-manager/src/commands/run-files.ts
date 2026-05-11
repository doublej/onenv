import type { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { validationError } from '../lib/errors.js'
import { listGroupsForNamespace } from '../lib/manager-service.js'
import { materializeFile } from '../lib/materialize.js'
import { importJsonFile } from './import.js'

export interface FileInjection {
  namespace: string
  group: string
  path: string
  cleanup: () => void
  writeback: boolean
  initialHash: string
}

export interface FileInjectionResult {
  fileEnv: Record<string, string>
  injections: FileInjection[]
}

export async function prepareFileInjections(
  specs: string[],
  writebackSpecs: string[],
  namespaces: string[],
): Promise<FileInjectionResult> {
  const fileEnv: Record<string, string> = {}
  const injections: FileInjection[] = []
  for (const spec of specs) {
    injections.push(await prepareInjection(spec, namespaces, false, fileEnv))
  }
  for (const spec of writebackSpecs) {
    injections.push(await prepareInjection(spec, namespaces, true, fileEnv))
  }
  return { fileEnv, injections }
}

async function prepareInjection(
  spec: string,
  namespaces: string[],
  writeback: boolean,
  fileEnv: Record<string, string>,
): Promise<FileInjection> {
  const parsed = parseFileSpec(spec)
  const namespace = await resolveGroupNamespace(parsed.group, namespaces)
  const { path, cleanup } = await materializeFile(namespace, parsed.group)
  fileEnv[parsed.varName] = path
  const initialHash = writeback ? hashFile(path) : ''
  return { namespace, group: parsed.group, path, cleanup, writeback, initialHash }
}

function parseFileSpec(spec: string): { group: string; varName: string } {
  const idx = spec.indexOf(':')
  if (idx <= 0 || idx === spec.length - 1) {
    throw validationError(`Invalid --file value: ${spec}`, 'Expected format: group:ENV_VAR')
  }
  return { group: spec.slice(0, idx), varName: spec.slice(idx + 1) }
}

async function resolveGroupNamespace(group: string, namespaces: string[]): Promise<string> {
  const matches: string[] = []
  for (const ns of namespaces) {
    const groups = await listGroupsForNamespace(ns)
    if (groups.includes(group)) matches.push(ns)
  }
  if (matches.length === 0) {
    throw validationError(
      `Group "${group}" not found in any project namespace`,
      'Check the project namespaces in .onenv.json or run "onenv list <ns> --groups"',
    )
  }
  if (matches.length > 1) {
    throw validationError(
      `Group "${group}" exists in multiple namespaces: ${matches.join(', ')}`,
      'Rename the group in one namespace to disambiguate',
    )
  }
  return matches[0]
}

function hashFile(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return ''
  }
}

export async function runWritebacks(injections: FileInjection[]): Promise<void> {
  for (const inj of injections) {
    if (!inj.writeback) continue
    await writebackOne(inj)
  }
}

async function writebackOne(inj: FileInjection): Promise<void> {
  const current = hashFile(inj.path)
  if (!current || current === inj.initialHash) return
  try {
    await importJsonFile(inj.namespace, inj.path, { group: inj.group })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[onenv] writeback failed for ${inj.namespace}:${inj.group}: ${msg}\n`)
  }
}

export function bindChildCleanup(
  child: ReturnType<typeof spawn>,
  injections: FileInjection[],
): void {
  const cleanup = () => {
    for (const i of injections) i.cleanup()
  }
  child.on('close', async (code) => {
    await runWritebacks(injections)
    cleanup()
    process.exit(code ?? 1)
  })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      cleanup()
      child.kill(sig)
    })
  }
}
