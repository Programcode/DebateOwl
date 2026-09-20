-- Keep independently configured daily quotas in separate atomic counters.
ALTER TABLE public.daily_usage_counters
  ADD COLUMN quota_key text NOT NULL DEFAULT 'ai';

ALTER TABLE public.daily_usage_counters
  DROP CONSTRAINT daily_usage_counters_pkey;

ALTER TABLE public.daily_usage_counters
  ADD CONSTRAINT daily_usage_counters_pkey
  PRIMARY KEY (user_id, usage_date, quota_key);

-- The new defaulted parameter changes the PostgreSQL function signature, so
-- remove the old overload before creating its replacement.
DROP FUNCTION public.consume_daily_quota(uuid, integer);

CREATE FUNCTION public.consume_daily_quota(
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
  v_current_count integer;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_limit < 1 OR v_quota_key IS NULL THEN
    RAISE EXCEPTION 'quota reservation is restricted to trusted server code';
  END IF;

  INSERT INTO public.daily_usage_counters (user_id, usage_date, quota_key, request_count)
  VALUES (p_user_id, CURRENT_DATE, v_quota_key, 1)
  ON CONFLICT (user_id, usage_date, quota_key) DO UPDATE
    SET request_count = public.daily_usage_counters.request_count + 1
    WHERE public.daily_usage_counters.request_count < p_limit
  RETURNING request_count INTO v_current_count;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_current_count;
    RETURN;
  END IF;

  SELECT request_count INTO v_current_count
  FROM public.daily_usage_counters
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key;

  RETURN QUERY SELECT false, COALESCE(v_current_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_quota(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_quota(uuid, integer, text)
  TO service_role;
