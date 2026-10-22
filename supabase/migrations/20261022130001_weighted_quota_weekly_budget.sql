-- Weight the daily AI quota by model cost and add a weekly AI spend cap.
--
-- Additive only. consume_daily_quota is left exactly as it is: import, share,
-- voice and Crossfire signals keep calling it, and the previous ai/ai-stream
-- builds keep working until the new ones are deployed. The AI functions move
-- to a new function, consume_ai_quota, because weighted units need a new
-- argument and the weekly cap a new result column, and Postgres cannot change
-- a function's arguments or result columns in place (CREATE OR REPLACE would
-- add a second overload; changing the result needs DROP).
--
-- ai_requests.cap_cost_usd is the part of a request's cost that counts
-- toward the weekly cap: what OpenRouter charged against our credits (for a
-- BYOK call that is only OpenRouter's fee, usually 0, because the provider
-- bills our own key), plus non-OpenRouter charges such as Exa and ElevenLabs.
-- So a Claude call on the BYOK Anthropic key adds about nothing, and a Claude
-- call that falls back to OpenRouter credits counts in full. When part of a
-- request's cost is unknown, the known part is recorded (a lower bound). NULL
-- means nothing is known or the row predates this column; it never counts. Rows logged before this
-- migration have NULL, so rewriting their cost_usd (for example the BYOK
-- cost backfill) cannot move anyone toward the cap.
ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS cap_cost_usd numeric;

COMMENT ON COLUMN public.ai_requests.cap_cost_usd IS
  'USD that counts toward the weekly AI spend cap: OpenRouter credit charges (BYOK provider charges excluded) plus Exa and ElevenLabs. NULL = unknown, not counted.';

-- p_units: quota units this request reserves (an expensive model counts as
--   several requests).
-- p_weekly_cap_usd: when set, refuse once the user's cap_cost_usd since
--   Monday 00:00 UTC (ISO week) reaches the cap. NULL skips the check. Cost is
--   logged after the provider answers, so the cap is soft by about one request.
-- denied_by: 'daily' or 'weekly' when refused, NULL when allowed.
-- The weights and the cap live in supabase/functions/_shared/usage-limits.ts.
-- The week's spend is read through idx_ai_requests_user_created
-- (20261022130000_index_ai_requests_user_created.sql).
CREATE FUNCTION public.consume_ai_quota(
  p_user_id uuid,
  p_limit integer,
  p_units integer DEFAULT 1,
  p_weekly_cap_usd numeric DEFAULT NULL,
  p_quota_key text DEFAULT 'ai'
)
RETURNS TABLE (allowed boolean, current_count integer, denied_by text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_key text := nullif(trim(p_quota_key), '');
  v_current_count integer;
  v_week_start timestamptz := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_week_spend numeric;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_limit IS NULL OR p_limit < 1
    OR v_quota_key IS NULL OR p_units IS NULL OR p_units < 1 OR p_weekly_cap_usd < 0 THEN
    RAISE EXCEPTION 'quota reservation is restricted to trusted server code';
  END IF;

  SELECT request_count INTO v_current_count
  FROM public.daily_usage_counters
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key;

  IF p_weekly_cap_usd IS NOT NULL THEN
    SELECT COALESCE(sum(cap_cost_usd), 0) INTO v_week_spend
    FROM public.ai_requests
    WHERE user_id = p_user_id
      AND created_at >= v_week_start;

    IF v_week_spend >= p_weekly_cap_usd THEN
      RETURN QUERY SELECT false, COALESCE(v_current_count, 0), 'weekly'::text;
      RETURN;
    END IF;
  END IF;

  -- The insert path below has no limit guard, so refuse a request that could
  -- never fit before touching the counter.
  IF p_units > p_limit THEN
    RETURN QUERY SELECT false, COALESCE(v_current_count, 0), 'daily'::text;
    RETURN;
  END IF;

  INSERT INTO public.daily_usage_counters (user_id, usage_date, quota_key, request_count)
  VALUES (p_user_id, CURRENT_DATE, v_quota_key, p_units)
  ON CONFLICT (user_id, usage_date, quota_key) DO UPDATE
    SET request_count = public.daily_usage_counters.request_count + p_units
    WHERE public.daily_usage_counters.request_count + p_units <= p_limit
  RETURNING request_count INTO v_current_count;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_current_count, NULL::text;
    RETURN;
  END IF;

  SELECT request_count INTO v_current_count
  FROM public.daily_usage_counters
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key;

  RETURN QUERY SELECT false, COALESCE(v_current_count, 0), 'daily'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, integer, integer, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer, integer, numeric, text)
  TO service_role;
