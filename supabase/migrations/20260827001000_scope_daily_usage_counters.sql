-- Separate independently configured daily quotas while keeping one atomic RPC.
-- Existing AI callers omit p_quota_key and therefore use the default 'ai'.
-- import-source passes 'import_source' so URL imports cannot consume a user's
-- normal AI allowance (or vice versa).
--
-- IMPORTANT: this migration is source-only on the current feature branch. It
-- has not been applied to staging or production.

ALTER TABLE public.daily_usage_counters
  ADD COLUMN IF NOT EXISTS quota_key text NOT NULL DEFAULT 'ai';

ALTER TABLE public.daily_usage_counters
  DROP CONSTRAINT IF EXISTS daily_usage_counters_pkey;

ALTER TABLE public.daily_usage_counters
  ADD CONSTRAINT daily_usage_counters_pkey PRIMARY KEY (user_id, usage_date, quota_key);

DROP FUNCTION IF EXISTS public.consume_daily_quota(uuid, integer);

CREATE OR REPLACE FUNCTION public.consume_daily_quota(
  p_user_id uuid,
  p_limit integer,
  p_quota_key text DEFAULT 'ai'
)
RETURNS TABLE (allowed boolean, current_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_key text := nullif(trim(p_quota_key), '');
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_limit < 1 OR v_quota_key IS NULL THEN
    RAISE EXCEPTION 'quota reservation is restricted to trusted server code';
  END IF;

  RETURN QUERY
  WITH reserved AS (
    INSERT INTO public.daily_usage_counters (user_id, usage_date, quota_key, request_count)
    VALUES (p_user_id, CURRENT_DATE, v_quota_key, 1)
    ON CONFLICT (user_id, usage_date, quota_key) DO UPDATE
      SET request_count = public.daily_usage_counters.request_count + 1
      WHERE public.daily_usage_counters.request_count < p_limit
    RETURNING request_count
  )
  SELECT true, request_count FROM reserved
  UNION ALL
  SELECT false, COALESCE((
    SELECT request_count
    FROM public.daily_usage_counters
    WHERE user_id = p_user_id
      AND usage_date = CURRENT_DATE
      AND quota_key = v_quota_key
  ), 0)
  WHERE NOT EXISTS (SELECT 1 FROM reserved);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_quota(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_quota(uuid, integer, text) TO service_role;
