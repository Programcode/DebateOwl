#!/usr/bin/env bash
# Verification harness for DebateLab: a long-lived copy of .superset/db-gate.sh
# without the test runs. It starts local Supabase, every Edge Function, the fake
# OpenRouter provider, and a Vite client pinned to the local stack, then holds
# the shared stack lock until `down`.
#
#   verify.sh up [--live [--max-calls N]] [--collab]
#                             start everything; prints READY <url>. --live sends
#                             every model call to real OpenRouter pinned to
#                             $LIVE_MODEL, and research to real Exa.
#   verify.sh doctor          read-only health and isolation check
#   verify.sh user [label]    mint a disposable local demo-code user
#   verify.sh drive <filter> [playwright args...]
#                             run recipes (`all`, `recipes/<name>`) or a maintained
#                             suite (`e2e/live/`, `e2e/workspace-collaboration`)
#                             and keep the evidence
#   verify.sh e2e <run|explore|list|cache> [e2e args...]
#                             run the agentic suite in agentic/ (TesterArmy e2e)
#                             or an exploration against this stack; the testing
#                             agent's model is billed to the OpenRouter key
#   verify.sh down            stop what `up` started; evidence is kept
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$SKILL_DIR" rev-parse --show-toplevel)"
cd "$REPO"
source "$REPO/.superset/lib/lock.sh"

DB_LOCK="$HOME/.superset/debatelab-db.lock"
FAKE_PROVIDER=debatelab-fake-openrouter
APP_PORT=18081            # the only local client origin the Edge Function CORS list and invite fixture allow
FAKE_PORT=18090
COLLAB_PORT=12345
APP_ORIGIN="http://127.0.0.1:$APP_PORT"
VERIFY_ROOT="$REPO/.verify"
STATE_DIR="$VERIFY_ROOT/state"     # secrets and pids; removed by down
STATE="$STATE_DIR/stack.env"
USERS="$STATE_DIR/users.tsv"
ARTIFACTS="$VERIFY_ROOT/artifacts"  # evidence; never removed by this script
PROJECT_ID="$(basename "$REPO")"   # supabase/config.toml has no project_id
# Adam's standing choice for live verification: the cheap contributor tier.
LIVE_MODEL="${VERIFY_LIVE_MODEL:-meta/muse-spark-1.3-contributor}"
LIVE_KEYS_FILE="${VERIFY_LIVE_KEYS_FILE:-$HOME/.config/debatelab/live-verify.env}"

