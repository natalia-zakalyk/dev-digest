#!/usr/bin/env bash
#
# Builds a compact "context pack" for reviewer agents so each of them does not re-run git
# diff and re-discover what changed: one filtered diff, a per-module file list with line
# counts, and pointers (plan, verify summary). Prints the pack path.
#
#   ./scripts/context-pack.sh [--plan docs/plans/<slug>.md] [--spec <path>]
#
# Output in $VERIFY_OUT/<tree-hash>/ (default .verify/, git-ignored): pack.md, change.diff.
# change.diff leaves out lock files and migration snapshots (generated noise) and skips
# untracked files over 200 KB; both are listed in pack.md instead of being inlined.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib.sh
source "$ROOT/scripts/lib.sh"

PLAN=""; SPEC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) PLAN="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

HASH="$(tree_hash)"
DIR="${VERIFY_OUT:-$ROOT/.verify}/$HASH"
mkdir -p "$DIR"
EXCLUDES=(":(exclude)**/pnpm-lock.yaml" ":(exclude)**/package-lock.json" ":(exclude)server/src/db/migrations/meta/*_snapshot.json")

{
  git diff HEAD -- . "${EXCLUDES[@]}"
  git ls-files -o --exclude-standard -z | while IFS= read -r -d '' f; do
    case "$f" in */pnpm-lock.yaml|*/package-lock.json) continue ;; esac
    [ "$(wc -c <"$f")" -le 204800 ] || continue
    git diff --no-index -- /dev/null "$f" || true   # exit 1 just means "differs"
  done
} >"$DIR/change.diff"

{
  echo "# Context pack · tree $HASH"
  echo
  echo "Branch: $(git rev-parse --abbrev-ref HEAD) · base: HEAD $(git rev-parse --short HEAD) (uncommitted working tree)"
  [ -z "$PLAN" ] || echo "Plan: $PLAN"
  [ -z "$SPEC" ] || echo "Spec: $SPEC"
  echo "Full filtered diff: ${DIR#"$ROOT"/}/change.diff — Read it by line ranges; do not run git diff again."
  [ ! -f "$DIR/summary.md" ] || echo "Check results for this exact tree: ${DIR#"$ROOT"/}/summary.md (reuse; run scripts/verify.sh only for checks missing there)."
  echo
  echo "## Changed files (tracked: +added/-removed lines)"
  git diff HEAD --numstat -- . "${EXCLUDES[@]}" | awk '{printf "- %s (+%s/-%s)\n", $3, $1, $2}'
  echo
  echo "## New untracked files"
  git ls-files -o --exclude-standard | sed 's/^/- /'
  echo
  echo "## Deleted files"
  git ls-files -d | sed 's/^/- /'
  echo
  echo "## Modules touched"
  changed_modules | sed 's/^/- /'
} >"$DIR/pack.md"

echo "${DIR#"$ROOT"/}/pack.md"
