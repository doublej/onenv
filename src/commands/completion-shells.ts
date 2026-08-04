import type { CompletionCommand, CompletionOption, ValueSource } from './completion-data.js'

/** Which `onenv __complete` type feeds positional N of a command (1-based). */
function sourceForPosition(cmd: CompletionCommand, position: number): ValueSource {
  const fixed = cmd.args[position - 1]
  if (fixed) return fixed.source
  const last = cmd.args[cmd.args.length - 1]
  return last?.variadic ? last.source : 'none'
}

function flagsOf(cmd: CompletionCommand): string[] {
  return cmd.options.flatMap((opt) => opt.flags)
}

function clean(text: string): string {
  return text.replace(/'/g, '').replace(/\s+/g, ' ').trim()
}

export function renderBashCompletion(commands: CompletionCommand[]): string {
  const names = commands.map((c) => c.name).join(' ')
  const flagCases = commands
    .map((cmd) => `      ${cmd.name}) flags="${flagsOf(cmd).join(' ')}" ;;`)
    .join('\n')
  const sourceCases = commands
    .map(
      (cmd) =>
        `      ${cmd.name}) case $pos in 1) src="${sourceForPosition(cmd, 1)}" ;; 2) src="${sourceForPosition(cmd, 2)}" ;; *) src="${sourceForPosition(cmd, 3)}" ;; esac ;;`,
    )
    .join('\n')

  return `# onenv shell completion for bash — regenerate with: onenv completion bash

__onenv_call() {
  onenv __complete "$@" 2>/dev/null
}

_onenv() {
  local cur prev cmd flags src pos i w
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd=""
  pos=0

  for ((i = 1; i < COMP_CWORD; i++)); do
    w="\${COMP_WORDS[i]}"
    [[ $w == -* ]] && continue
    if [[ -z $cmd ]]; then cmd="$w"; else pos=$((pos + 1)); fi
  done
  pos=$((pos + 1))

  if [[ -z $cmd ]]; then
    COMPREPLY=($(compgen -W "${names}" -- "$cur"))
    return
  fi

  if [[ $cur == -* ]]; then
    flags=""
    case $cmd in
${flagCases}
    esac
    COMPREPLY=($(compgen -W "$flags --help" -- "$cur"))
    return
  fi

  case $prev in
    --vault) COMPREPLY=($(compgen -W "$(__onenv_call vaults)" -- "$cur")); return ;;
    -g|--group) COMPREPLY=($(compgen -W "$(__onenv_call groups "\${COMP_WORDS[2]}")" -- "$cur")); return ;;
    -o|--out) COMPREPLY=($(compgen -f -- "$cur")); return ;;
  esac

  src="none"
  case $cmd in
${sourceCases}
  esac

  case $src in
    namespaces) COMPREPLY=($(compgen -W "$(__onenv_call namespaces)" -- "$cur")) ;;
    keys) COMPREPLY=($(compgen -W "$(__onenv_call keys "\${COMP_WORDS[2]}")" -- "$cur")) ;;
    items) IFS=$'\\n' COMPREPLY=($(compgen -W "$(__onenv_call items)" -- "$cur")) ;;
    vaults) COMPREPLY=($(compgen -W "$(__onenv_call vaults)" -- "$cur")) ;;
    groups) COMPREPLY=($(compgen -W "$(__onenv_call groups "\${COMP_WORDS[2]}")" -- "$cur")) ;;
    files) COMPREPLY=($(compgen -f -- "$cur")) ;;
  esac
}

complete -F _onenv onenv
`
}

export function renderFishCompletion(commands: CompletionCommand[]): string {
  const lines: string[] = [
    '# onenv shell completion for fish — regenerate with: onenv completion fish',
    '',
    'complete -c onenv -f',
    '',
    '# fish matches substrings, so item titles fuzzy-search out of the box.',
    'function __onenv_complete; onenv __complete $argv 2>/dev/null; end',
    'function __onenv_namespace_arg; set -l words (commandline -opc); if test (count $words) -ge 3; echo $words[3]; end; end',
    '',
  ]

  for (const cmd of commands) {
    lines.push(
      `complete -c onenv -n __fish_use_subcommand -a ${cmd.name} -d '${clean(cmd.description)}'`,
    )
    for (const opt of cmd.options) {
      lines.push(`complete -c onenv -n '__fish_seen_subcommand_from ${cmd.name}' ${fishFlags(opt)}`)
    }
    for (const source of new Set(cmd.args.map((a) => a.source))) {
      const arg = fishArgSource(source)
      if (arg) {
        lines.push(`complete -c onenv -n '__fish_seen_subcommand_from ${cmd.name}' -a "${arg}"`)
      }
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function fishFlags(opt: CompletionOption): string {
  const parts = opt.flags.map((flag) =>
    flag.startsWith('--') ? `-l ${flag.slice(2)}` : `-s ${flag.slice(1)}`,
  )
  if (opt.source) parts.push('-r')
  parts.push(`-d '${clean(opt.description)}'`)
  return parts.join(' ')
}

function fishArgSource(source: ValueSource): string | null {
  switch (source) {
    case 'namespaces':
      return '(__onenv_complete namespaces)'
    case 'keys':
      return '(__onenv_complete keys (__onenv_namespace_arg))'
    case 'items':
      return '(__onenv_complete items)'
    case 'vaults':
      return '(__onenv_complete vaults)'
    case 'groups':
      return '(__onenv_complete groups (__onenv_namespace_arg))'
    default:
      return null
  }
}
