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

echo "Waiting for exclusive access to the local Supabase stack..."
lock_acquire "$DB_LOCK" 600
trap 'lock_release "$DB_LOCK"' EXIT

supabase db start
npm run test:db
supabase stop --no-backup
