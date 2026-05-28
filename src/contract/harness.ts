// Black-box harness for the onenv CLI contract suite. Builds the real binary,
// then spawns `node dist/cli.js` in an isolated workspace whose PATH points at a
// fake `op` (op-stub.cjs) backed by a fixture file. This exercises the genuine
// arg-parsing, output-rendering and exit-code surface that consumers depend on —
// the layer that pure unit tests skip, where the 0.8.0 --reveal break slipped by.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const contractDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(contractDir, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli.js')
const stubSource = join(contractDir, 'op-stub.cjs')

let built = false

export function ensureBuilt(): void {
  if (built) return
  execFileSync('bun', ['run', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  built = true
}

export interface StubItem {
  id: string
  namespace: string
  key: string
  value: string
  group?: string
  path?: string
  type?: string
}

export interface CliResult {
  code: number
  stdout: string
  stderr: string
  json: () => unknown
}

export function makeWorkspace(items: StubItem[]): string {
  const root = mkdtempSync(join(tmpdir(), 'onenv-contract-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  mkdirSync(join(root, 'config'))
  const op = join(bin, 'op')
  copyFileSync(stubSource, op)
  chmodSync(op, 0o755)
  writeFileSync(join(root, 'db.json'), JSON.stringify(items, null, 2))
  return root
}

export function runCli(args: string[], workspace: string): CliResult {
  const result = spawnSync('node', [cliEntry, ...args], {
    cwd: workspace,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${join(workspace, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: workspace,
      XDG_CONFIG_HOME: join(workspace, 'config'),
      ONENV_STUB_DB: join(workspace, 'db.json'),
      ONENV_VAULT: 'onenv',
      ONENV_CATEGORY: 'API Credential',
      OP_SERVICE_ACCOUNT_TOKEN: 'ops_stubtoken',
    },
  })
  const stdout = result.stdout ?? ''
  return {
    code: result.status ?? 1,
    stdout,
    stderr: result.stderr ?? '',
    json: () => JSON.parse(stdout),
  }
}
