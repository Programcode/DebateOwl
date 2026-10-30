#!/usr/bin/env bash
# Serialize memory-heavy local work. CI and hosts without flock run normally.
set -euo pipefail
if [ -z "${CI+x}" ] && command -v flock >/dev/null 2>&1; then
  mkdir -p "$HOME/.superset"
  # -o: detached children (the collaboration server) must not keep the lock.
  exec flock -o "$HOME/.superset/debatelab-heavy.lock" "$@"
fi
exec "$@"
