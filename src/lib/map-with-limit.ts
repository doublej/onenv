export async function mapWithLimit<I, O>(
  items: I[],
  limit: number,
  fn: (i: I) => Promise<O>,
): Promise<O[]> {
  const out: O[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out.push(await fn(items[i]))
    }
  })
  await Promise.all(workers)
  return out
}
