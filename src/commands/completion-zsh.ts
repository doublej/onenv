import type {
  CompletionArg,
  CompletionCommand,
  CompletionOption,
  ValueSource,
} from './completion-data.js'

const ACTIONS: Record<ValueSource, string> = {
  namespaces: '__onenv_namespaces',
  keys: '__onenv_keys',
  items: '__onenv_items',
  vaults: '__onenv_vaults',
  groups: '__onenv_groups',
  files: '_files',
  none: ' ',
}

/** zsh spec strings are `[`/`]`/`:`-delimited, so strip those from prose. */
function clean(text: string): string {
  return text
    .replace(/[[\]:'"`$\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '') || 'arg'
}

function optionSpec(opt: CompletionOption): string {
  const description = clean(opt.description)
  const action = opt.source ? `:${tag(opt.flags[opt.flags.length - 1])}:${ACTIONS[opt.source]}` : ''
  if (opt.flags.length > 1) {
    return `'(${opt.flags.join(' ')})'{${opt.flags.join(',')}}'[${description}]${action}'`
  }
  return `'${opt.flags[0]}[${description}]${action}'`
}

function argSpec(arg: CompletionArg, index: number): string {
  const name = tag(arg.name)
  const position = arg.variadic ? '*' : String(index + 1)
  return `'${position}:${name}:${ACTIONS[arg.source]}'`
}

function commandCase(cmd: CompletionCommand): string {
  const specs = [
    ...cmd.options.map(optionSpec),
    ...cmd.args.map(argSpec),
    "'(-h --help)'{-h,--help}'[show help]'",
  ]
  return `    ${cmd.name})
      _arguments -s \\
        ${specs.join(' \\\n        ')} && ret=0
      ;;`
}

export function renderZshCompletion(
  commands: CompletionCommand[],
  globals: CompletionOption[],
): string {
  const commandList = commands
    .map((cmd) => `    '${cmd.name}:${clean(cmd.description)}'`)
    .join('\n')
  const globalSpecs = globals.map(optionSpec)

  return `#compdef onenv
# onenv shell completion for zsh — regenerate with: onenv completion zsh

__onenv_call() {
  onenv __complete "$@" 2>/dev/null
}

__onenv_namespaces() {
  local -a values
  values=(\${(f)"$(__onenv_call namespaces)"})
  _describe -t namespaces 'namespace' values
}

__onenv_keys() {
  local ns=$words[2]
  [[ -z $ns || $ns == -* ]] && return 1
  local -a values
  values=(\${(f)"$(__onenv_call keys $ns)"})
  _describe -t keys 'variable' values
}

__onenv_groups() {
  local ns=$words[2]
  local -a values
  values=(\${(f)"$(__onenv_call groups $ns)"})
  _describe -t groups 'group' values
}

__onenv_vaults() {
  local -a values
  values=(\${(f)"$(__onenv_call vaults)"})
  _describe -t vaults 'vault' values
}

__onenv_items_cache_policy() {
  local -a oldp
  oldp=( "$1"(Nmh+1) )
  (( $#oldp ))
}

# 1Password item titles. Listing every item takes a moment, so results are
# cached for an hour, and matching is anchored nowhere: typing "twijk"
# completes "Troostwijkauctions".
__onenv_items() {
  local -a _onenv_items_cache values
  local policy
  zstyle -s ":completion:\${curcontext}:" cache-policy policy
  [[ -z $policy ]] && zstyle ":completion:\${curcontext}:" cache-policy __onenv_items_cache_policy
  if ! _retrieve_cache onenv_items || (( \${#_onenv_items_cache} == 0 )); then
    _onenv_items_cache=(\${(f)"$(__onenv_call items)"})
    _store_cache onenv_items _onenv_items_cache
  fi
  values=($_onenv_items_cache)
  (( \${#values} )) || return 1
  compadd -M 'l:|=* r:|=*' -a values
}

_onenv() {
  local curcontext="$curcontext" state line ret=1
  typeset -A opt_args

  local -a commands
  commands=(
${commandList}
  )

  _arguments -C -s \\
    ${[...globalSpecs, "'(-h --help)'{-h,--help}'[show help]'"].join(' \\\n    ')} \\
    '1: :->command' \\
    '*:: :->args' && ret=0

  case $state in
    command)
      # A bare namespace is a valid first word too: "onenv aws" lists it.
      _describe -t commands 'onenv command' commands && ret=0
      __onenv_namespaces && ret=0
      ;;
    args)
      case $words[1] in
${commands.map(commandCase).join('\n')}
        *)
          _default && ret=0
          ;;
      esac
      ;;
  esac

  return ret
}

_onenv "$@"
`
}
