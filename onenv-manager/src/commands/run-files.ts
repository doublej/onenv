import type { spawn } from 'node:child_process'
import { validationError } from '../lib/errors.js'
import { listGroupsForNamespace } from '../lib/manager-service.js'
import { materializeFile } from '../lib/materialize.js'

export interface FileInjectionResult {
  fileEnv: Record<string, string>
  cleanups: Array<() => void>
}

export async function prepareFileInjections(
  specs: string[],
  namespaces: string[],
): Promise<FileInjectionResult> {
  const fileEnv: Record<string, string> = {}
  const cleanups: Array<() => void> = []
  for (const spec of specs) {
    const parsed = parseFileSpec(spec)
    const namespace = await resolveGroupNamespace(parsed.group, namespaces)
    const { path, cleanup } = await materializeFile(namespace, parsed.group)
    fileEnv[parsed.varName] = path
    cleanups.push(cleanup)
  }
  return { fileEnv, cleanups }
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

export function bindChildCleanup(
  child: ReturnType<typeof spawn>,
  cleanups: Array<() => void>,
): void {
  const runAll = () => {
    for (const c of cleanups) c()
  }
  child.on('close', (code) => {
    runAll()
    process.exit(code ?? 1)
  })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      runAll()
      child.kill(sig)
    })
  }
}
