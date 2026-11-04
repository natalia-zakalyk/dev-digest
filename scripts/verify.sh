#!/usr/bin/env bash
#
# One deterministic gate for typecheck / lint:arch / tests / shared drift, with results
# cached per working-tree fingerprint. Agents read the short summary instead of each
# re-running (and re-reading the output of) the same commands.
#
#   ./scripts/verify.sh                          # modules with uncommitted changes
#   ./scripts/verify.sh --module server --module client
#   ./scripts/verify.sh --checks lint,drift      # subset: typecheck,test,lint,drift
#   ./scripts/verify.sh --hermetic               # server: skip *.it.test.ts (no Docker)
#   ./scripts/verify.sh --force                  # ignore cache (independent final gate)
#
# Output: a markdown summary on stdout (real key lines only); full logs in
# $VERIFY_OUT/<tree-hash>/ (default .verify/, git-ignored). Exit 1 if any check failed.
# Tests stay offline and key-free; this script starts no services.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib.sh
source "$ROOT/scripts/lib.sh"

OUT_BASE="${VERIFY_OUT:-$ROOT/.verify}"
MODULES=""
CHECKS="typecheck,test,lint,drift"
HERMETIC=0
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --module)   MODULES="$MODULES $2"; shift 2 ;;
    --checks)   CHECKS="$2"; shift 2 ;;
    --hermetic) HERMETIC=1; shift ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n 2,17p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$MODULES" ] || MODULES="$(changed_modules | tr '\n' ' ')"
HASH="$(tree_hash)"
DIR="$OUT_BASE/$HASH"
mkdir -p "$DIR"

want() { case ",$CHECKS," in *",$1,"*) return 0 ;; esac; return 1; }

ROWS=""
FAILS=""
FAILED=0

# key_line <check> <log> <exit>: the one line worth reading, taken from the real output.
key_line() {
  local check="$1" log="$2" code="$3" line
  case "$check" in
    test*)
      line="$(grep -E '^ *(Test Files|Tests) ' "$log" | sed 's/^ *//' | tr '\n' ';' | sed 's/;$//; s/;/ · /g')" ;;
    lint)
      line="$(grep -E 'no dependency violations|dependency violations|error' "$log" | head -1 | sed 's/^ *//')" ;;
    typecheck)
      [ "$code" -eq 0 ] && line="no errors" || line="$(grep -cE 'error TS' "$log") TS errors" ;;
    *) line="" ;;
  esac
  [ -n "$line" ] || line="$(grep -v '^\s*$' "$log" | tail -1 | cut -c1-120)"
  printf '%s' "$line"
}

# run_check <module> <check> <command>
run_check() {
  local module="$1" check="$2" cmd="$3"
  local log="$DIR/$module-$check.log" st="$DIR/$module-$check.status" cached="no" code
  if [ "$FORCE" -eq 0 ] && [ -f "$st" ]; then
    cached="yes"
    code="$(cat "$st")"
  else
    ( cd "$ROOT/$module" && bash -c "$cmd" ) >"$log" 2>&1
    code=$?
    echo "$code" >"$st"
  fi
  local result; result="$(key_line "$check" "$log" "$code")"
  local status="pass"; [ "$code" -eq 0 ] || status="FAIL"
  ROWS="$ROWS| $module | \`$cmd\` | $status | $result | $cached |
"
  if [ "$code" -ne 0 ]; then
    FAILED=1
    FAILS="$FAILS
### $module · $check (log: ${log#"$ROOT"/})
\`\`\`
$(grep -E 'FAIL|Error|error|✗|×|AssertionError|expected' "$log" | head -8 | cut -c1-200)
\`\`\`
"
  fi
}

for m in $MODULES; do
  case "$m" in
    server)
      want typecheck && run_check server typecheck "pnpm typecheck"
      want lint      && run_check server lint "pnpm lint:arch"
      if want test; then
        if [ "$HERMETIC" -eq 1 ]; then
          run_check server test-hermetic "pnpm exec vitest run --exclude '**/*.it.test.ts'"
        else
          run_check server test "pnpm test"
        fi
      fi ;;
    client)
      want typecheck && run_check client typecheck "pnpm typecheck"
      want test      && run_check client test "pnpm test" ;;
    reviewer-core)
      want typecheck && run_check reviewer-core typecheck "npm run typecheck"
      want test      && run_check reviewer-core test "npm test" ;;
    mcp)
      want typecheck && run_check mcp typecheck "npm run typecheck"
      want test      && run_check mcp test "npm test" ;;
    e2e)
      want typecheck && run_check e2e typecheck "npm run typecheck" ;;
    *) echo "unknown module: $m" >&2; exit 2 ;;
  esac
done

if want drift; then
  run_check . drift "scripts/check-shared-drift.sh"
fi

{
  echo "# Verification summary · tree $HASH · modules:${MODULES:- none}"
  echo
  echo "| Module | Command | Result | Key line | Cached |"
  echo "|---|---|---|---|---|"
  printf '%s' "$ROWS"
  [ -z "$FAILS" ] || { echo; echo "## Failures"; printf '%s\n' "$FAILS"; }
  echo
  echo "Logs: ${DIR#"$ROOT"/}/ · \`Cached: yes\` = same tree fingerprint, not re-run (use --force for an independent run)"
} | tee "$DIR/summary.md"

exit "$FAILED"
