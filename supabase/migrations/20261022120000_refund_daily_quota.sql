-- Give back a reserved daily request when the provider could not serve it.
-- Edge Functions call this only after a Claude call failed on the Anthropic
-- key, so the student is not charged for an answer they never got. It only
-- lowers today's existing counter and never below zero.
CREATE FUNCTION public.refund_daily_quota(
  p_user_id uuid,
  p_quota_key text DEFAULT 'ai'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_key text := nullif(trim(p_quota_key), '');
  v_current_count integer;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR v_quota_key IS NULL THEN
    RAISE EXCEPTION 'quota refunds are restricted to trusted server code';
  END IF;

  UPDATE public.daily_usage_counters
  SET request_count = request_count - 1
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key
    AND request_count > 0
  RETURNING request_count INTO v_current_count;

  IF FOUND THEN
    RETURN v_current_count;
  END IF;

  SELECT request_count INTO v_current_count
  FROM public.daily_usage_counters
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND quota_key = v_quota_key;

  RETURN COALESCE(v_current_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_daily_quota(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_daily_quota(uuid, text)
  TO service_role;
