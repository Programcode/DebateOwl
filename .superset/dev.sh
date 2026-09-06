#!/usr/bin/env bash
# Superset "run" script: starts the Vite dev server on a port unique to this
# workspace so several DebateLab workspaces can run `npm run dev` at once
# without fighting over :8080 (vite.config.ts hardcodes that port otherwise).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib/lock.sh"

WORKSPACE_KEY="$(pwd)"
PORTS_LOCK="$HOME/.superset/debatelab-ports/lock"

lock_acquire "$PORTS_LOCK" 30
PORT="$(node "$DIR/lib/port-alloc.cjs" allocate "$WORKSPACE_KEY" 8080 8179)"
lock_release "$PORTS_LOCK"

echo "Superset workspace dev server: http://127.0.0.1:${PORT}"
export PORT
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
