#!/usr/bin/env bash
# Superset "teardown" script: releases this workspace's port allocation and,
# if this workspace has a local Supabase stack running, stops it so it
# doesn't hold ports/containers after the worktree is deleted.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib/lock.sh"
source "$DIR/lib/supabase-cli.sh"
# Teardown still runs when npm ci never did; then there is no stack to stop.
use_pinned_supabase_cli "$(cd "$DIR/.." && pwd)" 2>/dev/null || exit 0

WORKSPACE_KEY="$(pwd)"
PORTS_LOCK="$HOME/.superset/debatelab-ports/lock"

lock_acquire "$PORTS_LOCK" 30
node "$DIR/lib/port-alloc.cjs" release "$WORKSPACE_KEY" || true
node "$DIR/lib/port-alloc.cjs" release "e2e:$(git rev-parse --show-toplevel)" || true
lock_release "$PORTS_LOCK"

if command -v supabase >/dev/null 2>&1 && supabase status >/dev/null 2>&1; then
  supabase stop --no-backup || true
fi
