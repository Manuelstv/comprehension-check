#!/usr/bin/env bash
# Fails when files that ship to users changed since <base-ref> but the version
# in .claude-plugin/plugin.json was not raised. Installed copies only update
# when that version changes, so an unbumped change never reaches anyone.
#
# Usage: scripts/check-version.sh [base-ref]   (default: origin/main)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
BASE="${1:-origin/main}"
MANIFEST=.claude-plugin/plugin.json

# Paths that do not change what an installed copy does.
NOT_SHIPPED='^(README\.md|CHANGELOG\.md|LICENSE|tsconfig\.json|tests/|scripts/|\.github/|\.gitignore$)'

version_at() { git show "$1:$MANIFEST" | jq -r '.version // empty'; }

head_version="$(jq -r '.version // empty' "$MANIFEST")"
[ -n "$head_version" ] || { echo "error: $MANIFEST has no version"; exit 1; }
[[ "$head_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] ||
  { echo "error: version '$head_version' is not semver (X.Y.Z)"; exit 1; }

# A version in the marketplace entry would be silently overridden by plugin.json.
if jq -e '.plugins[] | select(has("version"))' .claude-plugin/marketplace.json >/dev/null; then
  echo "error: remove \"version\" from marketplace.json; plugin.json is the single source of truth"
  exit 1
fi

grep -q "^## \[$head_version\]" CHANGELOG.md ||
  { echo "error: CHANGELOG.md has no '## [$head_version]' section"; exit 1; }

base_version="$(version_at "$BASE" 2>/dev/null || true)"
shipped="$(git diff --name-only "$BASE"...HEAD | grep -Ev "$NOT_SHIPPED" || true)"

if [ -z "$shipped" ]; then
  echo "ok: no shipped files changed since $BASE (version $head_version)"
  exit 0
fi

if [ "$head_version" = "$base_version" ]; then
  echo "error: shipped files changed but the version is still $head_version:"
  echo "$shipped" | sed 's/^/  - /'
  echo "Run scripts/release.sh <new-version> (or bump $MANIFEST and CHANGELOG.md)."
  exit 1
fi

highest="$(printf '%s\n%s\n' "$base_version" "$head_version" | sort -V | tail -1)"
if [ "$highest" != "$head_version" ]; then
  echo "error: version went backwards ($base_version -> $head_version)"
  exit 1
fi

echo "ok: version $base_version -> $head_version covers:"
echo "$shipped" | sed 's/^/  - /'
