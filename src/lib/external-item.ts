import { runOp } from './onenv-client.js'

export interface ExternalField {
  id: string
  type: string
  label?: string
  purpose?: string
  value?: string
}

export interface ExternalItem {
  title: string
  category?: string
  primaryUrl?: string
  fields: ExternalField[]
}

export interface ExternalItemSummary {
  id: string
  title: string
  vault?: string
  category?: string
}

interface RawExternalItem {
  title?: string
  category?: string
  urls?: { primary?: boolean; href?: string }[]
  fields?: ExternalField[]
}

interface RawListItem {
  id?: string
  title?: string
  category?: string
  vault?: { name?: string }
}

/**
 * op with the service-account token stripped. onenv injects
 * OP_SERVICE_ACCOUNT_TOKEN at startup (cache included), and that vault-scoped
 * account gets a 403 on every other vault. Stripping it makes op fall back to
 * the user's own auth (desktop-app integration / `op signin`), which is the
 * auth that can see items outside the onenv vault.
 */
function userEnv(): NodeJS.ProcessEnv {
  const { OP_SERVICE_ACCOUNT_TOKEN: _omit, ...env } = process.env
  return env
}

/**
 * List every item the user's own op auth can see, for interactive pickers.
 * Titles only — no field values are fetched here.
 */
export async function listExternalItems(vault?: string): Promise<ExternalItemSummary[]> {
  const args = ['item', 'list', '--format', 'json']
  if (vault) args.push('--vault', vault)
  const raw = (await runOp(args, undefined, userEnv())).trim()
  if (!raw || raw === '[]') return []
  const items = JSON.parse(raw) as RawListItem[]
  return items
    .filter((item): item is RawListItem & { id: string } => typeof item.id === 'string')
    .map((item) => ({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : item.id,
      vault: item.vault?.name,
      category: item.category,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * Fetch a regular (non-onenv) item by title or ID. Unlike every other read,
 * this is NOT scoped to ONENV_VAULT, and it runs op with the user's own auth
 * (see userEnv).
 */
export async function getExternalItem(ref: string, vault?: string): Promise<ExternalItem> {
  const args = ['item', 'get', ref, '--format', 'json']
  if (vault) args.push('--vault', vault)
  const item = JSON.parse(await runOp(args, undefined, userEnv())) as RawExternalItem
  const urls = item.urls ?? []
  return {
    title: typeof item.title === 'string' ? item.title : ref,
    category: typeof item.category === 'string' ? item.category : undefined,
    primaryUrl: (urls.find((u) => u.primary) ?? urls[0])?.href,
    fields: (item.fields ?? []).map(({ id, type, label, purpose, value }) => ({
      id,
      type,
      label,
      purpose,
      value,
    })),
  }
}
