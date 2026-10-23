#!/usr/bin/env bash
# Rebuilds production's legacy rate_limits and global_prompts (no updated_at,
# no unique keys) inside one transaction that is rolled back at the end, runs
# the drift migration, then issues the writes the admin function's Set limit
# and Set prompt send. Runs the migration again to show the rerun changes nothing,
# and once with duplicate rows to show it warns instead of failing or deleting.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
database_password="${SUPABASE_DB_PASSWORD:-postgres}"

cd "$repo_root"
PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL client_min_messages = error;

CREATE FUNCTION pg_temp.check(passed boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF passed IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END;
$$;

CREATE FUNCTION pg_temp.has_column(p_table text, p_column text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column)
$$;

CREATE FUNCTION pg_temp.unique_keys(p_table text) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM pg_index WHERE indrelid = format('public.%I', p_table)::regclass AND indisunique AND NOT indisprimary
$$;

-- Production's shape: drop what 20260204000000 would have created.
DO $$
DECLARE legacy record;
BEGIN
  FOR legacy IN
    SELECT conrelid::regclass AS table_name, conname FROM pg_constraint
    WHERE conrelid IN ('public.rate_limits'::regclass, 'public.global_prompts'::regclass) AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', legacy.table_name, legacy.conname);
  END LOOP;
END $$;
DROP TRIGGER rate_limits_set_updated_at ON public.rate_limits;
ALTER TABLE public.rate_limits DROP COLUMN updated_at;
ALTER TABLE public.global_prompts DROP COLUMN updated_at;
SELECT pg_temp.check(NOT pg_temp.has_column('rate_limits', 'updated_at') AND pg_temp.unique_keys('rate_limits') = 0, 'legacy rate_limits shape');

INSERT INTO auth.users (id) VALUES
  ('d1000000-0000-4000-8000-00000000000a'),
  ('d1000000-0000-4000-8000-00000000000b');
INSERT INTO public.rate_limits (user_id, limit_type, limit_value, created_at) VALUES
  (NULL, 'drift_daily', 50, '2026-01-01T00:00:00Z'),
  ('d1000000-0000-4000-8000-00000000000a', 'drift_daily', 5, '2026-02-01T00:00:00Z'),
  -- A duplicate per-user pair blocks the unique key.
  ('d1000000-0000-4000-8000-00000000000b', 'drift_daily', 7, '2026-03-01T00:00:00Z'),
  ('d1000000-0000-4000-8000-00000000000b', 'drift_daily', 8, '2026-03-02T00:00:00Z');

-- First run, with the duplicate: columns land, the key does not, nothing is deleted.
\i supabase/migrations/20261023120000_reconcile_admin_table_drift.sql

SELECT pg_temp.check(pg_temp.has_column('rate_limits', 'updated_at') AND pg_temp.has_column('global_prompts', 'updated_at'), 'updated_at added to both tables');
SELECT pg_temp.check(
  (SELECT bool_and(updated_at = created_at) FROM public.rate_limits WHERE limit_type = 'drift_daily'),
  'updated_at backfilled from created_at'
);
SELECT pg_temp.check(pg_temp.unique_keys('rate_limits') = 0, 'duplicate rows keep the rate_limits key from being created');
SELECT pg_temp.check((SELECT count(*) FROM public.rate_limits WHERE limit_type = 'drift_daily') = 4, 'no rate_limits row deleted');
SELECT pg_temp.check(pg_temp.unique_keys('global_prompts') = 1, 'global_prompts gets its feature key');

-- The admin resolves the duplicate; a rerun now creates the key.
DELETE FROM public.rate_limits WHERE user_id = 'd1000000-0000-4000-8000-00000000000b' AND limit_value = 7;
\i supabase/migrations/20261023120000_reconcile_admin_table_drift.sql
SELECT pg_temp.check(pg_temp.unique_keys('rate_limits') = 1, 'rerun creates the rate_limits key once duplicates are gone');

-- Set limit for a user: the upsert supabase-js sends with onConflict "user_id,limit_type".
INSERT INTO public.rate_limits (user_id, limit_type, limit_value, updated_at)
VALUES ('d1000000-0000-4000-8000-00000000000a', 'drift_daily', 9, '2026-10-23T00:00:00Z')
ON CONFLICT (user_id, limit_type) DO UPDATE
  SET limit_value = EXCLUDED.limit_value, updated_at = EXCLUDED.updated_at;
SELECT pg_temp.check(
  (SELECT limit_value = 9 FROM public.rate_limits WHERE user_id = 'd1000000-0000-4000-8000-00000000000a' AND limit_type = 'drift_daily'),
  'per-user Set limit upserts in place'
);

-- Set limit for everyone: find the newest global row by updated_at, then update it.
UPDATE public.rate_limits SET limit_value = 60, updated_at = '2026-10-23T00:00:00Z'
WHERE id = (SELECT id FROM public.rate_limits WHERE user_id IS NULL AND limit_type = 'drift_daily'
            ORDER BY updated_at DESC LIMIT 1);
SELECT pg_temp.check(
  (SELECT limit_value = 60 AND updated_at > created_at FROM public.rate_limits WHERE user_id IS NULL AND limit_type = 'drift_daily'),
  'global Set limit updates the newest row and its updated_at'
);

-- Set prompt: the upsert with onConflict "feature".
INSERT INTO public.global_prompts (feature, prompt_text, is_active, created_by, updated_at)
VALUES ('generate', 'drift test prompt', true, NULL, now())
ON CONFLICT (feature) DO UPDATE
  SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at;
SELECT pg_temp.check(
  (SELECT prompt_text = 'drift test prompt' FROM public.global_prompts WHERE feature = 'generate'),
  'Set prompt upserts'
);

-- A third run on the reconciled tables changes nothing.
CREATE TEMP TABLE before_rerun AS SELECT id, ctid AS row_version, updated_at FROM public.rate_limits;
\i supabase/migrations/20261023120000_reconcile_admin_table_drift.sql
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM before_rerun AS b JOIN public.rate_limits AS r USING (id)
              WHERE b.row_version IS DISTINCT FROM r.ctid OR b.updated_at IS DISTINCT FROM r.updated_at),
  'rerun rewrites no rate_limits row'
);
SELECT pg_temp.check(pg_temp.unique_keys('rate_limits') = 1 AND pg_temp.unique_keys('global_prompts') = 1, 'rerun adds no second key');

ROLLBACK;
SQL

echo "Admin table drift migration: legacy shape, duplicates, Set limit, Set prompt and rerun passed"
