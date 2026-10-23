-- Production's public.rate_limits and public.global_prompts may predate
-- 20260204000000_admin_improvements.sql, whose CREATE TABLE IF NOT EXISTS
-- skipped them. Production rate_limits has no updated_at column (see
-- 20261022180000_rate_limits_order_by_created_at.sql), yet the admin function
-- writes it on Set limit and orders global limits by it, so Set limit fails
-- there. 20261022180000 moved the readers to created_at; this adds the column
-- so the writers work too, without an Edge Function deploy.
--
-- Additive and safe to rerun. Each step checks the catalog first:
--   * a missing updated_at is added and backfilled from created_at; an
--     existing column and its values are left alone;
--   * the unique keys the admin upserts infer, rate_limits (user_id,
--     limit_type) and global_prompts (feature), are created only when no
--     unique index on exactly those columns exists and no duplicate rows
--     would block one. Duplicates raise a warning and stay: nothing is deleted.
-- user_roles had the same drift; 20260907155821_reconcile_user_roles_updated_at.sql fixed it.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN SELECT unnest(ARRAY['rate_limits', 'global_prompts']) AS table_name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target.table_name AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()', target.table_name);
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = target.table_name AND column_name = 'created_at'
      ) THEN
        EXECUTE format('UPDATE public.%I SET updated_at = created_at WHERE created_at IS NOT NULL', target.table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Set prompt writes these too; a legacy table may lack them.
ALTER TABLE public.global_prompts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
-- global_prompts holds at most one row per feature (six), so the foreign key's
-- scan and lock are momentary; where the column exists this does nothing.
-- squawk-ignore adding-foreign-key-constraint
ALTER TABLE public.global_prompts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('rate_limits', ARRAY['limit_type', 'user_id'], 'rate_limits_user_id_limit_type_key', 'user_id, limit_type'),
      ('global_prompts', ARRAY['feature'], 'global_prompts_feature_key', 'feature')
    ) AS keys (table_name, sorted_columns, index_name, column_list)
  LOOP
    -- A plain unique index on exactly these columns, in any order, already serves ON CONFLICT.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_index AS i
      WHERE i.indrelid = format('public.%I', target.table_name)::regclass
        AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = cardinality(target.sorted_columns)
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute AS a
             WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = target.sorted_columns
    );
    -- A null user_id (a global limit) never conflicts, so only per-user duplicates block the key.
    IF target.table_name = 'rate_limits' AND EXISTS (
      SELECT 1 FROM public.rate_limits WHERE user_id IS NOT NULL GROUP BY user_id, limit_type HAVING count(*) > 1
    ) OR target.table_name = 'global_prompts' AND EXISTS (
      SELECT 1 FROM public.global_prompts GROUP BY feature HAVING count(*) > 1
    ) THEN
      RAISE WARNING '% has duplicate (%) rows; unique key not created', target.table_name, target.column_list;
      CONTINUE;
    END IF;
    EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s)', target.index_name, target.table_name, target.column_list);
  END LOOP;
END $$;

-- Keep rate_limits.updated_at current on any write, as evidence_cards does.
CREATE OR REPLACE TRIGGER rate_limits_set_updated_at
  BEFORE UPDATE ON public.rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
