#!/usr/bin/env bash
# Runs the Docker-backed Supabase, database, collaboration, and full-stack browser gate
# with exclusive access across
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
FAKE_PROVIDER=debatelab-fake-openrouter
# LIVE_PROVIDERS=1 runs e2e/live against real OpenRouter, Jev, and Exa instead of
# the fake provider. It needs LIVE_OPENROUTER_API_KEY and LIVE_EXA_API_KEY.
# LIVE_MODEL=as-requested runs e2e/model-matrix instead: one case per catalog model.
LIVE_PROVIDERS="${LIVE_PROVIDERS:-0}"
# GLM Flash is inexpensive and has broad endpoint coverage, so OpenRouter's
# default balanced routing can fail over between providers during this gate.
LIVE_MODEL="${LIVE_MODEL:-z-ai/glm-5.3-flash}"  # empty also means default
if [ "$LIVE_PROVIDERS" = 1 ] && { [ -z "${LIVE_OPENROUTER_API_KEY:-}" ] || [ -z "${LIVE_EXA_API_KEY:-}" ]; }; then
  echo "LIVE_PROVIDERS=1 requires LIVE_OPENROUTER_API_KEY and LIVE_EXA_API_KEY" >&2
  exit 1
fi
stack_started=false
runtime_dir=""
owned_pids=()

