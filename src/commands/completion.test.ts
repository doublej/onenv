import { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import { renderCompletion } from './completion.js'
import { describeProgram } from './completion-data.js'

function buildProgram(): Command {
  const program = new Command().name('onenv').option('--json', 'Force JSON output')

  program
    .command('list')
    .description('List namespaces or variables: one per line')
    .argument('[namespace]', 'Namespace')
    .option('--meta', 'Include group, path [and] type')
    .action(() => {})

  program
    .command('unset')
    .description('Delete variables')
    .argument('<namespace>', 'Namespace')
    .argument('<keys...>', 'Variable names')
    .option('-y, --yes', 'Skip confirmation')
    .action(() => {})

  program
    .command('explode')
    .description('Explode an item')
    .argument('[namespace]', 'Namespace')
    .argument('[item]', 'Item title')
    .option('--vault <name>', 'Source vault')
    .option('-p, --prefix <prefix>', 'Key prefix')
    .action(() => {})

  program
    .command('build-file')
    .description('Rebuild JSON')
    .argument('<namespace>', 'Namespace')
    .requiredOption('-g, --group <name>', 'Group')
    .option('-o, --out <path>', 'Output path')
    .action(() => {})

  program
    .command('__complete', { hidden: true })
    .argument('<type>')
    .action(() => {})

  return program
}

describe('describeProgram', () => {
  it('covers every visible command and skips internal ones', () => {
    const names = describeProgram(buildProgram()).map((c) => c.name)
    expect(names).toEqual(['list', 'unset', 'explode', 'build-file'])
  })

  it('maps argument names to value sources', () => {
    const explode = describeProgram(buildProgram()).find((c) => c.name === 'explode')
    expect(explode?.args).toEqual([
      { name: 'namespace', variadic: false, source: 'namespaces' },
      { name: 'item', variadic: false, source: 'items' },
    ])
    expect(explode?.options.find((o) => o.flags.includes('--vault'))?.source).toBe('vaults')
    expect(explode?.options.find((o) => o.flags.includes('--prefix'))?.source).toBe('none')
  })

  it('marks value-less flags so they complete no argument', () => {
    const unset = describeProgram(buildProgram()).find((c) => c.name === 'unset')
    expect(unset?.options[0]).toEqual({
      flags: ['-y', '--yes'],
      description: 'Skip confirmation',
      source: null,
    })
  })
})

describe('renderCompletion', () => {
  const program = buildProgram()

  it.each(['zsh', 'bash', 'fish'] as const)('mentions every command for %s', (shell) => {
    const script = renderCompletion(program, shell)
    for (const name of ['list', 'unset', 'explode', 'build-file']) {
      expect(script).toContain(name)
    }
    expect(script).not.toContain('__complete}')
  })

  it('wires zsh positionals to their dynamic sources', () => {
    const script = renderCompletion(program, 'zsh')
    expect(script).toContain("'1:namespace:__onenv_namespaces'")
    expect(script).toContain("'2:item:__onenv_items'")
    expect(script).toContain("'*:keys:__onenv_keys'")
    expect(script).toContain(":vault:__onenv_vaults'")
    expect(script).toContain(":out:_files'")
  })

  it('strips zsh spec delimiters from descriptions', () => {
    const script = renderCompletion(program, 'zsh')
    expect(script).toContain('[Include group, path and type]')
    expect(script).toContain("'list:List namespaces or variables one per line'")
  })

  it('completes item titles with an unanchored matcher for fuzzy search', () => {
    expect(renderCompletion(program, 'zsh')).toContain("compadd -M 'l:|=* r:|=*' -a values")
  })

  it('emits shell-specific entry points', () => {
    expect(renderCompletion(program, 'zsh')).toContain('#compdef onenv')
    expect(renderCompletion(program, 'bash')).toContain('complete -F _onenv onenv')
    expect(renderCompletion(program, 'fish')).toContain(
      'complete -c onenv -n __fish_use_subcommand -a explode',
    )
  })
})
