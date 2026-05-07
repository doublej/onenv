import type { NextFunction, Request, Response } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60

interface RateLimiterOptions {
  key?: (req: Request) => string
  maxPerWindow?: number
  methods?: 'all' | 'mutating'
  windowMs?: number
}

export function rateLimiter(options: RateLimiterOptions = {}) {
  const buckets = new Map<string, Bucket>()
  const maxPerWindow = options.maxPerWindow ?? MAX_PER_WINDOW
  const methods = options.methods ?? 'mutating'
  const windowMs = options.windowMs ?? WINDOW_MS

  return (req: Request, res: Response, next: NextFunction) => {
    if (methods === 'mutating' && req.method === 'GET') {
      next()
      return
    }
    const key = options.key?.(req) ?? req.header('x-onenv-token') ?? req.ip ?? 'unknown'
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    if (bucket.count >= maxPerWindow) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'rate limit exceeded' })
      return
    }

    bucket.count += 1
    next()
  }
}
