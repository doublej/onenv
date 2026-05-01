import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import type { ApiConfig } from './lib/config.js'
import { requestLogger } from './lib/logging.js'
import {
  disableVar,
  editVar,
  enableVar,
  exportEnabledValues,
  getNamespaceVars,
  getNamespaces,
  setVar,
  unsetVar,
} from './lib/manager-service.js'
import { PermissionService } from './lib/permission.js'
import { rateLimiter } from './lib/rate-limit.js'

const setSchema = z.object({
  namespace: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
})

const nsKeySchema = z.object({
  namespace: z.string().min(1),
  key: z.string().min(1),
})

const exportSchema = z.object({
  namespaces: z.array(z.string().min(1)).min(1),
})

function errorResponse(res: Response, code: number, message: string): void {
  res.status(code).json({ error: message })
}

function authMiddleware(config: ApiConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      next()
      return
    }

    const token = req.header('x-onenv-token')
    if (token !== config.authToken) {
      errorResponse(res, 401, 'unauthorized')
      return
    }

    next()
  }
}

type PermissionAction = 'set' | 'edit' | 'unset' | 'disable' | 'enable' | 'export'

interface PermissionOptions {
  action: PermissionAction
  namespace?: string
  key?: string
  details?: string
}

async function withPermission(
  permissionService: PermissionService,
  req: Request,
  res: Response,
  opts: PermissionOptions,
): Promise<boolean> {
  const allowed = await permissionService.request(
    {
      action: opts.action,
      namespace: opts.namespace,
      key: opts.key,
      details: opts.details ?? `${req.method} ${req.path}`,
    },
    req.header('x-agent-name') ?? undefined,
  )

  if (!allowed) {
    errorResponse(res, 403, 'permission denied')
    return false
  }

  return true
}

export function createApp(config: ApiConfig): express.Express {
  const app = express()
  const permissionService = new PermissionService(config)

  app.use(requestLogger())
  app.use(express.json({ limit: '32kb' }))
  app.use(authMiddleware(config))
  app.use(rateLimiter())

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  app.get('/v1/namespaces', async (_req, res, next) => {
    try {
      const namespaces = await getNamespaces()
      res.json({ namespaces })
    } catch (error) {
      next(error)
    }
  })

  app.get('/v1/namespaces/:namespace/vars', async (req, res, next) => {
    try {
      const vars = await getNamespaceVars(req.params.namespace)
      res.json({ vars })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/vars/set', async (req, res, next) => {
    try {
      const input = setSchema.parse(req.body)
      const opts = { action: 'set' as const, namespace: input.namespace, key: input.key }
      if (!(await withPermission(permissionService, req, res, opts))) return

      await setVar(input.namespace, input.key, input.value)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/vars/edit', async (req, res, next) => {
    try {
      const input = setSchema.parse(req.body)
      const opts = { action: 'edit' as const, namespace: input.namespace, key: input.key }
      if (!(await withPermission(permissionService, req, res, opts))) return

      await editVar(input.namespace, input.key, input.value)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/vars/unset', async (req, res, next) => {
    try {
      const input = nsKeySchema.parse(req.body)
      const opts = { action: 'unset' as const, namespace: input.namespace, key: input.key }
      if (!(await withPermission(permissionService, req, res, opts))) return

      await unsetVar(input.namespace, input.key)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/vars/disable', async (req, res, next) => {
    try {
      const input = nsKeySchema.parse(req.body)
      const opts = { action: 'disable' as const, namespace: input.namespace, key: input.key }
      if (!(await withPermission(permissionService, req, res, opts))) return

      await disableVar(input.namespace, input.key)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/vars/enable', async (req, res, next) => {
    try {
      const input = nsKeySchema.parse(req.body)
      const opts = { action: 'enable' as const, namespace: input.namespace, key: input.key }
      if (!(await withPermission(permissionService, req, res, opts))) return

      await enableVar(input.namespace, input.key)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.post('/v1/env/export', async (req, res, next) => {
    try {
      const input = exportSchema.parse(req.body)
      const opts = {
        action: 'export' as const,
        details: `${req.method} ${req.path} namespaces=${input.namespaces.join(',')}`,
      }
      if (!(await withPermission(permissionService, req, res, opts))) return

      const env = await exportEnabledValues(input.namespaces)
      res.json({ env })
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      errorResponse(res, 400, error.issues.map((issue) => issue.message).join('; '))
      return
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    errorResponse(res, 500, message)
  })

  return app
}
