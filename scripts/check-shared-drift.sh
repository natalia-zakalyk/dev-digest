#!/usr/bin/env bash
#
# Guard against drift between the two vendored copies of @devdigest/shared:
#   server/src/vendor/shared  (canonical, also used by reviewer-core)
#   client/src/vendor/shared
# Any change to a contract must land in BOTH copies (AGENTS.md → Gotchas).
#
#   ./scripts/check-shared-drift.sh     # exit 0 = identical, 1 = drifted
#
# Used by .github/workflows/shared-drift.yml. No installs needed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_COPY="server/src/vendor/shared"
CLIENT_COPY="client/src/vendor/shared"

for dir in "$SERVER_COPY" "$CLIENT_COPY"; do
  [ -d "$dir" ] || { echo "missing $dir" >&2; exit 1; }
done

if diff_out="$(diff -rq "$SERVER_COPY" "$CLIENT_COPY")"; then
  echo "shared contracts in sync: $SERVER_COPY == $CLIENT_COPY"
  exit 0
fi

echo "✗ @devdigest/shared copies have drifted:" >&2
echo "$diff_out" >&2
echo >&2
echo "Update both copies (AGENTS.md → Gotchas); see the full diff with:" >&2
echo "  diff -ru $SERVER_COPY $CLIENT_COPY" >&2
exit 1
