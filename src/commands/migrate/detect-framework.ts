import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Framework } from './types.js'

export function detectFramework(cwd: string): Framework {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return { kind: 'generic', public_prefix: null }
  try {
    const deps = collectDeps(JSON.parse(readFileSync(pkgPath, 'utf-8')))
    if (deps.has('next')) return { kind: 'nextjs', public_prefix: 'NEXT_PUBLIC_' }
    if (deps.has('@sveltejs/kit')) return { kind: 'sveltekit', public_prefix: 'PUBLIC_' }
    if (deps.has('expo')) return { kind: 'expo', public_prefix: 'EXPO_PUBLIC_' }
    if (deps.has('vite')) return { kind: 'vite', public_prefix: 'VITE_' }
  } catch {
    // fallthrough to generic on parse error
  }
  return { kind: 'generic', public_prefix: null }
}

function collectDeps(pkg: unknown): Set<string> {
  const out = new Set<string>()
  if (!pkg || typeof pkg !== 'object') return out
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const block = (pkg as Record<string, unknown>)[field]
    if (block && typeof block === 'object') {
      for (const name of Object.keys(block)) out.add(name)
    }
  }
  return out
}
