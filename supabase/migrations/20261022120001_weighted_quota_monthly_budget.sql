-- Weight the daily AI quota by model cost and add a monthly AI spend cap.
--
-- p_units: how many quota units this request reserves (an expensive model
--   counts as several requests). Defaults to 1 so existing callers (import,
--   share, voice, crossfire signals) keep their behaviour.
-- p_monthly_cap_usd: when set, refuse the reservation once the user's logged
--   ai_requests.cost_usd for the current UTC month reaches the cap. NULL skips
--   the check. Rows with unknown pricing (cost_usd IS NULL) are not counted,
--   and cost is logged after the provider call, so the cap is soft by about
--   one request.
--
-- denied_by reports which limit refused the call: 'daily' or 'monthly'.
-- The weights and the cap live in supabase/functions/_shared/usage-limits.ts.
-- The month's spend is read through idx_ai_requests_user_created
-- (20261022120000_index_ai_requests_user_created.sql).

-- New parameters and a new result column change the signature, so remove the
-- old overload first and keep exactly one. Only service-role Edge Functions
-- call it, by named arguments, and the new parameters have defaults, so calls
-- from the previous function build still resolve to the replacement.
-- squawk-ignore ban-drop-function
DROP FUNCTION public.consume_daily_quota(uuid, integer, text);

CREATE FUNCTION public.consume_daily_quota(
  p_user_id uuid,
  p_limit integer,
  p_quota_key text DEFAULT 'ai',
  p_units integer DEFAULT 1,
  p_monthly_cap_usd numeric DEFAULT NULL
)
RETURNS TABLE (allowed boolean, current_count integer, denied_by text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_key text := nullif(trim(p_quota_key), '');
  v_current_count integer;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_spend numeric;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_limit < 1 OR v_quota_key IS NULL
    OR p_units IS NULL OR p_units < 1 OR p_monthly_cap_usd < 0 THEN
    RAISE EXCEPTION 'quota reservation is restricted to trusted server code';
  END IF;

  SELECT request_count INTO v_current_count
  FROM public.daily_usage_counters
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key;

  IF p_monthly_cap_usd IS NOT NULL THEN
    SELECT COALESCE(sum(cost_usd), 0) INTO v_month_spend
    FROM public.ai_requests
    WHERE user_id = p_user_id
      AND created_at >= v_month_start;

    IF v_month_spend >= p_monthly_cap_usd THEN
      RETURN QUERY SELECT false, COALESCE(v_current_count, 0), 'monthly'::text;
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

REVOKE ALL ON FUNCTION public.consume_daily_quota(uuid, integer, text, integer, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_quota(uuid, integer, text, integer, numeric)
  TO service_role;
