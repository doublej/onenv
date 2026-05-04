#!/usr/bin/env bash
# Pre-tool-use hook: blocks `git commit` / `git push` when dist/ is stale.
# Reads the Claude Code hook JSON from stdin, extracts the bash command,
# and only acts when the command runs git commit or git push (word boundary).

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

# Match `git commit` or `git push` as standalone words (not `git committer` etc).
if ! printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+(commit|push)([^[:alnum:]_]|$)'; then
  exit 0
fi

repo="$(cd "$(dirname "$0")/../.." && pwd)"
stale=()

newest_src() {
  local dir="$1"
  [ -d "$dir" ] || return 1
  find "$dir" -type f \( -name '*.ts' -o -name '*.json' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 \
    | xargs -0 stat -f '%m' 2>/dev/null \
    | sort -nr \
    | head -1
}

dist_mtime() {
  [ -f "$1" ] || { echo 0; return; }
  stat -f '%m' "$1"
}

check_pkg() {
  local pkg="$1" dist_file="$2"
  local src_t dist_t
  src_t="$(newest_src "$repo/$pkg/src" || echo 0)"
  dist_t="$(dist_mtime "$repo/$pkg/$dist_file")"
  if [ "${src_t:-0}" -gt "${dist_t:-0}" ]; then
    stale+=("$pkg")
  fi
}

check_pkg onenv-manager dist/cli.js
check_pkg onenv-api dist/index.js

if [ "${#stale[@]}" -eq 0 ]; then
  exit 0
fi

{
  echo "Blocked: $(printf '%s, ' "${stale[@]}" | sed 's/, $//') has source newer than dist/."
  echo "Rebuild before committing or pushing:"
  echo "  bun run install.ts        # full installer (rebuild + relink)"
  echo "  bun run build             # per package, run inside onenv-manager/ or onenv-api/"
  echo
  echo "Globally linked 'onenv' binary points at dist/cli.js — stale dist ships old behavior."
} >&2

exit 2
