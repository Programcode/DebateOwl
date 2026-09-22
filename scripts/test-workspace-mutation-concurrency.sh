#!/usr/bin/env bash
set -euo pipefail

database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
database_password="${SUPABASE_DB_PASSWORD:-postgres}"
owner_id="84444444-4444-4444-8444-444444444444"
member_id="85555555-5555-4555-8555-555555555555"
request_id="86666666-6666-4666-8666-666666666666"
result_dir="$(mktemp -d)"
first_pid=""
second_pid=""

cleanup() {
  touch "$result_dir/release-removal"
  if [ -n "$first_pid" ]; then wait "$first_pid" 2>/dev/null || true; fi
  if [ -n "$second_pid" ]; then wait "$second_pid" 2>/dev/null || true; fi
  PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<SQL >/dev/null
DELETE FROM public.workspaces WHERE create_request_id = '$request_id';
DELETE FROM auth.users WHERE id IN ('$owner_id', '$member_id');
SQL
  rm -rf "$result_dir"
}
trap cleanup EXIT

PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<SQL >/dev/null
DELETE FROM public.workspaces WHERE create_request_id = '$request_id';
DELETE FROM auth.users WHERE id IN ('$owner_id', '$member_id');
INSERT INTO auth.users (id) VALUES ('$owner_id'), ('$member_id');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$owner_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.create_workspace('Concurrent mutation', NULL, 'en', '$request_id');
COMMIT;
INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, '$member_id' FROM public.workspaces WHERE create_request_id = '$request_id';
SQL

workspace_id="$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
  "SELECT id FROM public.workspaces WHERE create_request_id = '$request_id'")"
document_id="$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
  "SELECT id FROM public.workspace_documents WHERE workspace_id = '$workspace_id' ORDER BY side, position LIMIT 1")"

remove_member() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$owner_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.change_workspace_access(
  '$workspace_id', 'remove', '$member_id', 0,
  '87777777-7777-4777-8777-777777777777'
);
\! touch "$result_dir/removal-holds-lock"
\! while [ ! -e "$result_dir/release-removal" ]; do sleep 0.05; done
COMMIT;
SQL
}

write_after_removal() {
  PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$member_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.create_workspace_comment(
  '$workspace_id', '$document_id',
  '88888888-8888-4888-8888-888888888888',
  jsonb_build_object(
    'id', '88888888-8888-4888-8888-888888888888',
    'documentEpoch', 0,
    'from', jsonb_build_array(1),
    'to', jsonb_build_array(2),
    'quote', 'claim'
  ),
  'Must not commit after removal', ARRAY[]::uuid[]
) /* workspace_mutation_concurrency_second */;
COMMIT;
SQL
}

remove_member >"$result_dir/removal" 2>&1 &
first_pid=$!
for _ in {1..100}; do
  if [ -e "$result_dir/removal-holds-lock" ]; then break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then wait "$first_pid"; fi
  sleep 0.05
done
if [ ! -e "$result_dir/removal-holds-lock" ]; then
  echo "member removal did not acquire the workspace lock"
  exit 1
fi

write_after_removal >"$result_dir/write" 2>&1 &
second_pid=$!
second_is_waiting=false
for _ in {1..100}; do
  if [ "$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%workspace_mutation_concurrency_second%')")" = "t" ]; then
    second_is_waiting=true
    break
  fi
  if ! kill -0 "$second_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [ "$second_is_waiting" != true ]; then
  echo "workspace mutation did not wait for removal"
  exit 1
fi

touch "$result_dir/release-removal"
wait "$first_pid"
if wait "$second_pid"; then
  echo "removed member mutation unexpectedly committed"
  exit 1
fi
if ! grep -q "workspace unavailable" "$result_dir/write"; then
  cat "$result_dir/write"
  exit 1
fi

stored_comments="$(PGPASSWORD="$database_password" psql "$database_url" -qAtX --set ON_ERROR_STOP=1 --command \
  "SELECT count(*) FROM public.workspace_comments WHERE workspace_id = '$workspace_id'")"
if [ "$stored_comments" != "0" ]; then
  echo "expected no post-removal comment, got: $stored_comments"
  exit 1
fi

echo "Concurrent removal: later workspace mutation waited and was rejected"
