#!/usr/bin/env bash
# Runs the Docker-backed Supabase migration/pgTAP gate
# (`supabase db start` + `npm run test:db`) with exclusive access across
# Superset workspaces of this repo. `supabase/config.toml` sets no
# project_id or custom port block, so `supabase db start` always binds the
# CLI's default ports and container names - two workspaces running it at
# once collide in Docker, not just on a socket. Use this instead of calling
# `supabase db start` directly whenever more than one workspace might be
# active.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib/lock.sh"

DB_LOCK="$HOME/.superset/debatelab-db.lock"
stack_started=false

cleanup() {
  local status=$?
  trap - EXIT

  if [ "$stack_started" = true ] && ! supabase stop --no-backup; then
    [ "$status" -ne 0 ] || status=1
  fi
  lock_release "$DB_LOCK"
  exit "$status"
}

echo "Waiting for exclusive access to the local Supabase stack..."
lock_acquire "$DB_LOCK" 600
trap cleanup EXIT

supabase db start
stack_started=true
npm run test:db
