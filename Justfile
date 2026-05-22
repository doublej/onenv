set shell := ["zsh", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

# Dry-run a release (no bumps, no commit, no tag) — prints the draft changelog
[group('release')]
release-preview BUMP="patch":
    bun run scripts/release.ts {{BUMP}} --dry-run

# Cut a release: bump versions, draft + open changelog, commit, tag. Does NOT push.
[group('release')]
release BUMP="patch":
    bun run scripts/release.ts {{BUMP}}

# Same but skips the editor pause (uses the auto-generated changelog as-is)
[group('release')]
release-quick BUMP="patch":
    bun run scripts/release.ts {{BUMP}} --yes

# Push the most recent tag and main
[group('release')]
release-push:
    #!/usr/bin/env zsh
    set -euo pipefail
    tag=$(git describe --tags --abbrev=0)
    echo "→ pushing main + ${tag}"
    git push origin main
    git push origin "${tag}"
    if command -v gh >/dev/null 2>&1; then
        echo "→ creating gh release"
        gh release create "${tag}" --notes-from-tag
    else
        echo "→ skip gh release: gh CLI not on PATH"
    fi
