/** Batch `op item get -` emits pretty-printed objects back-to-back, not an
 * array. Each object's closing brace is at column 0 — split there. */
export function parseConcatenatedJson<T>(raw: string): T[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as T[]
  return trimmed
    .split(/^\}/m)
    .filter((part) => part.trim())
    .map((part) => JSON.parse(`${part}}`) as T)
}
