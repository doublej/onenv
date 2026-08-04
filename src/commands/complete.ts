import type { Command } from 'commander'
import { listExternalItems, listExternalVaults } from '../lib/external-item.js'
import { getNamespaces, getNamespaceVars, listGroupsForNamespace } from '../lib/manager-service.js'
import { ONENV_VAULT } from '../lib/onenv-client.js'

async function candidatesFor(type: string, arg?: string): Promise<string[]> {
  switch (type) {
    case 'namespaces':
      return await getNamespaces()
    case 'keys':
      return arg ? (await getNamespaceVars(arg)).map((v) => v.key) : []
    case 'groups':
      return arg ? await listGroupsForNamespace(arg) : []
    case 'vaults':
      return (await listExternalVaults()).filter((name) => name !== ONENV_VAULT)
    case 'items': {
      const items = await listExternalItems()
      const titles = items
        .filter((item) => item.vault !== ONENV_VAULT)
        .map((item) => item.title.trim())
        .filter((title) => title.length > 0)
      return [...new Set(titles)]
    }
    default:
      return []
  }
}

/**
 * Plumbing for the shell completion scripts: one candidate per line, and
 * never any noise — a failed lookup (op not signed in, no vault access)
 * completes to nothing rather than dumping an error into the prompt.
 */
export function registerCompleteCommand(program: Command): void {
  program
    .command('__complete', { hidden: true })
    .description('Emit shell completion candidates (internal)')
    .argument('<type>', 'namespaces | keys | groups | items | vaults')
    .argument('[arg]', 'Namespace, for the keys and groups types')
    .action(async (type: string, arg: string | undefined) => {
      let candidates: string[] = []
      try {
        candidates = await candidatesFor(type, arg)
      } catch {
        return
      }
      if (candidates.length > 0) process.stdout.write(`${candidates.join('\n')}\n`)
    })
}
