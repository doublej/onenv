import type { Command } from 'commander'
import {
  addLearning,
  type Learning,
  learningScore,
  loadLearnings,
  topLearnings,
  voteLearning,
} from '../lib/learnings.js'
import { output } from '../lib/output.js'

/** Signed score, e.g. +4, 0, -2. */
function fmtScore(l: Learning): string {
  const s = learningScore(l)
  return s > 0 ? `+${s}` : `${s}`
}

async function learnAction(parts: string[]): Promise<void> {
  // Variadic positional: captures the full phrase whether quoted (one token) or unquoted (many).
  const joined = (parts ?? []).join(' ').trim()
  if (!joined) {
    output({ err: 'EMPTY', hint: 'onenv learn "the strategy that worked"' })
    return
  }

  const { learning, created } = await addLearning(joined)
  output({
    ok: true,
    id: learning.id,
    created,
    score: learningScore(learning),
    text: learning.text,
  })
}

async function voteAction(id: string, rawDir: string): Promise<void> {
  const dir = rawDir.toLowerCase()
  if (dir !== 'up' && dir !== 'down') {
    output({ err: 'BAD_DIR', hint: 'Use `up` or `down`.' })
    return
  }

  const learning = await voteLearning(id, dir)
  if (!learning) {
    output({ err: 'NOT_FOUND', hint: `No learning '${id}'. Run \`onenv learnings\`.` })
    return
  }

  output({
    ok: true,
    id: learning.id,
    score: learningScore(learning),
    up: learning.up,
    down: learning.down,
  })
}

async function learningsAction(options: { limit: string; fmt: string }): Promise<void> {
  const all = await loadLearnings()
  if (all.length === 0) {
    console.log('No learnings yet. Add one with `onenv learn "..."`.')
    return
  }

  const limit = Number.parseInt(options.limit, 10) || 10
  const top = topLearnings(all, limit)

  if (options.fmt === 'jsonl') {
    for (const l of top) {
      console.log(
        JSON.stringify({ id: l.id, score: learningScore(l), up: l.up, down: l.down, text: l.text }),
      )
    }
    return
  }

  printTable(top, all.length)
}

function printTable(top: Learning[], total: number): void {
  const idW = Math.max(2, ...top.map((l) => l.id.length))
  const scW = Math.max(5, ...top.map((l) => fmtScore(l).length))
  const lines = top.map(
    (l, i) =>
      `  ${String(i + 1).padStart(2)}  ${l.id.padEnd(idW)}  ${fmtScore(l).padStart(scW)}  ${l.text}`,
  )
  console.log(`  ${'#'.padStart(2)}  ${'ID'.padEnd(idW)}  ${'SCORE'.padStart(scW)}  LEARNING`)
  console.log(lines.join('\n'))
  console.error(`\n  ${total} learning${total !== 1 ? 's' : ''} total`)
}

export function registerLearnCommands(program: Command): void {
  program
    .command('learn')
    .description('Record a reusable onenv learning for future agents (shared memory)')
    .argument('[text...]', 'The learning, one concrete reusable sentence')
    .action(learnAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv learn "Use 'export ns -- cmd' to inject without --reveal"
      Record a learning — idempotent, same text returns the same id
  $ onenv learn this also works unquoted
      Bare words are joined into one learning`,
    )

  program
    .command('vote')
    .description('Vote up or down on a learning (see `onenv learnings`)')
    .argument('<id>', 'Learning ID (e.g. La1b2c3)')
    .argument('<dir>', 'up or down')
    .action(voteAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv vote La1b2c3 up
      Upvote a learning you actually used
  $ onenv vote La1b2c3 down
      Downvote a learning that did not pan out`,
    )

  program
    .command('learnings')
    .description('List top onenv learnings by vote score')
    .option('--limit <n>', 'Max learnings to show', '10')
    .option('--fmt <fmt>', 'Output format: table|jsonl', 'table')
    .action(learningsAction)
    .addHelpText(
      'after',
      `
Examples:
  $ onenv learnings
      Human table of the top learnings by score
  $ onenv learnings --fmt jsonl --limit 20
      JSON lines for parsing — one object per learning`,
    )
}