stop_owned_processes() {
  local index
  for ((index=${#owned_pids[@]}-1; index>=0; index--)); do
    kill -- "-${owned_pids[$index]}" 2>/dev/null || true
  done
  for ((index=${#owned_pids[@]}-1; index>=0; index--)); do
    wait "${owned_pids[$index]}" 2>/dev/null || true
  done
}

cleanup() {
  local status=$?
  trap - EXIT

  stop_owned_processes
  docker rm -f "$FAKE_PROVIDER" >/dev/null 2>&1 || true

  if [ -n "$runtime_dir" ] && [ -f "$runtime_dir/function.env" ]; then
    rm -- "$runtime_dir/function.env"
  fi

  if [ "$stack_started" = true ] && ! supabase stop --no-backup; then
    [ "$status" -ne 0 ] || status=1
  fi
  if [ "$status" -ne 0 ] && [ -n "$runtime_dir" ]; then
    echo "Workspace gate failed; local service logs retained at $runtime_dir"
  elif [ -n "$runtime_dir" ] && [ -d "$runtime_dir" ]; then
    rm -r -- "$runtime_dir"
  fi
  lock_release "$DB_LOCK"
  exit "$status"
}

echo "Waiting for exclusive access to the local Supabase stack..."
lock_acquire "$DB_LOCK" 600
trap cleanup EXIT

if [ -n "${WORKSPACE_GATE_ARTIFACT_ROOT:-}" ]; then
  mkdir -p -- "$WORKSPACE_GATE_ARTIFACT_ROOT"
  runtime_dir="$(mktemp -d "$WORKSPACE_GATE_ARTIFACT_ROOT/workspace-gate.XXXXXX")"
else
  runtime_dir="$(mktemp -d)"
fi
# Shared CI runners intermittently hit registry rate limits while pulling images.
stack_started=true
for attempt in 1 2 3; do
  if supabase start >>"$runtime_dir/supabase.log" 2>&1; then break; fi
  if [ "$attempt" -eq 3 ]; then exit 1; fi
  echo "supabase start failed (attempt $attempt); retrying after $((attempt * 30))s"
  tail -n 3 "$runtime_dir/supabase.log"
  supabase stop --no-backup >/dev/null 2>&1 || true
  sleep $((attempt * 30))
done
if [ "$LIVE_PROVIDERS" != 1 ]; then npm run test:db; fi

status_json="$(supabase status -o json 2>/dev/null)"
status_value() {
  node -e 'const value=JSON.parse(process.argv[1])[process.argv[2]]; if (!value) process.exit(1); process.stdout.write(String(value))' "$status_json" "$1"
}
api_url="$(status_value API_URL)"
anon_key="$(status_value ANON_KEY)"
service_role_key="$(status_value SERVICE_ROLE_KEY)"
database_url="$(status_value DB_URL)"
app_origin="http://127.0.0.1:18081"
project_id="$(basename "$(pwd)")"
mailer_host="$(docker ps --filter "name=supabase_inbucket_$project_id" --format '{{.Names}}')"
if [ -z "$mailer_host" ]; then
  echo "Local Mailpit container is unavailable" >&2
  exit 1
fi
LOCAL_SERVICE_ROLE_KEY="$service_role_key" \
LOCAL_MAILER_HOST="$mailer_host" \
  node scripts/workspace-test-env.mjs .superset/workspace-test.env "$runtime_dir/function.env"
provider_mode=()
if [ "$LIVE_PROVIDERS" = 1 ]; then
  # printf is a builtin, so the keys never appear in a process list or log.
  grep -v '^OPENROUTER_API_KEY=' "$runtime_dir/function.env" >"$runtime_dir/function.env.next"
  printf 'OPENROUTER_API_KEY=%s\nEXA_API_KEY=%s\n' "$LIVE_OPENROUTER_API_KEY" "$LIVE_EXA_API_KEY" >>"$runtime_dir/function.env.next"
  mv -- "$runtime_dir/function.env.next" "$runtime_dir/function.env"
  chmod 600 "$runtime_dir/function.env"
  provider_mode=(-e UPSTREAM=https://openrouter.ai/api -e "LIVE_MODEL=$LIVE_MODEL")
fi

# Edge Functions reach the fake provider by container name on the stack network.
docker rm -f "$FAKE_PROVIDER" >/dev/null 2>&1 || true
docker run -d --rm --name "$FAKE_PROVIDER" --network "supabase_network_$project_id" \
  "${provider_mode[@]}" -p 127.0.0.1:18090:8787 -v "$(pwd)/e2e/full-stack/fake-openrouter.mjs:/fake.mjs:ro" \
  node:22-alpine node /fake.mjs >/dev/null

setsid supabase functions serve --no-verify-jwt \
  --env-file "$runtime_dir/function.env" >"$runtime_dir/functions.log" 2>&1 &
owned_pids+=("$!")

VITE_LOCAL_PREVIEW=true \
VITE_LOCAL_SUPABASE_URL="$api_url" \
VITE_LOCAL_SUPABASE_ANON_KEY="$anon_key" \
VITE_COLLABORATION_URL=ws://127.0.0.1:12345 \
  setsid npm run dev -- --host 127.0.0.1 --port 18081 --strictPort >"$runtime_dir/vite.log" 2>&1 &
owned_pids+=("$!")

mailer_url="$(status_value MAILPIT_URL)"
for url in "$mailer_url/api/v1/messages" "$app_origin" "http://127.0.0.1:18090/__requests"; do
  for _ in $(seq 1 200); do
    if curl --fail --silent --output /dev/null "$url"; then break; fi
    sleep 0.1
  done
  curl --fail --silent --output /dev/null "$url"
done
for function_name in workspace-invites ai ai-stream demo-code-login admin announcements account; do
  function_url="$api_url/functions/v1/$function_name"
  for _ in $(seq 1 200); do
    if curl --fail --silent --output /dev/null --request OPTIONS --header "Origin: $app_origin" "$function_url"; then break; fi
    sleep 0.1
  done
  curl --fail --silent --output /dev/null --request OPTIONS --header "Origin: $app_origin" "$function_url"
done

if [ "$LIVE_PROVIDERS" = 1 ] && [ "$LIVE_MODEL" = as-requested ]; then
  test_selection=(e2e/model-matrix --project=desktop-chromium)
elif [ "$LIVE_PROVIDERS" = 1 ]; then
  test_selection=(e2e/live --project=desktop-chromium)
else
  test_selection=(e2e/workspace-collaboration.spec.ts e2e/full-stack)
fi
LOCAL_SUPABASE_URL="$api_url" \
LOCAL_SUPABASE_ANON_KEY="$anon_key" \
LOCAL_SUPABASE_SERVICE_ROLE_KEY="$service_role_key" \
WORKSPACE_TEST_MAILER_URL="$mailer_url" \
COLLABORATION_DATABASE_URL="$database_url" \
COLLABORATION_PORT=12345 \
COLLABORATION_ALLOWED_ORIGINS="$app_origin" \
SUPABASE_URL="$api_url" \
SUPABASE_ANON_KEY="$anon_key" \
FAKE_OPENROUTER_URL=http://127.0.0.1:18090 \
LIVE_MODEL="$LIVE_MODEL" \
DEMO_CODE_PEPPER="$(sed -n 's/^DEMO_CODE_PEPPER=//p' .superset/workspace-test.env)" \
PLAYWRIGHT_BASE_URL="$app_origin" \
  npx playwright test --config=playwright.workspace.config.ts "${test_selection[@]}"