say() { printf '%s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
record() { printf '%s=%q\n' "$1" "$2" >>"$STATE"; }
load_state() { [ -f "$STATE" ] || fail "no running verification stack (state file missing); run: verify.sh up"; source "$STATE"; }
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
port_busy() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
wait_url() {
  local url="$1" tries="${2:-300}"
  shift; [ "$#" -gt 0 ] && shift
  for _ in $(seq 1 "$tries"); do
    curl --fail --silent --output /dev/null "$@" "$url" && return 0
    sleep 0.2
  done
  curl --fail --silent --output /dev/null "$@" "$url"
}

cmd_up() {
  local collab=false live=false max_calls=400
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --collab) collab=true ;;
      --live) live=true ;;
      --max-calls) max_calls="${2:?--max-calls needs a number}"; shift ;;
      *) fail "unknown up option $1" ;;
    esac
    shift
  done
  [ ! -f "$STATE" ] || fail "a verification stack is already recorded in $STATE; run doctor, or down first"

  # Live keys come from the environment or a 0600 key file. They are read, never printed.
  local or_key="" exa_key="" stripe_key="" stripe_price=""
  if [ "$live" = true ]; then
    or_key="${LIVE_OPENROUTER_API_KEY:-}"; exa_key="${LIVE_EXA_API_KEY:-}"
    stripe_key="${STRIPE_TEST_SECRET_KEY:-}"; stripe_price="${STRIPE_TEST_PRICE_ID:-}"
    if [ -f "$LIVE_KEYS_FILE" ]; then
      [ "$(stat -c %a "$LIVE_KEYS_FILE")" = 600 ] || fail "$LIVE_KEYS_FILE must be mode 600"
      key_from_file() { sed -n "s/^$1=//p" "$LIVE_KEYS_FILE" | tail -1; }
      [ -n "$or_key" ] || or_key="$(key_from_file LIVE_OPENROUTER_API_KEY)"
      [ -n "$exa_key" ] || exa_key="$(key_from_file LIVE_EXA_API_KEY)"
      [ -n "$stripe_key" ] || stripe_key="$(key_from_file STRIPE_TEST_SECRET_KEY)"
      [ -n "$stripe_price" ] || stripe_price="$(key_from_file STRIPE_TEST_PRICE_ID)"
    fi
    [ -n "$or_key" ] && [ -n "$exa_key" ] || fail "--live needs LIVE_OPENROUTER_API_KEY and LIVE_EXA_API_KEY (environment or $LIVE_KEYS_FILE)"
    if [ -n "$stripe_key" ]; then
      case "$stripe_key" in sk_test_*|rk_test_*) ;; *) fail "refusing a Stripe key that is not test mode";; esac
      [ -n "$stripe_price" ] || fail "STRIPE_TEST_SECRET_KEY needs STRIPE_TEST_PRICE_ID"
    fi
  fi

  # The stack uses the CLI's default ports and shared container names, so only
  # one worktree may run it. Refuse instead of waiting or double-driving.
  lock_acquire "$DB_LOCK" 0 || fail "the local Supabase stack lock is held by pid $(cat "$DB_LOCK/pid" 2>/dev/null || echo '?'); another worktree owns it"
  if docker ps --format '{{.Names}}' | grep -q '^supabase_'; then
    lock_release "$DB_LOCK"; fail "Supabase containers are already running (not started by this run)"
  fi
  for port in 54321 "$APP_PORT" "$FAKE_PORT"; do
    if port_busy "$port"; then lock_release "$DB_LOCK"; fail "port $port is already in use"; fi
  done

  mkdir -p "$STATE_DIR" "$ARTIFACTS"
  chmod 700 "$STATE_DIR"
  local run_id; run_id="$(date -u +%Y%m%dT%H%M%SZ)"
  local log_dir="$VERIFY_ROOT/logs/$run_id"
  mkdir -p "$log_dir"
  : >"$STATE"; : >"$USERS"
  record PROJECT_ID "$PROJECT_ID"
  record LOG_DIR "$log_dir"
  record HEAD "$(git rev-parse HEAD)"
  record MODE "$([ "$live" = true ] && echo live || echo fake)"
  record LIVE_MODEL "$([ "$live" = true ] && echo "$LIVE_MODEL")"
  record STRIPE_MODE "$([ -n "$stripe_key" ] && echo test || echo placeholder)"

  # lock_acquire wrote this shell's pid, which dies when `up` returns and would
  # let another worktree reclaim the lock. Hand ownership to a holder we kill in down.
  setsid sleep infinity >/dev/null 2>&1 &
  local holder=$!
  echo "$holder" >"$DB_LOCK/pid"
  record HOLDER_PID "$holder"

  trap 'say "up failed; tearing down (logs: $log_dir)"; cmd_down || true' ERR

  say "Starting local Supabase (logs: $log_dir)..."
  record STACK_STARTED true
  supabase start >>"$log_dir/supabase.log" 2>&1

  local status_json; status_json="$(supabase status -o json 2>/dev/null)"
  sv() { node -e 'const v=JSON.parse(process.argv[1])[process.argv[2]]; if (!v) process.exit(1); process.stdout.write(String(v))' "$status_json" "$1"; }
  local api_url anon_key service_key db_url mailer_url mailer_host
  api_url="$(sv API_URL)"; anon_key="$(sv ANON_KEY)"; service_key="$(sv SERVICE_ROLE_KEY)"
  db_url="$(sv DB_URL)"; mailer_url="$(sv MAILPIT_URL)"
  mailer_host="$(docker ps --filter "name=supabase_inbucket_$PROJECT_ID" --format '{{.Names}}')"
  [ -n "$mailer_host" ] || { say "Local Mailpit container is unavailable"; false; }

  LOCAL_SERVICE_ROLE_KEY="$service_key" LOCAL_MAILER_HOST="$mailer_host" \
    node scripts/workspace-test-env.mjs .superset/workspace-test.env "$STATE_DIR/function.env"
  if [ "$live" = true ]; then
    # printf is a builtin, so keys never reach a process list or log.
    grep -vE '^(OPENROUTER_API_KEY|EXA_API_KEY)=' "$STATE_DIR/function.env" >"$STATE_DIR/function.env.next"
    printf 'OPENROUTER_API_KEY=%s\nEXA_API_KEY=%s\n' "$or_key" "$exa_key" >>"$STATE_DIR/function.env.next"
    if [ -n "$stripe_key" ]; then
      grep -vE '^(STRIPE_SECRET_KEY|STRIPE_PRICE_ID)=' "$STATE_DIR/function.env.next" >"$STATE_DIR/function.env.tmp"
      printf 'STRIPE_SECRET_KEY=%s\nSTRIPE_PRICE_ID=%s\n' "$stripe_key" "$stripe_price" >>"$STATE_DIR/function.env.tmp"
      mv -- "$STATE_DIR/function.env.tmp" "$STATE_DIR/function.env.next"
    fi
    mv -- "$STATE_DIR/function.env.next" "$STATE_DIR/function.env"
    chmod 600 "$STATE_DIR/function.env"
  fi
  # Values the recipes and `user` need. Local, test-only, but never echo them.
  (
    umask 077
    {
      printf 'LOCAL_SUPABASE_URL=%s\n' "$api_url"
      printf 'LOCAL_SUPABASE_ANON_KEY=%s\n' "$anon_key"
      printf 'LOCAL_SUPABASE_SERVICE_ROLE_KEY=%s\n' "$service_key"
      printf 'FAKE_OPENROUTER_URL=%s\n' "http://127.0.0.1:$FAKE_PORT"
      printf 'WORKSPACE_TEST_MAILER_URL=%s\n' "$mailer_url"
      printf 'DEMO_CODE_PEPPER=%s\n' "$(sed -n 's/^DEMO_CODE_PEPPER=//p' .superset/workspace-test.env)"
      printf 'PLAYWRIGHT_BASE_URL=%s\n' "$APP_ORIGIN"
      printf 'VERIFY_MODE=%s\n' "$([ "$live" = true ] && echo live || echo fake)"
      printf 'LIVE_MODEL=%s\n' "$([ "$live" = true ] && echo "$LIVE_MODEL")"
      printf 'VERIFY_STRIPE=%s\n' "$([ -n "$stripe_key" ] && echo test || echo placeholder)"
      [ -z "$stripe_key" ] || printf 'STRIPE_TEST_SECRET_KEY=%s\n' "$stripe_key"
      # e2e/workspace-collaboration.spec.ts starts its own collaboration process with these.
      printf 'COLLABORATION_DATABASE_URL=%s\n' "$db_url"
      printf 'COLLABORATION_PORT=%s\n' "$COLLAB_PORT"
      printf 'COLLABORATION_ALLOWED_ORIGINS=%s\n' "$APP_ORIGIN"
      printf 'SUPABASE_URL=%s\n' "$api_url"
      printf 'SUPABASE_ANON_KEY=%s\n' "$anon_key"
    } >"$STATE_DIR/drive.env"
  )
  record API_URL "$api_url"

  # Edge Functions reach the fake provider by container name on the stack network.
  docker rm -f "$FAKE_PROVIDER" >/dev/null 2>&1 || true
  local provider_mode=()
  [ "$live" = true ] && provider_mode=(-e UPSTREAM=https://openrouter.ai/api -e "LIVE_MODEL=$LIVE_MODEL" -e "MAX_UPSTREAM_CALLS=$max_calls")
  docker run -d --rm --name "$FAKE_PROVIDER" --network "supabase_network_$PROJECT_ID" \
    "${provider_mode[@]}" -p "127.0.0.1:$FAKE_PORT:8787" -v "$REPO/e2e/full-stack/fake-openrouter.mjs:/fake.mjs:ro" \
    node:22-alpine node /fake.mjs >/dev/null
  record FAKE_STARTED true

  setsid supabase functions serve --no-verify-jwt --env-file "$STATE_DIR/function.env" \
    >"$log_dir/functions.log" 2>&1 &
  record FUNCTIONS_PID "$!"

  VITE_LOCAL_PREVIEW=true \
  VITE_LOCAL_SUPABASE_URL="$api_url" \
  VITE_LOCAL_SUPABASE_ANON_KEY="$anon_key" \
  VITE_COLLABORATION_URL="ws://127.0.0.1:$COLLAB_PORT" \
    setsid npm run dev -- --host 127.0.0.1 --port "$APP_PORT" --strictPort >"$log_dir/vite.log" 2>&1 &
  record VITE_PID "$!"

  if [ "$collab" = true ]; then
    COLLABORATION_DATABASE_URL="$db_url" \
    COLLABORATION_PORT="$COLLAB_PORT" \
    COLLABORATION_ALLOWED_ORIGINS="$APP_ORIGIN" \
    SUPABASE_URL="$api_url" \
    SUPABASE_ANON_KEY="$anon_key" \
      setsid npm run start:collaboration >"$log_dir/collaboration.log" 2>&1 &
    record COLLAB_PID "$!"
  fi

  wait_url "$mailer_url/api/v1/messages"
  wait_url "$APP_ORIGIN"
  wait_url "http://127.0.0.1:$FAKE_PORT/__requests"
  for fn in workspace-invites ai ai-stream demo-code-login admin announcements; do
    wait_url "$api_url/functions/v1/$fn" 300 --request OPTIONS --header "Origin: $APP_ORIGIN"
  done
  if [ "$collab" = true ]; then
    for _ in $(seq 1 150); do grep -q "Collaboration service listening" "$log_dir/collaboration.log" && break; sleep 0.2; done
    grep -q "Collaboration service listening" "$log_dir/collaboration.log"
  fi
  trap - ERR
  say "READY $APP_ORIGIN mode=$([ "$live" = true ] && echo "live model=$LIVE_MODEL max-calls=$max_calls" || echo fake) (run: $0 doctor)"
}

