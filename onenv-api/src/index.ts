import { loadConfig } from './lib/config.js'
import { resolveServiceAccountToken } from './lib/op-token.js'
import { createApp } from './server.js'

async function main(): Promise<void> {
  await resolveServiceAccountToken()

  const config = loadConfig()
  const app = createApp(config)

  const opAuth = process.env.OP_SERVICE_ACCOUNT_TOKEN ? 'service-account' : 'biometric'

  const server = app.listen(config.port, config.host, () => {
    console.log(`onenv-api listening on http://${config.host}:${config.port}`)
    console.log(`permission mode: ${config.permissionMode}`)
    console.log(`1password auth: ${opAuth}`)
  })

  const shutdown = (signal: string) => {
    console.log(`received ${signal}, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
