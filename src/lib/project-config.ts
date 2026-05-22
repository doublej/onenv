import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CliError } from './errors.js'
import { validateNamespace } from './validation.js'

const CONFIG_FILE = '.onenv.json'

export interface ProjectConfig {
  namespaces: string[]
}

function configPath(): string {
  return resolve(process.cwd(), CONFIG_FILE)
}

function parseProjectConfig(raw: string): ProjectConfig {
  const parsed = JSON.parse(raw) as Partial<ProjectConfig>
  if (!Array.isArray(parsed.namespaces) || parsed.namespaces.length === 0) {
    throw new Error('namespaces must be a non-empty array')
  }
  if (!parsed.namespaces.every((namespace) => typeof namespace === 'string')) {
    throw new Error('namespaces must contain strings')
  }
  return { namespaces: parsed.namespaces.map(validateNamespace) }
}

export async function readProjectConfig(): Promise<ProjectConfig> {
  const path = configPath()
  try {
    const raw = await readFile(path, 'utf-8')
    return parseProjectConfig(raw)
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ''
    throw new CliError(
      'NO_PROJECT_CONFIG',
      `Could not read ${CONFIG_FILE}${detail}`,
      'user_error',
      `Run "onenv init" to set up this project`,
    )
  }
}

export async function writeProjectConfig(config: ProjectConfig): Promise<string> {
  const path = configPath()
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
  return path
}
