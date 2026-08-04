import type { Command } from 'commander'

/** What kind of value a positional or option value expects. */
export type ValueSource = 'namespaces' | 'keys' | 'items' | 'vaults' | 'groups' | 'files' | 'none'

export interface CompletionArg {
  name: string
  variadic: boolean
  source: ValueSource
}

export interface CompletionOption {
  flags: string[]
  description: string
  source: ValueSource | null
}

export interface CompletionCommand {
  name: string
  description: string
  args: CompletionArg[]
  options: CompletionOption[]
}

const ARG_SOURCES: Record<string, ValueSource> = {
  namespace: 'namespaces',
  input: 'namespaces',
  key: 'keys',
  keys: 'keys',
  item: 'items',
  file: 'files',
  group: 'groups',
}

const OPTION_SOURCES: Record<string, ValueSource> = {
  '--vault': 'vaults',
  '--group': 'groups',
  '--out': 'files',
}

function sourceForArg(name: string): ValueSource {
  return ARG_SOURCES[name.toLowerCase()] ?? 'none'
}

function sourceForOption(longFlag: string | null, takesValue: boolean): ValueSource | null {
  if (!takesValue) return null
  return (longFlag ? OPTION_SOURCES[longFlag] : undefined) ?? 'none'
}

/**
 * Read the shape of every registered command straight off the Commander
 * program, so a new command or flag shows up in the completions for free.
 */
export function describeProgram(program: Command): CompletionCommand[] {
  return program.commands
    .filter((cmd) => !isHidden(cmd))
    .map((cmd) => ({
      name: cmd.name(),
      description: cmd.description(),
      args: cmd.registeredArguments.map((arg) => ({
        name: arg.name(),
        variadic: arg.variadic,
        source: sourceForArg(arg.name()),
      })),
      options: cmd.options.filter((opt) => !opt.hidden).map(describeOption),
    }))
}

/** Global flags accepted before any subcommand. */
export function describeGlobalOptions(program: Command): CompletionOption[] {
  return program.options.filter((opt) => !opt.hidden).map(describeOption)
}

function describeOption(opt: {
  flags: string
  short?: string | null
  long?: string | null
  description: string
  required?: boolean
  optional?: boolean
}): CompletionOption {
  const flags = [opt.short, opt.long].filter((f): f is string => Boolean(f))
  const takesValue = Boolean(opt.required || opt.optional)
  return {
    flags: flags.length > 0 ? flags : [opt.flags.split(/[ ,|]/)[0]],
    description: opt.description,
    source: sourceForOption(opt.long ?? null, takesValue),
  }
}

function isHidden(cmd: Command): boolean {
  return cmd.name().startsWith('__') || Boolean((cmd as unknown as { _hidden?: boolean })._hidden)
}
