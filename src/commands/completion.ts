import { basename } from 'node:path'
import type { Command } from 'commander'
import { validationError } from '../lib/errors.js'
import { describeGlobalOptions, describeProgram } from './completion-data.js'
import { renderBashCompletion, renderFishCompletion } from './completion-shells.js'
import { renderZshCompletion } from './completion-zsh.js'

export type Shell = 'zsh' | 'bash' | 'fish'

const SHELLS: Shell[] = ['zsh', 'bash', 'fish']

function detectShell(): Shell {
  const name = basename(process.env.SHELL ?? '')
  const match = SHELLS.find((shell) => name.includes(shell))
  if (!match) {
    throw validationError(
      `Could not detect the shell from $SHELL ("${process.env.SHELL ?? ''}")`,
      'Pass it explicitly: onenv completion zsh|bash|fish',
    )
  }
  return match
}

export function renderCompletion(program: Command, shell: Shell): string {
  const commands = describeProgram(program)
  switch (shell) {
    case 'zsh':
      return renderZshCompletion(commands, describeGlobalOptions(program))
    case 'bash':
      return renderBashCompletion(commands)
    case 'fish':
      return renderFishCompletion(commands)
  }
}

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Print the shell completion script (zsh, bash, or fish)')
    .argument('[shell]', 'zsh | bash | fish (default: detected from $SHELL)')
    .action((rawShell: string | undefined) => {
      const shell = rawShell ? asShell(rawShell) : detectShell()
      process.stdout.write(renderCompletion(program, shell))
    })
    .addHelpText(
      'after',
      `
Completes every command and flag, plus live values: namespaces, the keys
inside a namespace, groups, vaults, and 1Password item titles for "explode"
(matched anywhere in the title, cached for an hour).

Examples:
  $ onenv completion zsh > "\${fpath[1]}/_onenv"
      Install for zsh, then restart the shell
  $ onenv completion bash > ~/.local/share/bash-completion/completions/onenv
      Install for bash
  $ onenv completion fish > ~/.config/fish/completions/onenv.fish
      Install for fish
  $ eval "$(onenv completion bash)"
      Load it for the current bash session only`,
    )
}

function asShell(value: string): Shell {
  const match = SHELLS.find((shell) => shell === value)
  if (!match) {
    throw validationError(`Unsupported shell "${value}"`, `Supported: ${SHELLS.join(', ')}`)
  }
  return match
}