cmd_doctor() {
  load_state
  local bad=0
  check() { if eval "$2" >/dev/null 2>&1; then say "ok   $1"; else say "FAIL $1"; bad=1; fi; }
  check "stack lock held by our holder pid $HOLDER_PID" "[ \"\$(cat '$DB_LOCK/pid')\" = '$HOLDER_PID' ] && kill -0 $HOLDER_PID"
  check "Vite process group $VITE_PID alive" "kill -0 $VITE_PID"
  local listener_pid
  listener_pid="$(ss -ltnpH "sport = :$APP_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  check "port $APP_PORT is served by our Vite (pgid $VITE_PID)" "[ -n '$listener_pid' ] && [ \"\$(ps -o pgid= -p '$listener_pid' | tr -d ' ')\" = '$VITE_PID' ]"
  # The browser client must resolve the local stack, never production or staging.
  local env_module; env_module="$(curl -s "$APP_ORIGIN/src/lib/supabase/env.ts" || true)"
  check "client is in local-preview mode" "grep -q '\"VITE_LOCAL_PREVIEW\": \"true\"' <<<\"\$env_module\""
  check "client points at $API_URL" "grep -q '\"VITE_LOCAL_SUPABASE_URL\": \"$API_URL\"' <<<\"\$env_module\""
  check "Edge Functions process group $FUNCTIONS_PID alive" "kill -0 $FUNCTIONS_PID"
  check "demo-code-login answers CORS for $APP_ORIGIN" "curl --fail -s -o /dev/null -X OPTIONS -H 'Origin: $APP_ORIGIN' '$API_URL/functions/v1/demo-code-login'"
  check "fake OpenRouter answers on $FAKE_PORT" "curl --fail -s -o /dev/null http://127.0.0.1:$FAKE_PORT/__requests"
  check "Supabase containers for project $PROJECT_ID running" "docker ps --format '{{.Names}}' | grep -q '^supabase_db_$PROJECT_ID\$'"
  local stats; stats="$(curl -s "http://127.0.0.1:$FAKE_PORT/__stats" || true)"
  if [ "$MODE" = live ]; then
    local proxy_env; proxy_env="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$FAKE_PROVIDER" 2>/dev/null || true)"
    check "provider proxy forwards to real OpenRouter" "grep -qx 'UPSTREAM=https://openrouter.ai/api' <<<\"\$proxy_env\""
    check "every chat call is pinned to $LIVE_MODEL" "grep -qx 'LIVE_MODEL=$LIVE_MODEL' <<<\"\$proxy_env\""
    check "Edge Functions hold a real OpenRouter key (not the placeholder)" "! grep -qxF \"\$(grep '^OPENROUTER_API_KEY=' .superset/workspace-test.env)\" '$STATE_DIR/function.env'"
    check "Edge Functions hold an Exa key" "grep -q '^EXA_API_KEY=.' '$STATE_DIR/function.env'"
    say "info live calls used: $(node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(`${s.upstreamCalls}/${s.maxUpstreamCalls}`)' "$stats" 2>/dev/null || echo '?')"
  else
    check "provider is the deterministic fake (no network, no spend)" "grep -q '\"mode\":\"fake\"' <<<\"\$stats\""
  fi
  say "info stripe: $STRIPE_MODE"
  if [ -n "${COLLAB_PID:-}" ]; then check "collaboration service $COLLAB_PID alive" "kill -0 $COLLAB_PID"; fi
  say "info started at commit $HEAD; worktree now at $(git rev-parse HEAD)$(git diff --quiet || echo ' (+ uncommitted changes; Vite serves them live)')"
  say "info logs in $LOG_DIR"
  return "$bad"
}

