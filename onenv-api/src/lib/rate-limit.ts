import type { NextFunction, Request, Response } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60

export function rateLimiter() {
  const buckets = new Map<string, Bucket>()

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') {
      next()
      return
    }
    const key = req.header('x-onenv-token') ?? req.ip ?? 'unknown'
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
      next()
      return
    }

    if (bucket.count >= MAX_PER_WINDOW) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'rate limit exceeded' })
      return
    }

    bucket.count += 1
    next()
  }
}
