#!/usr/bin/env bash
# Serialize memory-heavy local work. CI and hosts without flock run normally.
set -euo pipefail
if [ -z "${CI+x}" ] && command -v flock >/dev/null 2>&1; then
  mkdir -p "$HOME/.superset"
  exec flock "$HOME/.superset/debatelab-heavy.lock" "$@"
fi
exec "$@"