cmd_user() {
  load_state
  set -a; source "$STATE_DIR/drive.env"; set +a
  node "$SKILL_DIR/bin/demo-user.mjs" create "${1:-verify}" "$USERS"
}

cmd_drive() {
  load_state
  local recipe="${1:?usage: verify.sh drive <all|recipes/<name>|e2e/<path>> [playwright args]}"; shift
  cmd_doctor >/dev/null || { cmd_doctor || true; fail "doctor failed; not driving a broken stack (fix it, or down + up)"; }
  # Filters are path substrings: `recipes/ai-tools`, `e2e/live/`, `all` (every recipe).
  local filter="${recipe%.spec.ts}"
  [ "$recipe" = all ] && filter="verify-debatelab/recipes/"
  local name; name="$(basename "$filter")"
  local run_id; run_id="$(date -u +%Y%m%dT%H%M%SZ)-$name"
  set -a; source "$STATE_DIR/drive.env"; set +a
  export VERIFY_ARTIFACT_DIR="$ARTIFACTS/$run_id" VERIFY_HEAD="$(git rev-parse HEAD)"
  mkdir -p "$VERIFY_ARTIFACT_DIR"
  local status=0
  npx playwright test --config "$SKILL_DIR/playwright.verify.config.ts" "$filter" "$@" || status=$?
  say "EVIDENCE $VERIFY_ARTIFACT_DIR (exit $status)"
  return "$status"
}

