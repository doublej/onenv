# Report: agent-aware harness + persistence options

Date: 2026-08-18 · Branch: main · Commits: f0b1f44, 5f4703d, a326aa1

## Execution mode deviation

The plan delegated implementation to opencode/deepseek on host `zen`.
Preflight failed: `zen` does not resolve (not in `~/.ssh/config`, `/etc/hosts`,
or DNS). Assumption taken: implement locally instead — the done-condition
(changes + green `just check` + this report) is unchanged.

## Plan review: agent-awareness additions (per feedback)

Beyond the plan as written:

1. **Primer command table** (`prime-data-cli.ts`): added a `shell` CommandSpec.
   The primer tells agents "use only the commands documented below", so an
   unlisted `onenv shell` would have been invisible — the biggest gap.
   `run`/`export -- cmd` output contracts now mention the marker too.
2. **Partial priming**: `next_action` compares `ONENV_ACTIVE` against the
   flat-injected namespaces (`.onenv.json` minus `fileOnlyNamespaces`) and
   names the missing ones — not just a primed/not-primed boolean.
3. **Actionable nesting refusal**: the VALIDATION error shows the current
   `ONENV_ACTIVE` value and says to run commands directly or `exit` first.
4. **NOT-primed message** also points at `onenv check` for verification.

## Delivered

- `ONENV_ACTIVE=<ns1,ns2,...>` set by `run`, `export <ns> -- <cmd>`, `shell`,
  and emitted as an export line by `--format shell` (single source:
  `injectedEnv()` in `src/lib/shell-export.ts`).
- New `src/commands/shell.ts` — `onenv shell [namespaces]`: `$SHELL` (fallback
  `/bin/sh`) with `stdio: inherit`, exit code mirrored, defaults to
  `.onenv.json` flat namespaces, refuses nesting. Completion covered
  automatically (generated from the live Commander program).
- Prime: `onenv_active` in `DetectedSection` (JSON/XML/MD), three-way
  `next_action`, SESSION workflow subsection with all persistence options.
- Docs: export/run help examples, README quick reference + intro, CLAUDE.md.

## Tests

- `just check` green: loc-check, lint, typecheck, 240 tests / 36 files.
- New/updated: `shell-export.test.ts` (marker line, `injectedEnv`),
  `shell.test.ts` (nesting refusal, namespace parsing), `prime.test.ts`
  (all three next-action variants, fileOnly exclusion, XML/MD rendering),
  `cli.contract.test.ts` (marker in child env + shell-format output),
  help snapshots regenerated.
- Deviation from the test plan: no test spawns a real `$SHELL` — the env
  construction is unit-tested via `injectedEnv` and the export contract test
  verifies the marker in a real child process; spawning an interactive shell
  in vitest is not meaningful.
- Manual smoke: all three prime variants and the nesting refusal verified
  against a fixture project.
