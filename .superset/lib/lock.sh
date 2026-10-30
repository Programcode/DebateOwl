#!/usr/bin/env bash
# Portable (macOS + Linux) advisory mkdir locks. Python 3's standard-library
# fcntl guard serializes recovery, acquisition and release, including PID writes.
#
# Usage:
#   source lib/lock.sh
#   lock_acquire "$HOME/.superset/some.lock" 30
#   trap 'lock_release "$HOME/.superset/some.lock"' EXIT
DEBATELAB_LOCK_HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lock.py"

lock_acquire() {
  local lock_dir="$1" timeout="${2:-30}" waited=0 status
  while :; do
    if python3 "$DEBATELAB_LOCK_HELPER" acquire "$lock_dir" "$$"; then
      return 0
    else
      status=$?
      [ "$status" -eq 1 ] || return "$status"
    fi
    if [ "$waited" -ge "$timeout" ]; then
      echo "lock: timed out after ${timeout}s waiting for $lock_dir" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

lock_release() {
  # Verification hands ownership to a long-lived holder; other callers use $$.
  python3 "$DEBATELAB_LOCK_HELPER" release "$1" "${2:-$$}"
}
