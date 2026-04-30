import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

const ROOT = import.meta.dir
const MANAGER = `${ROOT}/onenv-manager`
const API = `${ROOT}/onenv-api`
const CLACK_PATH = `${MANAGER}/node_modules/@clack/prompts/dist/index.mjs`
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.nuxt', '__pycache__', '.venv', 'venv'])
const ONENV_VAULT = 'onenv'
const ONENV_CATEGORY = 'API Credential'

async function run(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'ignore', stderr: 'pipe' })
  const code = await proc.exited
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(stderr.trim() || `${cmd.join(' ')} exited with ${code}`)
  }
}

async function bootstrap(): Promise<void> {
  if (await Bun.file(CLACK_PATH).exists()) return
  console.log('Installing manager dependencies (needed for installer UI)...')
  await run(['bun', 'install'], MANAGER)
  console.log('Done.\n')
}

await bootstrap()

const p: typeof import('@clack/prompts') = await import(CLACK_PATH)

function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  return value
}

async function spin(message: string, fn: () => Promise<void>): Promise<void> {
  const s = p.spinner()
  s.start(message)
  try {
    await fn()
    s.stop(`${message} — done`)
  } catch (e) {
    s.stop(`${message} — failed`)
    throw e
  }
}

// --- setup helpers ---

async function installDeps(name: string, cwd: string): Promise<void> {
  if (existsSync(`${cwd}/node_modules`)) {
    const reinstall = guard(await p.confirm({ message: `${name}: node_modules exists — reinstall?`, initialValue: false }))
    if (!reinstall) return
  }
  await spin(`Installing ${name} dependencies`, () => run(['bun', 'install'], cwd))
}

async function build(name: string, cwd: string): Promise<void> {
  if (existsSync(`${cwd}/dist`)) {
    const rebuild = guard(await p.confirm({ message: `${name}: dist/ exists — rebuild?`, initialValue: false }))
    if (!rebuild) return
  }
  await spin(`Building ${name}`, () => run(['bun', 'run', 'build'], cwd))
}

async function ensureVault(): Promise<void> {
  const check = Bun.spawn([OP_BIN, 'vault', 'get', ONENV_VAULT], { stdout: 'ignore', stderr: 'ignore' })
  if ((await check.exited) === 0) {
    p.log.success(`Vault "${ONENV_VAULT}" exists`)
    return
  }

  const create = guard(await p.confirm({
    message: `Create 1Password vault "${ONENV_VAULT}"?`,
    initialValue: true,
  }))

  if (!create) {
    p.log.warn('Skipped vault creation — you must create it manually before use')
    return
  }

  await spin(`Creating vault "${ONENV_VAULT}"`, async () => {
    await run([OP_BIN, 'vault', 'create', ONENV_VAULT], ROOT)
  })
}

async function configureEnv(): Promise<void> {
  p.log.step('Configure onenv-api')
  const envPath = `${API}/.env`
  if (await Bun.file(envPath).exists()) {
    const overwrite = guard(await p.confirm({ message: '.env already exists — overwrite?', initialValue: false }))
    if (!overwrite) return
  }

  const token = guard(await p.text({
    message: 'Set an API token for authenticating requests to the agent API',
    placeholder: 'a-secret-string-of-your-choice',
    validate: (v) => (v.trim().length > 0 ? undefined : 'Token is required'),
  }))

  const mode = guard(await p.select({
    message: 'How should permission requests be approved?',
    options: [
      { label: 'desktop', value: 'desktop', hint: 'native macOS dialog' },
      { label: 'telegram', value: 'telegram', hint: 'Telegram bot message' },
      { label: 'either', value: 'either', hint: 'desktop or telegram' },
      { label: 'both', value: 'both', hint: 'require both' },
    ],
    initialValue: 'desktop',
  })) as string

  let telegramBot = '', telegramChat = ''
  if (mode !== 'desktop') {
    telegramBot = guard(await p.text({ message: 'Telegram bot token (from @BotFather)', placeholder: '123:abc' })) as string
    telegramChat = guard(await p.text({ message: 'Telegram chat ID to send permission requests to', placeholder: '123456789' })) as string
  }
  const lines = [
    `AGENT_API_TOKEN=${token}`,
    `PERMISSION_MODE=${mode}`,
    '',
    '# API_HOST=127.0.0.1',
    '# API_PORT=4317',
    '# PERMISSION_TIMEOUT_MS=120000',
    '',
    `ONENV_VAULT=${ONENV_VAULT}`,
    `ONENV_CATEGORY=${ONENV_CATEGORY}`,
    '# ONENV_SERVICE_ACCOUNT_TOKEN=',
    '',
    telegramBot ? `TELEGRAM_BOT_TOKEN=${telegramBot}` : '# TELEGRAM_BOT_TOKEN=',
    telegramChat ? `TELEGRAM_CHAT_ID=${telegramChat}` : '# TELEGRAM_CHAT_ID=',
    '',
  ]
  await Bun.write(envPath, lines.join('\n'))
  p.log.success('.env written')
}

