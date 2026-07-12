import { CliError } from '../lib/errors.js'
import { mapWithLimit } from '../lib/map-with-limit.js'
import {
  getItemWithMeta,
  type ItemMeta,
  setValueWithMeta,
  unsetValue,
} from '../lib/onenv-client.js'

const SNAPSHOT_PARALLEL_LIMIT = 10

export interface SnapshotEntry {
  key: string
  existed: boolean
  prior?: { value: string } & ItemMeta
}

export async function fetchSnapshot(namespace: string, keys: string[]): Promise<SnapshotEntry[]> {
  return await mapWithLimit(keys, SNAPSHOT_PARALLEL_LIMIT, async (key) => {
    try {
      const prior = await getItemWithMeta(namespace, key)
      return { key, existed: true, prior }
    } catch (err) {
      if (err instanceof CliError && err.code === 'NOT_FOUND') {
        return { key, existed: false }
      }
      throw err
    }
  })
}

export async function rollback(
  namespace: string,
  snapshot: SnapshotEntry[],
  written: string[],
  originalErr: unknown,
  context: string,
): Promise<void> {
  const byKey = new Map(snapshot.map((s) => [s.key, s]))
  const rollbackErrs: unknown[] = []
  for (const key of written) {
    const snap = byKey.get(key)
    try {
      if (snap?.existed && snap.prior) {
        await setValueWithMeta(namespace, key, snap.prior.value, {
          group: snap.prior.group,
          path: snap.prior.path,
          type: snap.prior.type,
        })
      } else {
        await unsetValue(namespace, key)
      }
    } catch (e) {
      rollbackErrs.push(e)
    }
  }
  if (rollbackErrs.length > 0) {
    const origMsg = originalErr instanceof Error ? originalErr.message : String(originalErr)
    const detail = rollbackErrs.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')
    process.stderr.write(
      `[onenv] rollback after ${context} failure had errors. Original: ${origMsg}. Rollback errors: ${detail}\n`,
    )
  }
}
