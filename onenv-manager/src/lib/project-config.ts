import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CliError } from './errors.js'

const CONFIG_FILE = '.onenv.json'

export interface ProjectConfig {
  namespaces: string[]
  run: string
}

function configPath(): string {
  return resolve(process.cwd(), CONFIG_FILE)
}

export async function readProjectConfig(): Promise<ProjectConfig> {
  const path = configPath()
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as ProjectConfig
  } catch {
    throw new CliError(
      'NO_PROJECT_CONFIG',
      `No ${CONFIG_FILE} found in current directory`,
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
