#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
database_password="${SUPABASE_DB_PASSWORD:-postgres}"
test_user_id="66666666-6666-4666-8666-666666666666"
result_dir="$(mktemp -d)"
first_pid=""
second_pid=""

cleanup() {
  touch "$result_dir/release-first"
  if [ -n "$first_pid" ]; then
    wait "$first_pid" 2>/dev/null || true
  fi
  if [ -n "$second_pid" ]; then
    wait "$second_pid" 2>/dev/null || true
  fi
  PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 \
    --command "DELETE FROM auth.users WHERE id = '$test_user_id'" >/dev/null
  rm -rf "$result_dir"
}
trap cleanup EXIT

(
  cd "$repo_root"
  PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO auth.users (id)
VALUES ('77777777-7777-4777-8777-777777777777');
DROP FUNCTION public.consume_daily_quota(uuid, integer, text, integer, numeric);
CREATE FUNCTION public.consume_daily_quota(uuid, integer)
RETURNS TABLE (allowed boolean, current_count integer)
LANGUAGE sql
AS $$ SELECT false, 0 $$;
ALTER TABLE public.daily_usage_counters DROP CONSTRAINT daily_usage_counters_pkey;
ALTER TABLE public.daily_usage_counters DROP COLUMN quota_key;
ALTER TABLE public.daily_usage_counters
  ADD CONSTRAINT daily_usage_counters_pkey PRIMARY KEY (user_id, usage_date);
INSERT INTO public.daily_usage_counters (user_id, usage_date, request_count)
VALUES ('77777777-7777-4777-8777-777777777777', CURRENT_DATE - 1, 7);
\i supabase/migrations/20260920125555_scope_daily_usage_counters.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_usage_counters
    WHERE user_id = '77777777-7777-4777-8777-777777777777'
      AND usage_date = CURRENT_DATE - 1
      AND quota_key = 'ai'
      AND request_count = 7
  ) THEN
    RAISE EXCEPTION 'legacy daily usage row was not preserved under the ai quota';
  END IF;
END;
$$;
ROLLBACK;
SQL
)
echo "Legacy quota row migration: count 7 preserved under ai"

PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 \
  --command "DELETE FROM auth.users WHERE id = '$test_user_id'; INSERT INTO auth.users (id) VALUES ('$test_user_id')" \
  >/dev/null

reserve_first() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT allowed, current_count
FROM public.consume_daily_quota('$test_user_id', 1, 'concurrent');
\! touch "$result_dir/first-holds-lock"
\! while [ ! -e "$result_dir/release-first" ]; do sleep 0.05; done
COMMIT;
SQL
}

reserve_second() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT allowed, current_count
FROM public.consume_daily_quota('$test_user_id', 1, 'concurrent') /* daily_quota_concurrency_second */;
COMMIT;
SQL
}

reserve_first >"$result_dir/first" &
first_pid=$!

for _ in {1..100}; do
  if [ -e "$result_dir/first-holds-lock" ]; then
    break
  fi
  if ! kill -0 "$first_pid" 2>/dev/null; then
    wait "$first_pid"
  fi
  sleep 0.05
done
if [ ! -e "$result_dir/first-holds-lock" ]; then
  echo "first quota reservation did not acquire its row lock"
  exit 1
fi

reserve_second >"$result_dir/second" &
second_pid=$!

second_is_waiting=false
for _ in {1..100}; do
  if [ "$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%daily_quota_concurrency_second%')")" = "t" ]; then
    second_is_waiting=true
    break
  fi
  if ! kill -0 "$second_pid" 2>/dev/null; then
    break
  fi
  sleep 0.05
done
if [ "$second_is_waiting" != true ]; then
  echo "second quota reservation did not wait on the first row lock"
  exit 1
fi

touch "$result_dir/release-first"

first_result=0
second_result=0
wait "$first_pid" || first_result=$?
wait "$second_pid" || second_result=$?
if [ "$first_result" -ne 0 ] || [ "$second_result" -ne 0 ]; then
  exit 1
fi

actual_results="$(grep -hE '^[tf]\|[0-9]+$' "$result_dir/first" "$result_dir/second" | sort)"
expected_results=$'f|1\nt|1'
if [ "$actual_results" != "$expected_results" ]; then
  echo "unexpected concurrent quota results:"
  echo "$actual_results"
  exit 1
fi

stored_count="$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
  "SELECT request_count FROM public.daily_usage_counters WHERE user_id = '$test_user_id' AND usage_date = CURRENT_DATE AND quota_key = 'concurrent'")"
if [ "$stored_count" != "1" ]; then
  echo "expected one stored concurrent reservation, got: $stored_count"
  exit 1
fi

echo "Concurrent quota reservations: 1 allowed, 1 rejected, stored count 1"
