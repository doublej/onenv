import { randomBytes } from 'node:crypto'
import { open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Durable, atomic file write: a reader either sees the previous file or the
// fully-written new one, never a torn intermediate. The temp file is created
// in the SAME directory (so the rename stays on one filesystem — no EXDEV) with
// mode 0600 at open, which closes the world-readable window a post-write chmod
// would leave. fsync before rename guarantees the bytes hit disk first.
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  const tmp = join(dirname(path), `.${randomBytes(8).toString('hex')}.tmp`)
  const fh = await open(tmp, 'wx', 0o600)
  try {
    await fh.writeFile(content, 'utf-8')
    await fh.sync()
    await fh.close()
    await rename(tmp, path)
  } catch (err) {
    await fh.close().catch(() => {})
    await unlink(tmp).catch(() => {})
    throw err
  }
}
