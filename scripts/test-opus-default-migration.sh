#!/usr/bin/env bash
# Runs the Opus-to-Sonnet settings migration and its rollback against seeded
# accounts, each twice, inside one transaction that is rolled back at the end.
# now() is fixed inside a transaction, so "changed nothing" compares row
# versions (ctid), which every UPDATE replaces.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
database_password="${SUPABASE_DB_PASSWORD:-postgres}"

cd "$repo_root"
PGPASSWORD="$database_password" psql "$database_url" -qX --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;

CREATE FUNCTION pg_temp.check(passed boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF passed IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END;
$$;

CREATE FUNCTION pg_temp.configs(p_user uuid) RETURNS jsonb
LANGUAGE sql AS $$ SELECT feature_configs FROM public.user_settings WHERE user_id = p_user $$;

CREATE FUNCTION pg_temp.model(p_user uuid, p_feature text) RETURNS text
LANGUAGE sql AS $$ SELECT feature_configs->p_feature->>'model' FROM public.user_settings WHERE user_id = p_user $$;

CREATE FUNCTION pg_temp.tool(p_model text, p_effort text DEFAULT 'medium') RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('provider', 'openrouter', 'model', p_model, 'reasoningEffort', p_effort) $$;

-- a: every tool on Opus (the old Pro default)
-- b: Opus on some tools, other models on the rest
-- c: a retired Opus ID, which the client already maps to Opus 5.5 as a pick
-- d: never saved
-- e: a lapsed Basic account with Opus still saved
-- f: a malformed scalar value
INSERT INTO auth.users (id) VALUES
  ('a0000000-0000-4000-8000-00000000000a'),
  ('b0000000-0000-4000-8000-00000000000b'),
  ('c0000000-0000-4000-8000-00000000000c'),
  ('d0000000-0000-4000-8000-00000000000d'),
  ('e0000000-0000-4000-8000-00000000000e'),
  ('f0000000-0000-4000-8000-00000000000f');

CREATE TEMP TABLE seeded (user_id uuid PRIMARY KEY, feature_configs jsonb NOT NULL);
INSERT INTO seeded VALUES
  ('a0000000-0000-4000-8000-00000000000a', (
    SELECT jsonb_object_agg(feature, pg_temp.tool('anthropic/claude-opus-5.5'))
    FROM unnest(ARRAY['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'sparring']) AS feature
  )),
  ('b0000000-0000-4000-8000-00000000000b', jsonb_build_object(
    'generate', pg_temp.tool('anthropic/claude-opus-5.5', 'high'),
    'attack', pg_temp.tool('anthropic/claude-haiku-5.5', 'low'),
    'ask', pg_temp.tool('auto-pro')
  )),
  ('c0000000-0000-4000-8000-00000000000c', jsonb_build_object('generate', pg_temp.tool('anthropic/claude-opus-5'))),
  ('d0000000-0000-4000-8000-00000000000d', '{}'::jsonb),
  ('e0000000-0000-4000-8000-00000000000e', jsonb_build_object('ask', pg_temp.tool('anthropic/claude-opus-5.5', 'low'))),
  ('f0000000-0000-4000-8000-00000000000f', '"anthropic/claude-opus-5.5"'::jsonb);

UPDATE public.user_settings AS settings
SET feature_configs = seeded.feature_configs,
    subscription_tier = CASE WHEN settings.user_id = 'e0000000-0000-4000-8000-00000000000e' THEN 'trial' ELSE 'pro' END
FROM seeded
WHERE settings.user_id = seeded.user_id;
SELECT pg_temp.check(count(*) = 6, 'six seeded settings rows')
FROM public.user_settings WHERE user_id IN (SELECT user_id FROM seeded);

-- Migration, first run.
\i supabase/migrations/20261022120000_opus_default_to_sonnet.sql

SELECT pg_temp.check(
  (SELECT bool_and(value->>'model' = 'anthropic/claude-sonnet-5.5' AND value->>'reasoningEffort' = 'medium')
   FROM jsonb_each(pg_temp.configs('a0000000-0000-4000-8000-00000000000a')))
  AND (SELECT count(*) FROM jsonb_object_keys(pg_temp.configs('a0000000-0000-4000-8000-00000000000a'))) = 6,
  'a: all six tools move to Sonnet with their reasoning effort'
);
SELECT pg_temp.check(
  pg_temp.configs('b0000000-0000-4000-8000-00000000000b') = jsonb_build_object(
    'generate', pg_temp.tool('anthropic/claude-sonnet-5.5', 'high'),
    'attack', pg_temp.tool('anthropic/claude-haiku-5.5', 'low'),
    'ask', pg_temp.tool('auto-pro')
  ),
  'b: only the Opus tool moves'
);
SELECT pg_temp.check(pg_temp.model('e0000000-0000-4000-8000-00000000000e', 'ask') = 'anthropic/claude-sonnet-5.5', 'e: a Basic row with Opus moves too');
SELECT pg_temp.check(
  (SELECT bool_and(pg_temp.configs(user_id) = feature_configs) FROM seeded
   WHERE user_id IN ('c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-00000000000f')),
  'c, d, f: retired Opus, empty and malformed settings are untouched'
);
SELECT pg_temp.check(
  (SELECT array_agg(backup.user_id ORDER BY backup.user_id) FROM private.opus_default_backup AS backup
   WHERE backup.user_id IN (SELECT user_id FROM seeded))
    = ARRAY['a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000e']::uuid[],
  'backup holds exactly the migrated users'
);
SELECT pg_temp.check(
  (SELECT bool_and(backup.feature_configs = seeded.feature_configs AND backup.migrated_feature_configs = pg_temp.configs(backup.user_id))
   FROM private.opus_default_backup AS backup JOIN seeded USING (user_id)),
  'backup holds the original and the migrated settings'
);

-- A picks Opus again for one tool. A second run must not undo that or touch anyone else.
UPDATE public.user_settings
SET feature_configs = jsonb_set(feature_configs, '{generate,model}', '"anthropic/claude-opus-5.5"')
WHERE user_id = 'a0000000-0000-4000-8000-00000000000a';
CREATE TEMP TABLE before_second_run AS
  SELECT user_id, feature_configs, ctid AS row_version FROM public.user_settings WHERE user_id IN (SELECT user_id FROM seeded);
CREATE TEMP TABLE backup_before_second_run AS
  SELECT * FROM private.opus_default_backup WHERE user_id IN (SELECT user_id FROM seeded);

-- Migration, second run.
\i supabase/migrations/20261022120000_opus_default_to_sonnet.sql

SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM before_second_run AS before JOIN public.user_settings AS now USING (user_id)
    WHERE before.feature_configs IS DISTINCT FROM now.feature_configs OR before.row_version IS DISTINCT FROM now.ctid
  ),
  'second migration run changes no settings, including an Opus pick made after the first run'
);
SELECT pg_temp.check(
  (SELECT count(*) FROM private.opus_default_backup WHERE user_id IN (SELECT user_id FROM seeded)) = 3
  AND NOT EXISTS (
    SELECT 1 FROM backup_before_second_run AS before JOIN private.opus_default_backup AS now USING (user_id)
    WHERE before.feature_configs IS DISTINCT FROM now.feature_configs
      OR before.migrated_feature_configs IS DISTINCT FROM now.migrated_feature_configs
  ),
  'second migration run leaves the backup alone'
);

-- Changes after the migration that a rollback must keep: A raises one tool's
-- effort but stays on Sonnet; B moves its migrated tool to GPT-6.1 Sol.
UPDATE public.user_settings
SET feature_configs = jsonb_set(feature_configs, '{brainstorm,reasoningEffort}', '"high"')
WHERE user_id = 'a0000000-0000-4000-8000-00000000000a';
UPDATE public.user_settings
SET feature_configs = jsonb_set(feature_configs, '{generate,model}', '"openai/gpt-6.1-sol"')
WHERE user_id = 'b0000000-0000-4000-8000-00000000000b';

-- Rollback, first run.
\i supabase/rollbacks/20261022120000_opus_default_to_sonnet.down.sql

SELECT pg_temp.check(
  (SELECT bool_and(value->>'model' = 'anthropic/claude-opus-5.5') FROM jsonb_each(pg_temp.configs('a0000000-0000-4000-8000-00000000000a')))
  AND pg_temp.configs('a0000000-0000-4000-8000-00000000000a')->'brainstorm'->>'reasoningEffort' = 'high',
  'a: every tool is back on Opus and the later effort change is kept'
);
SELECT pg_temp.check(
  pg_temp.configs('b0000000-0000-4000-8000-00000000000b') = jsonb_build_object(
    'generate', pg_temp.tool('openai/gpt-6.1-sol', 'high'),
    'attack', pg_temp.tool('anthropic/claude-haiku-5.5', 'low'),
    'ask', pg_temp.tool('auto-pro')
  ),
  'b: a model picked after the migration is kept'
);
SELECT pg_temp.check(
  pg_temp.configs('e0000000-0000-4000-8000-00000000000e') = (SELECT feature_configs FROM seeded WHERE user_id = 'e0000000-0000-4000-8000-00000000000e'),
  'e: restored to its original settings'
);
SELECT pg_temp.check(
  (SELECT bool_and(pg_temp.configs(user_id) = feature_configs) FROM seeded
   WHERE user_id IN ('c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-00000000000f')),
  'c, d, f: rollback leaves unmigrated users alone'
);
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM private.opus_default_backup), 'rollback empties the backup');

-- Rollback, second run.
CREATE TEMP TABLE before_second_rollback AS
  SELECT user_id, feature_configs, ctid AS row_version FROM public.user_settings WHERE user_id IN (SELECT user_id FROM seeded);
\i supabase/rollbacks/20261022120000_opus_default_to_sonnet.down.sql
SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM before_second_rollback AS before JOIN public.user_settings AS now USING (user_id)
    WHERE before.feature_configs IS DISTINCT FROM now.feature_configs OR before.row_version IS DISTINCT FROM now.ctid
  ),
  'second rollback run changes nothing'
);

ROLLBACK;
SQL

echo "Opus default migration: migrate, rerun, rollback and rerun passed"
