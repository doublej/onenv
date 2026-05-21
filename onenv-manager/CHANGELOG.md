# Changelog

## [0.7.0] — 2026-05-22

### Added

- `ONENV_CONFIRM_MUTATIONS=1` — opt-in macOS dialog that gates every mutating CLI path (`set`, `edit`, `unset`, `import`) with an Allow/Deny prompt naming the action, namespace, and key(s). Deny → `PERMISSION_DENIED`. Non-macOS errors with `PERMISSION_UNSUPPORTED` so the guard fails loud. Optional `PERMISSION_TIMEOUT_MS` (default 120000) caps the dialog wait.

### Removed (breaking)

- The `onenv-api` package is gone. It served HTTP at port 47891 with `x-onenv-token` auth and brokered mutations through an AppleScript dialog. A consumer audit turned up no callers — the agent surface is the CLI. The permission-brokering feature it uniquely offered now lives on the CLI as `ONENV_CONFIRM_MUTATIONS=1` (above). If you were running the api, switch your callers to invoking `onenv` directly with that env set.
- `prime-data-api.ts` and the `<api>` section of the primer are gone; replaced by `<permission>`.

### Changed

- Single-package repo: install.ts no longer prompts for `AGENT_API_TOKEN` or bootstraps the api.

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