cmd_e2e() {
  load_state
  local sub="${1:-run}"; [ "$#" -eq 0 ] || shift
  case "$sub" in run|explore|list|cache) ;; *) fail "usage: verify.sh e2e <run|explore|list|cache> [e2e args]" ;; esac
  cmd_doctor >/dev/null || { cmd_doctor || true; fail "doctor failed; not driving a broken stack (fix it, or down + up)"; }
  set -a; source "$STATE_DIR/drive.env"; set +a
  export E2E_TELEMETRY_DISABLED=1
  # The testing agent's own model key, separate from the app's provider mode:
  # a fake-mode stack still needs a real model to act and judge.
  if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    local key="${LIVE_OPENROUTER_API_KEY:-}"
    if [ -z "$key" ] && [ -f "$LIVE_KEYS_FILE" ]; then
      [ "$(stat -c %a "$LIVE_KEYS_FILE")" = 600 ] || fail "$LIVE_KEYS_FILE must be mode 600"
      key="$(sed -n 's/^LIVE_OPENROUTER_API_KEY=//p' "$LIVE_KEYS_FILE" | tail -1)"
    fi
    [ -n "$key" ] && export OPENROUTER_API_KEY="$key"
  fi
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    say "info testing agent: OpenRouter ${E2E_AGENT_MODEL:-openai/gpt-6-luna} (billed to the OpenRouter key; replayed steps are free)"
  else
    say "info no OpenRouter key: tests with agent steps will skip"
  fi
  case "$sub" in
    run|explore)
      # The pid keeps parallel explorations (a bug bash) in separate directories.
      local run_id; run_id="$(date -u +%Y%m%dT%H%M%SZ)-e2e-$sub-$$"
      local out=".verify/artifacts/$run_id"
      local status=0
      npx e2e "$sub" --output "$out" "$@" || status=$?
      say "EVIDENCE $REPO/$out (exit $status)"
      return "$status"
      ;;
    *) npx e2e "$sub" "$@" ;;
  esac
}

