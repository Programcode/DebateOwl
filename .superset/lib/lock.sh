#!/usr/bin/env bash
# Portable (macOS + Linux) advisory locking via atomic mkdir. Superset does
# not serialize setup/run/teardown across workspaces of the same repo, so
# scripts that touch shared state (a port registry, the local Supabase
# stack) take one of these locks first.
#
# Usage:
#   source lib/lock.sh
#   lock_acquire "$HOME/.superset/some.lock" 30
#   trap 'lock_release "$HOME/.superset/some.lock"' EXIT

lock_acquire() {
  local lock_dir="$1"
  local timeout="${2:-30}"
  local waited=0

  mkdir -p "$(dirname "$lock_dir")"

  while ! mkdir "$lock_dir" 2>/dev/null; do
    # Old flock users could leave a plain file at a mkdir-lock path.
    if [ -f "$lock_dir" ] && [ ! -L "$lock_dir" ]; then
      rm -f -- "$lock_dir"
      continue
    fi
    # Reclaim a lock left behind by a process that no longer exists.
    if [ -f "$lock_dir/pid" ]; then
      local owner_pid
      owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
      if [ -n "$owner_pid" ] && ! kill -0 "$owner_pid" 2>/dev/null; then
        rm -rf "$lock_dir"
        continue
      fi
    elif [ -d "$lock_dir" ]; then
      # Leave time for a process between mkdir and writing its pid. Support
      # both GNU and BSD stat; a fresh directory is never reclaimed.
      local modified
      modified="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || date +%s)"
      if [ "$(( $(date +%s) - modified ))" -gt 120 ]; then
        # rmdir cannot delete a lock whose owner has since written its pid.
        if rmdir -- "$lock_dir" 2>/dev/null; then continue; fi
      fi
    fi

    if [ "$waited" -ge "$timeout" ]; then
      echo "lock: timed out after ${timeout}s waiting for $lock_dir" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done

  echo $$ > "$lock_dir/pid"
}

lock_release() {
  local lock_dir="$1"
  rm -rf "$lock_dir"
}
