import type { NextFunction, Request, Response } from 'express'

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      next()
      return
    }
    const start = Date.now()
    res.on('finish', () => {
      const entry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        agent: req.header('x-agent-name') ?? null,
      }
      console.log(JSON.stringify(entry))
    })
    next()
  }
}
