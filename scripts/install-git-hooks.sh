#!/usr/bin/env bash
#
# Point git at the repo's versioned hooks (scripts/git-hooks/), which today is the
# pre-push gate of the pr-self-review skill. core.hooksPath is LOCAL git config, so
# every clone runs this once (scripts/dev.sh does it for you). Idempotent.
#
#   ./scripts/install-git-hooks.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WANT="scripts/git-hooks"
current="$(git config --local --get core.hooksPath || true)"

if [ "$current" = "$WANT" ]; then
  echo "git hooks already installed (core.hooksPath=$WANT)"
  exit 0
fi
if [ -n "$current" ]; then
  echo "✗ core.hooksPath is already set to '$current' — not overriding it." >&2
  echo "  Chain $WANT/pre-push from your hooks, or run: git config core.hooksPath $WANT" >&2
  exit 1
fi

chmod +x "$WANT"/*
git config --local core.hooksPath "$WANT"
echo "git hooks installed (core.hooksPath=$WANT): pushes now require a passing /pr-self-review"