// --- env scanning & migration ---

function findEnvFiles(root: string, maxDepth = 4): string[] {
  const results: string[] = []
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) walk(full, depth + 1)
        else if (name === '.env' && stat.isFile()) results.push(full)
      } catch { /* skip unreadable */ }
    }
  }
  walk(root, 0)
  return results.sort()
}

interface EnvEntry { key: string; value: string }

function parseEnvFile(path: string): EnvEntry[] {
  const content = readFileSync(path, 'utf-8')
  const entries: EnvEntry[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    entries.push({ key: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) })
  }
  return entries
}

async function onenvSet(namespace: string, key: string, value: string): Promise<void> {
  const title = `${namespace}/${key}`
  const proc = Bun.spawn([
    OP_BIN, 'item', 'create',
    '--vault', ONENV_VAULT,
    '--category', ONENV_CATEGORY,
    '--title', title,
    '--tags', namespace,
    `credential=${value}`,
  ], {
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const code = await proc.exited
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`op item create ${title} failed: ${stderr.trim()}`)
  }
}

async function migrateEnvFiles(): Promise<void> {
  p.log.step('Scan projects for .env files')

  const scanDir = guard(await p.text({
    message: 'Directory to scan for .env files',
    placeholder: dirname(ROOT),
    defaultValue: dirname(ROOT),
  })) as string

  const s = p.spinner()
  s.start('Scanning...')
  const files = findEnvFiles(scanDir)
  s.stop(`Found ${files.length} .env file${files.length === 1 ? '' : 's'}`)

  if (files.length === 0) return

  const selected = guard(await p.multiselect({
    message: 'Which .env files should be imported into 1Password?',
    options: files.map((f) => ({
      label: relative(scanDir, f),
      value: f,
      hint: `${parseEnvFile(f).length} vars`,
    })),
    required: false,
  })) as string[]

  if (selected.length === 0) return

  for (const file of selected) {
    const entries = parseEnvFile(file)
    const projectName = basename(dirname(file))
    p.log.step(`${relative(scanDir, file)} (${entries.length} vars)`)

    const namespace = guard(await p.text({
      message: '1Password namespace (tag)',
      defaultValue: projectName,
      placeholder: projectName,
    })) as string

    const keys = guard(await p.multiselect({
      message: `Select variables to import into "${namespace}"`,
      options: entries.map((e) => ({
        label: e.key,
        value: e.key,
        hint: e.value.length > 20 ? `${e.value.slice(0, 20)}…` : e.value,
      })),
      required: false,
    })) as string[]

    if (keys.length === 0) continue

    const entryMap = new Map(entries.map((e) => [e.key, e.value]))
    await spin(`Importing ${keys.length} vars into ${namespace}`, async () => {
      for (const key of keys) {
        await onenvSet(namespace, key, entryMap.get(key)!)
      }
    })
    p.log.success(`Imported ${keys.length} vars into "${namespace}"`)
  }
}

// --- main ---
p.intro('onenv installer')

const OP_BIN = Bun.which('op')
if (!OP_BIN) {
  p.log.error('op CLI not found — install 1Password CLI first: brew install 1password-cli')
  process.exit(1)
}
p.log.success('op CLI found')
if (!Bun.which('just')) p.log.info('just not found — optional but recommended: brew install just')

await ensureVault()
await installDeps('onenv-manager', MANAGER)
await installDeps('onenv-api', API)
await build('onenv-manager', MANAGER)
await build('onenv-api', API)
await configureEnv()
await spin('Linking onenv-manager CLI', () => run(['bun', 'link'], MANAGER))

try {
  const proc = Bun.spawn(['onenv-manager', 'list'], { stdout: 'ignore', stderr: 'ignore' })
  if ((await proc.exited) === 0) p.log.success('onenv-manager CLI works')
  else p.log.warn('onenv-manager exited with non-zero — check your setup')
} catch {
  p.log.warn('Could not run onenv-manager — you may need to restart your shell')
}

const wantScan = guard(await p.confirm({
  message: 'Scan your projects for .env files and import them into 1Password?',
  initialValue: true,
}))
if (wantScan) await migrateEnvFiles()

p.log.info('Start the agent API:\n  cd onenv-api && bun run --env-file .env start')
p.log.info('Verify:\n  curl http://127.0.0.1:4317/health')

p.outro('Installation complete')