cmd_down() {
  if [ ! -f "$STATE" ]; then say "nothing recorded in $STATE; nothing to stop"; return 0; fi
  source "$STATE"
  if [ -s "$USERS" ] && [ -f "$STATE_DIR/drive.env" ]; then
    ( set -a; source "$STATE_DIR/drive.env"; set +a; node "$SKILL_DIR/bin/demo-user.mjs" delete-all "$USERS" ) || say "warn: could not delete minted demo users (stack is about to be wiped anyway)"
  fi
  local pid
  for pid in "${COLLAB_PID:-}" "${VITE_PID:-}" "${FUNCTIONS_PID:-}"; do
    [ -n "$pid" ] && kill -- "-$pid" 2>/dev/null || true
  done
  for pid in "${COLLAB_PID:-}" "${VITE_PID:-}" "${FUNCTIONS_PID:-}"; do
    [ -n "$pid" ] || continue
    for _ in $(seq 1 50); do alive "$pid" || break; sleep 0.1; done
    alive "$pid" && kill -9 -- "-$pid" 2>/dev/null || true
  done
  [ "${FAKE_STARTED:-}" = true ] && docker rm -f "$FAKE_PROVIDER" >/dev/null 2>&1 || true
  if [ "${STACK_STARTED:-}" = true ]; then
    supabase stop --no-backup >>"${LOG_DIR:-/dev/null}/supabase.log" 2>&1 || say "warn: supabase stop failed; see ${LOG_DIR:-}/supabase.log"
  fi
  if [ -n "${HOLDER_PID:-}" ]; then
    if [ "$(cat "$DB_LOCK/pid" 2>/dev/null)" = "$HOLDER_PID" ]; then lock_release "$DB_LOCK"; fi
    kill "$HOLDER_PID" 2>/dev/null || true
  fi
  rm -rf -- "$STATE_DIR"
  say "DOWN (evidence kept in $ARTIFACTS, logs in ${LOG_DIR:-$VERIFY_ROOT/logs})"
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  doctor) cmd_doctor ;;
  user) shift; cmd_user "$@" ;;
  drive) shift; cmd_drive "$@" ;;
  e2e) shift; cmd_e2e "$@" ;;
  down) cmd_down ;;
  *) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 2 ;;
esac
