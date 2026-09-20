#!/usr/bin/env bash
set -euo pipefail

database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
database_password="${SUPABASE_DB_PASSWORD:-postgres}"
workspace_id="74444444-4444-4444-8444-444444444444"
owner_id="71111111-1111-4111-8111-111111111111"
first_user_id="72222222-2222-4222-8222-222222222222"
second_user_id="73333333-3333-4333-8333-333333333333"
result_dir="$(mktemp -d)"
first_pid=""
second_pid=""

cleanup() {
  touch "$result_dir/release-first"
  if [ -n "$first_pid" ]; then wait "$first_pid" 2>/dev/null || true; fi
  if [ -n "$second_pid" ]; then wait "$second_pid" 2>/dev/null || true; fi
  PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<SQL >/dev/null
DELETE FROM public.workspaces WHERE id = '$workspace_id';
DELETE FROM auth.users WHERE id IN ('$owner_id', '$first_user_id', '$second_user_id');
SQL
  rm -rf "$result_dir"
}
trap cleanup EXIT

PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<SQL >/dev/null
DELETE FROM public.workspaces WHERE id = '$workspace_id';
DELETE FROM auth.users WHERE id IN ('$owner_id', '$first_user_id', '$second_user_id');
INSERT INTO auth.users (id) VALUES ('$owner_id'), ('$first_user_id'), ('$second_user_id');
INSERT INTO public.workspaces (id, owner_id, motion, initial_language, create_request_id)
VALUES (
  '$workspace_id', '$owner_id', 'Concurrent invite race', 'en',
  '76666666-6666-4666-8666-666666666666'
);
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES ('$workspace_id', '$owner_id');
INSERT INTO private.workspace_invites (
  id, workspace_id, kind, secret_digest, issued_by, expires_at, max_uses
) VALUES (
  '75555555-5555-4555-8555-555555555555', '$workspace_id', 'code',
  decode(repeat('cd', 32), 'hex'), '$owner_id', now() + interval '48 hours', 1
);
SQL

redeem_first() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT status, coalesce(workspace_id::text, ''), already_member
FROM public.redeem_workspace_invite(
  '$first_user_id', decode(repeat('cd', 32), 'hex'), NULL,
  decode(repeat('d1', 32), 'hex'), '77777777-7777-4777-8777-777777777771'
);
\! touch "$result_dir/first-holds-lock"
\! while [ ! -e "$result_dir/release-first" ]; do sleep 0.05; done
COMMIT;
SQL
}

redeem_second() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT status, coalesce(workspace_id::text, ''), already_member
FROM public.redeem_workspace_invite(
  '$second_user_id', decode(repeat('cd', 32), 'hex'), NULL,
  decode(repeat('d2', 32), 'hex'), '77777777-7777-4777-8777-777777777772'
) /* workspace_invite_concurrency_second */;
COMMIT;
SQL
}

redeem_first >"$result_dir/first" &
first_pid=$!

for _ in {1..100}; do
  if [ -e "$result_dir/first-holds-lock" ]; then break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then wait "$first_pid"; fi
  sleep 0.05
done
if [ ! -e "$result_dir/first-holds-lock" ]; then
  echo "first invite redemption did not acquire its locks"
  exit 1
fi

redeem_second >"$result_dir/second" &
second_pid=$!

second_is_waiting=false
for _ in {1..100}; do
  if [ "$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%workspace_invite_concurrency_second%')")" = "t" ]; then
    second_is_waiting=true
    break
  fi
  if ! kill -0 "$second_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [ "$second_is_waiting" != true ]; then
  echo "second invite redemption did not wait on the first transaction"
  exit 1
fi

touch "$result_dir/release-first"
first_result=0
second_result=0
wait "$first_pid" || first_result=$?
wait "$second_pid" || second_result=$?
if [ "$first_result" -ne 0 ] || [ "$second_result" -ne 0 ]; then exit 1; fi

actual_results="$(grep -hE '^(accepted|unavailable)\|' "$result_dir/first" "$result_dir/second" | sort)"
expected_results=$'accepted|74444444-4444-4444-8444-444444444444|f\nunavailable||f'
if [ "$actual_results" != "$expected_results" ]; then
  echo "unexpected concurrent invite results:"
  echo "$actual_results"
  exit 1
fi

stored_state="$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
  "SELECT i.use_count, count(m.user_id) FROM private.workspace_invites i LEFT JOIN public.workspace_members m ON m.workspace_id = i.workspace_id AND m.user_id IN ('$first_user_id', '$second_user_id') WHERE i.id = '75555555-5555-4555-8555-555555555555' GROUP BY i.use_count")"
if [ "$stored_state" != "1|1" ]; then
  echo "expected one invite use and one admitted member, got: $stored_state"
  exit 1
fi

echo "Concurrent last-use redemption: 1 accepted, 1 rejected, stored use count 1"
