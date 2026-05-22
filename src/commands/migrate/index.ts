import type { Command } from 'commander'
import { isJsonMode, output } from '../../lib/output.js'
import { renderScanText } from './render-scan.js'
import { scan } from './scan.js'

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command('migrate').description('Migrate an existing codebase to onenv')

  migrate
    .command('scan')
    .description('Inspect .env* files and propose namespace + role mappings (read-only)')
    .option('-p, --path <dir>', 'Project root to scan (default: cwd)')
    .action(async (options: { path?: string }) => {
      const cwd = options.path ?? process.cwd()
      const result = await scan(cwd)
      if (isJsonMode()) {
        output(result)
        return
      }
      process.stdout.write(`${renderScanText(result)}\n`)
    })
    .addHelpText(
      'after',
      `
Examples:
  $ onenv migrate scan
      Inspect .env files in the current directory
  $ onenv migrate scan --path ../other-project
      Inspect a different project root
  $ onenv migrate scan --json
      Emit a machine-readable scan report`,
    )
}
