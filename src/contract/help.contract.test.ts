// --help is a binding contract: agents read it to learn the flag surface and
// fail silently when it drifts (see the agent-friendliness memory). These
// snapshots turn any wording/flag change into a visible diff. Re-run with
// `bun run vitest -u src/contract` only when the change is intentional.
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureBuilt, makeWorkspace, runCli } from './harness.js'

let ws: string

beforeAll(() => {
  ensureBuilt()
  ws = makeWorkspace([])
}, 60_000)

describe('help text contract', () => {
  for (const cmd of [
    ['--help'],
    ['explode', '--help'],
    ['export', '--help'],
    ['get', '--help'],
    ['list', '--help'],
  ]) {
    it(`onenv ${cmd.join(' ')}`, () => {
      const r = runCli(cmd, ws)
      expect(r.code).toBe(0)
      expect(r.stdout).toMatchSnapshot()
    })
  }
})
