#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib/lock.sh"

DB_LOCK="$HOME/.superset/debatelab-db.lock"
TRIAL_ORIGIN="https://codex-remote.tailab0ab3.ts.net:18443"
APP_PORT=18480
COLLABORATION_PORT=12345
SERVE_PORT=18443
PROXY_NAME="debatelab-workspace-trial-proxy"

runtime_dir=""
stack_started=false
serve_started=false
owned_pids=()

stop_owned_processes() {
  local index
  docker rm --force "$PROXY_NAME" >/dev/null 2>&1 || true
  for ((index=${#owned_pids[@]}-1; index>=0; index--)); do
    kill -- "-${owned_pids[$index]}" 2>/dev/null || true
  done
  for ((index=${#owned_pids[@]}-1; index>=0; index--)); do
    wait "${owned_pids[$index]}" 2>/dev/null || true
  done
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$serve_started" = true ]; then
    tailscale serve --https="$SERVE_PORT" off >/dev/null 2>&1 || status=1
  fi
  stop_owned_processes
  if [ "$stack_started" = true ] && ! supabase stop; then
    status=1
  fi
  if [ -n "$runtime_dir" ] && [ -d "$runtime_dir" ]; then
    rm -r -- "$runtime_dir"
  fi
  lock_release "$DB_LOCK"
  exit "$status"
}

for port in "$APP_PORT" "$COLLABORATION_PORT"; do
  if ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    echo "Workspace trial port $port is already in use" >&2
    exit 1
  fi
done
if tailscale serve status --json | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.exit(s.TCP?.[process.argv[1]] ? 0 : 1)' "$SERVE_PORT"; then
  echo "Tailscale Serve port $SERVE_PORT is already configured" >&2
  exit 1
fi
if supabase status -o json >/dev/null 2>&1; then
  echo "A local Supabase stack is already running" >&2
  exit 1
fi

lock_acquire "$DB_LOCK" 600
trap cleanup EXIT INT TERM
runtime_dir="$(mktemp -d)"

supabase start >"$runtime_dir/supabase.log" 2>&1
stack_started=true
status_json="$(supabase status -o json 2>/dev/null)"
status_value() {
  node -e 'const value=JSON.parse(process.argv[1])[process.argv[2]]; if (!value) process.exit(1); process.stdout.write(String(value))' "$status_json" "$1"
}
api_url="$(status_value API_URL)"
anon_key="$(status_value ANON_KEY)"
service_role_key="$(status_value SERVICE_ROLE_KEY)"
database_url="$(status_value DB_URL)"
project_id="$(basename "$(pwd)")"
mailer_host="$(docker ps --filter "name=supabase_inbucket_$project_id" --format '{{.Names}}')"
if [ -z "$mailer_host" ]; then
  echo "Local Mailpit container is unavailable" >&2
  exit 1
fi

LOCAL_SERVICE_ROLE_KEY="$service_role_key" \
LOCAL_MAILER_HOST="$mailer_host" \
  node scripts/workspace-test-env.mjs .superset/workspace-test.env "$runtime_dir/function.env" "$TRIAL_ORIGIN"

setsid supabase functions serve workspace-invites --no-verify-jwt \
  --env-file "$runtime_dir/function.env" >"$runtime_dir/functions.log" 2>&1 &
owned_pids+=("$!")

COLLABORATION_DATABASE_URL="$database_url" \
COLLABORATION_PORT="$COLLABORATION_PORT" \
COLLABORATION_ALLOWED_ORIGINS="$TRIAL_ORIGIN" \
SUPABASE_URL="$api_url" \
SUPABASE_ANON_KEY="$anon_key" \
  setsid npm run start:collaboration >"$runtime_dir/collaboration.log" 2>&1 &
owned_pids+=("$!")

VITE_LOCAL_PREVIEW=true \
VITE_LOCAL_SUPABASE_URL="$TRIAL_ORIGIN/supabase" \
VITE_LOCAL_SUPABASE_ANON_KEY="$anon_key" \
VITE_COLLABORATION_URL="wss://codex-remote.tailab0ab3.ts.net:$SERVE_PORT/collaboration" \
  npm run build

setsid docker run --rm --name "$PROXY_NAME" --network host \
  --volume "$PWD/dist:/usr/share/nginx/html:ro" \
  --volume "$DIR/workspace-trial-nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine >"$runtime_dir/proxy.log" 2>&1 &
owned_pids+=("$!")

for _ in $(seq 1 200); do
  if curl --fail --silent --output /dev/null --header "Host: codex-remote.tailab0ab3.ts.net:$SERVE_PORT" "http://127.0.0.1:$APP_PORT"; then break; fi
  sleep 0.1
done
curl --fail --silent --output /dev/null --header "Host: codex-remote.tailab0ab3.ts.net:$SERVE_PORT" "http://127.0.0.1:$APP_PORT"

tailscale serve --bg --https="$SERVE_PORT" "http://127.0.0.1:$APP_PORT"
serve_started=true
curl --fail --silent --output /dev/null "$TRIAL_ORIGIN"

echo "Workspace trial ready: $TRIAL_ORIGIN"
echo "Commit: $(git rev-parse HEAD)"
echo "Stop with: systemctl --user stop debatelab-workspace-trial.service"

while kill -0 "${owned_pids[0]}" 2>/dev/null && kill -0 "${owned_pids[1]}" 2>/dev/null; do
  sleep 5
done
echo "A workspace trial process exited unexpectedly" >&2
exit 1
