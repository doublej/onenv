set shell := ["zsh", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list
    @echo ''
    @echo "branch: $(git branch --show-current 2>/dev/null || echo 'n/a')"

[group('setup')]
install:
    bun install

[group('develop')]
dev:
    bun run dev

[group('develop')]
run *ARGS:
    bun run start {{ARGS}}

[group('quality')]
lint:
    bun run lint

[group('quality')]
lint-fix:
    bun run lint:fix

[group('quality')]
typecheck:
    bunx tsc --noEmit

[group('quality')]
test:
    bun run test

[group('quality')]
loc-check:
    #!/usr/bin/env zsh
    setopt null_glob
    err=0
    for f in src/**/*.ts; do
        lines=$(wc -l < "$f")
        if (( lines > 400 )); then echo "error: $f ($lines lines, max 400)"; err=1
        elif (( lines > 300 )); then echo "warn: $f ($lines lines, target ≤300)"; fi
    done
    exit $err

[group('quality')]
check:
    @echo '→ Checking file lengths...'
    just loc-check
    @echo '→ Running lint...'
    just lint
    @echo '→ Running typecheck...'
    just typecheck
    @echo '→ Running tests...'
    just test

[group('build')]
build:
    bun run build

[group('cleanup')]
clean:
    rm -rf dist/ node_modules/.cache/

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
