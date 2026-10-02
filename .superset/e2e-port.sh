#!/usr/bin/env bash
# Prints this worktree's port for the credential-free Playwright server.
# Every worktree used to run `npm run verify` on 18080, so two worktrees
# verifying at once failed on "port already in use". Ports come from
# 18100-18179 through the same registry dev.sh uses, keyed by worktree.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib/lock.sh"

PORTS_LOCK="$HOME/.superset/debatelab-ports/lock"
WORKSPACE_KEY="e2e:$(git -C "$DIR/.." rev-parse --show-toplevel)"

lock_acquire "$PORTS_LOCK" 30 >&2
trap 'lock_release "$PORTS_LOCK"' EXIT
node "$DIR/lib/port-alloc.cjs" allocate "$WORKSPACE_KEY" 18100 18179
