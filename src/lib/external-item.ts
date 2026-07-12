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

interface RawExternalItem {
  title?: string
  category?: string
  urls?: { primary?: boolean; href?: string }[]
  fields?: ExternalField[]
}

/**
 * Fetch a regular (non-onenv) item by title or ID. Unlike every other read,
 * this is NOT scoped to ONENV_VAULT — without --vault, op searches every
 * vault the current auth can see (a vault-scoped service account will only
 * find items in its own vault).
 */
export async function getExternalItem(ref: string, vault?: string): Promise<ExternalItem> {
  const args = ['item', 'get', ref, '--format', 'json']
  if (vault) args.push('--vault', vault)
  const item = JSON.parse(await runOp(args)) as RawExternalItem
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
