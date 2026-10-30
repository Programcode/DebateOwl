# Shared local-stack allocation. Source lock.sh before calling stack_slot_acquire.
# Keep slot 1 identical to the pinned CLI defaults; slot 2 offsets ports by 100.
stack_slot_configure() {
  case "$1" in 1|2) ;; *) echo "Invalid stack slot: $1" >&2; return 1 ;; esac
  export DEBATELAB_STACK_SLOT="$1"
  local offset=$((($1 - 1) * 100))
  DB_LOCK="$HOME/.superset/debatelab-db.lock"
  FAKE_PROVIDER=debatelab-fake-openrouter
  if [ "$1" = 2 ]; then
    DB_LOCK="$HOME/.superset/debatelab-db.slot2.lock"
    FAKE_PROVIDER=debatelab-fake-openrouter-s2
  fi
  export FAKE_PROVIDER
  export APP_PORT=$((18081 + offset)) FAKE_PORT=$((18090 + offset)) COLLAB_PORT=$((12345 + offset))
  export APP_ORIGIN="http://127.0.0.1:$APP_PORT"
  export FAKE_OPENROUTER_URL="http://127.0.0.1:$FAKE_PORT"
  export COLLABORATION_PORT="$COLLAB_PORT"
  # CLI 2.121.0 maps config paths to env keys (dots become underscores).
  # Mailpit is [local_smtp], formerly [inbucket]. SMTP/POP3 host ports stay
  # disabled (0), as in today's defaults; the web/API port is allocated here.
  export SUPABASE_API_PORT=$((54321 + offset)) SUPABASE_DB_PORT=$((54322 + offset))
  export SUPABASE_DB_SHADOW_PORT=$((54320 + offset)) SUPABASE_STUDIO_PORT=$((54323 + offset))
  export SUPABASE_LOCAL_SMTP_PORT=$((54324 + offset))
  export SUPABASE_LOCAL_SMTP_SMTP_PORT=0 SUPABASE_LOCAL_SMTP_POP3_PORT=0
  export SUPABASE_ANALYTICS_PORT=$((54327 + offset)) SUPABASE_DB_POOLER_PORT=$((54329 + offset))
  export SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT=$((8083 + offset))
  export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:$SUPABASE_DB_PORT/postgres"
}

stack_slot_acquire() {
  local slots="${DEBATELAB_STACK_SLOTS:-2}" timeout="${1:-600}" waited=0 slot
  case "$slots" in 1|2) ;; *) echo "DEBATELAB_STACK_SLOTS must be 1 or 2" >&2; return 1 ;; esac
  while :; do
    for ((slot=1; slot<=slots; slot++)); do
      stack_slot_configure "$slot"
      if lock_acquire "$DB_LOCK" 0 2>/dev/null; then
        echo "Acquired local Supabase slot $slot (DB $SUPABASE_DB_PORT, app $APP_PORT)"
        return 0
      fi
    done
    if [ "$waited" -ge "$timeout" ]; then
      echo "Timed out after ${timeout}s waiting for a local Supabase slot ($slots enabled)" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}
