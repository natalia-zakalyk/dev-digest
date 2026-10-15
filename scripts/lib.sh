# shellcheck shell=bash
#
# Shared helpers for scripts/dev.sh and scripts/e2e.sh. Source, don't execute:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# Recursively kill a process and all its descendants. `pnpm exec tsx` / `pnpm dev`
# / `next dev` spawn the real listener as a GRANDCHILD, so a plain `kill $PID` +
# `pkill -P` leaves it orphaned (port stays bound). Walk the tree leaves-first.
kill_tree() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  local kid
  for kid in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$kid"; done
  kill "$pid" 2>/dev/null || true
}

# Fail fast if any of the given TCP ports already has a listener. Prevents a
# second stack from half-starting (and keeps e2e.sh's port backstop from ever
# killing a process this script did not start).
require_free_ports() {
  local port pids busy=0
  command -v lsof >/dev/null || { warn "lsof not found — skipping port preflight"; return 0; }
  for port in "$@"; do
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      busy=1
      printf '\033[1;31m✗ port %s is already in use by:\033[0m\n' "$port" >&2
      # shellcheck disable=SC2086
      ps -o pid=,command= -p $pids >&2 || true
    fi
  done
  if [ "$busy" -eq 1 ]; then
    echo "Stop the process(es) above (another dev/e2e stack?) or choose other ports, then retry." >&2
    exit 1
  fi
}
