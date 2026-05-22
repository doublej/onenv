#!/usr/bin/env bash
# PreToolUse hook for Claude Code: enforces `onenv prime` once per session
# before any other `onenv <cmd>` runs in a Bash tool call.
#
# Why: prime carries safety context (item titles are sensitive metadata, prefer
# `onenv list <ns>` over unfiltered listings, avoid raw `op`, etc.). Forcing
# agents through prime first means that context is in their working memory
# before they touch the vault.
#
# Install (global):
#   cp scripts/hooks/onenv-prime-gate.sh ~/.claude/hooks/
#   chmod +x ~/.claude/hooks/onenv-prime-gate.sh
#   # then add to ~/.claude/settings.json hooks.PreToolUse:
#   #   { "matcher": "Bash",
#   #     "hooks": [{ "type": "command",
#   #                 "command": "bash ~/.claude/hooks/onenv-prime-gate.sh" }] }
#
# The marker file lives at $TMPDIR/onenv-primed-<session_id>. Sessions are
# isolated; new sessions require a fresh prime. To bypass (e.g. for a
# scripted run), set ONENV_SKIP_PRIME_GATE=1 in the environment Claude Code
# inherits, or run with `command onenv ...` / `\onenv ...`.

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
session_id="$(printf '%s' "$input" | jq -r '.session_id // "default"')"

# Only inspect commands that invoke `onenv` as a word.
if ! printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_/.-])onenv([^[:alnum:]_-]|$)'; then
  exit 0
fi

# Escape hatch.
if [ "${ONENV_SKIP_PRIME_GATE:-}" = "1" ]; then
  exit 0
fi

tmp_root="${TMPDIR:-/tmp}"
marker="${tmp_root%/}/onenv-primed-${session_id}"

# If the command runs `onenv prime` anywhere, mark and allow.
if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_-])onenv[[:space:]]+prime([^[:alnum:]_-]|$)'; then
  touch "$marker"
  exit 0
fi

# Marker present → allow.
if [ -f "$marker" ]; then
  exit 0
fi

# Block with guidance. Exit 2 surfaces stderr to the agent as a tool error.
{
  echo "Blocked: this session has not run 'onenv prime' yet."
  echo
  echo "Run 'onenv prime' first — it loads the safety + usage contract"
  echo "(item titles are sensitive metadata, prefer scoped 'onenv list <ns>',"
  echo "never echo raw secrets, etc.) into your working context."
  echo
  echo "Bypass for one call: prefix with 'ONENV_SKIP_PRIME_GATE=1 '."
} >&2

exit 2
