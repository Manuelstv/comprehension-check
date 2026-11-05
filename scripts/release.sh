#!/usr/bin/env bash
# Cuts a release: bumps .claude-plugin/plugin.json, turns the CHANGELOG's
# Unreleased section into the new version, validates, tests, commits and tags.
# Nothing is pushed; the push command is printed at the end.
#
# Usage: scripts/release.sh <major|minor|patch|X.Y.Z>
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
MANIFEST=.claude-plugin/plugin.json
REPO_URL=https://github.com/agharsallah/comprehension-check

[ $# -eq 1 ] || { echo "usage: $0 <major|minor|patch|X.Y.Z>"; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "error: release from main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "error: working tree is not clean"; exit 1; }

current="$(jq -r .version "$MANIFEST")"
IFS=. read -r major minor patch <<<"${current%%-*}"
case "$1" in
  major) next="$((major + 1)).0.0" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  patch) next="$major.$minor.$((patch + 1))" ;;
  *) next="$1" ;;
esac

[[ "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "error: '$next' is not semver"; exit 1; }
[ "$(printf '%s\n%s\n' "$current" "$next" | sort -V | tail -1)" = "$next" ] && [ "$next" != "$current" ] ||
  { echo "error: $next is not greater than $current"; exit 1; }
git rev-parse -q --verify "refs/tags/v$next" >/dev/null && { echo "error: tag v$next exists"; exit 1; }

# The Unreleased section must say what changed.
notes="$(awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md | grep -v '^[[:space:]]*$' || true)"
[ -n "$notes" ] || { echo "error: CHANGELOG.md has nothing under [Unreleased]"; exit 1; }

today="$(date +%F)"
tmp="$(mktemp)"
jq --arg v "$next" '.version = $v' "$MANIFEST" >"$tmp" && mv "$tmp" "$MANIFEST"

awk -v v="$next" -v d="$today" -v url="$REPO_URL" -v prev="$current" '
  /^## \[Unreleased\]/ { print; print ""; print "## [" v "] - " d; next }
  /^\[Unreleased\]:/   { print "[Unreleased]: " url "/compare/v" v "...HEAD";
                         print "[" v "]: " url "/compare/v" prev "...v" v; next }
  { print }
' CHANGELOG.md >"$tmp" && mv "$tmp" CHANGELOG.md

claude plugin validate .
claude plugin test .

git add "$MANIFEST" CHANGELOG.md
git commit -m "chore(release): v$next"
git tag -a "v$next" -m "v$next"

echo
echo "Released v$next locally. Publish it with:"
echo "  git push origin main v$next"
