import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface PackageManifest {
  version?: string
}

export function getPackageVersion(): string {
  const path = fileURLToPath(new URL('../../package.json', import.meta.url))
  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw) as PackageManifest
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('package.json is missing a version')
  }
  return parsed.version
}
