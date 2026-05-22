# Changelog

## v0.6.1 — 2026-05-22

### Fixed

- **manager**: stop writing a default 90-day expires field (55dbe03)

### Docs

- **readme**: rewrite as person-facing, mermaid architecture (aec1df8)
- audit + scrub onenv-api / onenv-manager sub-names (cee079d)
- **site**: surface 0.6 changes on the landing page (5bbd821)
- **cli**: inline usage examples on every command (c32a1b2)

### Chore

- **release**: add release harness (f184301)

## [0.6.0] — 2026-05-21

### Added

- `onenv get <ns> <key>` — read a single value. With `--fingerprint`, prints `sha256:<hex>` instead so you can compare without exposing the secret. With `--meta`, includes group/path/type.
- `onenv check` — preflight that compares `process.env` against the project's onenv namespaces and reports per-key match/differ/missing. Never prints values.
- `onenv set --value-stdin` and `onenv edit --value-stdin` — read the value from stdin for scriptable, history-free use (`echo -n "secret" | onenv set ns KEY --value-stdin`).
- `onenv import --overwrite` — replace existing keys. Atomic: either every write lands, or every touched key is restored to its pre-import state.
- `onenv import --from-stdin` — read the JSON from stdin instead of a file path. No filesystem footprint.
- `onenv unset -y, --yes` — skip the confirmation prompt (now required in non-TTY contexts).

### Changed (breaking)

- `onenv import --group <name>` is now required. The previous behavior of deriving the group from the filename has been removed — it leaked temp filenames into 1Password.
- `onenv unset` now prompts in TTY contexts and refuses in non-TTY contexts unless `--yes` is passed.
- `onenv set` and `onenv edit` now refuse to read from non-TTY stdin unless `--value-stdin` is passed — previously the @clack password prompt would silently swallow piped bytes and hang.
- `onenv export` and `onenv run` now hard-error when the same enabled key exists in multiple project namespaces. Previously the merge silently last-write-wins.
