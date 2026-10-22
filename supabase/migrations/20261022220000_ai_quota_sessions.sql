-- Charge Crossfire and Sparring once per session instead of once per AI call.
--
-- Additive only. consume_ai_quota (20261022130001_weighted_quota_weekly_budget.sql)
-- and refund_daily_quota (20261022170000_refund_daily_quota.sql) are unchanged;
-- every other AI feature keeps calling them per request.
--
-- A session is one Crossfire round (opening turn, every answer, the debrief)
-- or one Sparring round (every opponent reply and the judge). Its first call
-- reserves the model's quota units through consume_ai_quota; later calls in the
-- same session pass for free. Three things make a session charge again, so a
-- reused session key can never buy unlimited AI:
--   * it has made p_max_calls calls since it was charged,
--   * it is older than p_ttl_seconds since it was charged,
--   * the request needs more units than the session paid for (a heavier model).
-- The caps and lifetimes live in supabase/functions/_shared/usage-limits.ts.
CREATE TABLE IF NOT EXISTS public.ai_quota_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('crossfire', 'sparring')),
  session_key text NOT NULL CHECK (char_length(session_key) BETWEEN 1 AND 128),
  quota_key text NOT NULL DEFAULT 'ai',
  charged boolean NOT NULL DEFAULT false,
  units integer NOT NULL DEFAULT 0 CHECK (units >= 0),
  -- The day the units were reserved, so a refund after midnight UTC gives
  -- them back to the day that paid.
  usage_date date,
  calls_used integer NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  -- Counts the session's charges. A refund names the charge it gives back,
  -- so a failed call can never refund a later charge made by another call.
  charge_id integer NOT NULL DEFAULT 0 CHECK (charge_id >= 0),
  charged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, session_key)
);

COMMENT ON TABLE public.ai_quota_sessions IS
  'Server-only ledger of per-session AI quota charges for Crossfire and Sparring. Written by claim_ai_session_quota and refund_ai_session_quota.';

ALTER TABLE public.ai_quota_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_quota_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_quota_sessions TO service_role;

-- charged: this call reserved units (refund_ai_session_quota may give them back).
-- units: the units reserved by this call, 0 when the session had already paid.
-- charge_id: names this call's charge for refund_ai_session_quota; 0 when it did not charge.
-- denied_by: 'daily' or 'weekly' when refused, NULL when allowed.
CREATE FUNCTION public.claim_ai_session_quota(
  p_user_id uuid,
  p_feature text,
  p_session_key text,
  p_limit integer,
  p_units integer,
  p_weekly_cap_usd numeric,
  p_max_calls integer,
  p_ttl_seconds integer,
  p_quota_key text DEFAULT 'ai'
)
RETURNS TABLE (allowed boolean, charged boolean, units integer, current_count integer, denied_by text, charge_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_key text := nullif(trim(p_quota_key), '');
  v_session public.ai_quota_sessions%ROWTYPE;
  v_reserved record;
  v_current_count integer;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR v_quota_key IS NULL
    OR p_feature IS NULL OR p_session_key IS NULL
    OR p_units IS NULL OR p_units < 1 OR p_max_calls IS NULL OR p_max_calls < 1
    OR p_ttl_seconds IS NULL OR p_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'session quota is restricted to trusted server code';
  END IF;

  INSERT INTO public.ai_quota_sessions (user_id, feature, session_key, quota_key)
  VALUES (p_user_id, p_feature, p_session_key, v_quota_key)
  ON CONFLICT (user_id, feature, session_key) DO NOTHING;

  -- Two calls racing on a new session queue here, so only one of them pays.
  SELECT * INTO v_session
  FROM public.ai_quota_sessions s
  WHERE s.user_id = p_user_id AND s.feature = p_feature AND s.session_key = p_session_key
  FOR UPDATE;

  IF v_session.charged
    AND v_session.quota_key = v_quota_key
    AND v_session.calls_used < p_max_calls
    AND v_session.charged_at > now() - make_interval(secs => p_ttl_seconds)
    AND v_session.units >= p_units THEN
    UPDATE public.ai_quota_sessions s
    SET calls_used = s.calls_used + 1, updated_at = now()
    WHERE s.user_id = p_user_id AND s.feature = p_feature AND s.session_key = p_session_key;

    SELECT c.request_count INTO v_current_count
    FROM public.daily_usage_counters c
    WHERE c.user_id = p_user_id AND c.usage_date = CURRENT_DATE AND c.quota_key = v_quota_key;

    RETURN QUERY SELECT true, false, 0, COALESCE(v_current_count, 0), NULL::text, 0;
    RETURN;
  END IF;

  SELECT * INTO v_reserved
  FROM public.consume_ai_quota(p_user_id, p_limit, p_units, p_weekly_cap_usd, v_quota_key);

  IF NOT v_reserved.allowed THEN
    RETURN QUERY SELECT false, false, p_units, v_reserved.current_count, v_reserved.denied_by, 0;
    RETURN;
  END IF;

  UPDATE public.ai_quota_sessions s
  SET charged = true,
      units = p_units,
      quota_key = v_quota_key,
      usage_date = CURRENT_DATE,
      calls_used = 1,
      charge_id = v_session.charge_id + 1,
      charged_at = now(),
      updated_at = now()
  WHERE s.user_id = p_user_id AND s.feature = p_feature AND s.session_key = p_session_key;

  RETURN QUERY SELECT true, true, p_units, v_reserved.current_count, NULL::text, v_session.charge_id + 1;
END;
$$;

-- Gives back the units a session's charging call reserved, when that call
-- produced nothing. p_charge_id is the charge_id claim_ai_session_quota
-- returned to that call. Refuses (returns 0) when the session has been charged
-- again since, or when any other call has run on the charge, because that call
-- may have delivered output. The session is left unpaid, so its next call
-- charges again.
CREATE FUNCTION public.refund_ai_session_quota(
  p_user_id uuid,
  p_feature text,
  p_session_key text,
  p_charge_id integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.ai_quota_sessions%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_feature IS NULL OR p_session_key IS NULL
    OR p_charge_id IS NULL OR p_charge_id < 1 THEN
    RAISE EXCEPTION 'session quota refunds are restricted to trusted server code';
  END IF;

  SELECT * INTO v_session
  FROM public.ai_quota_sessions s
  WHERE s.user_id = p_user_id AND s.feature = p_feature AND s.session_key = p_session_key
  FOR UPDATE;

  IF NOT FOUND OR NOT v_session.charged OR v_session.charge_id <> p_charge_id
    OR v_session.calls_used <> 1 OR v_session.units < 1 THEN
    RETURN 0;
  END IF;

  UPDATE public.daily_usage_counters c
  SET request_count = GREATEST(c.request_count - v_session.units, 0)
  WHERE c.user_id = p_user_id
    AND c.usage_date = v_session.usage_date
    AND c.quota_key = v_session.quota_key;

  UPDATE public.ai_quota_sessions s
  SET charged = false, units = 0, calls_used = 0, charged_at = NULL, usage_date = NULL, updated_at = now()
  WHERE s.user_id = p_user_id AND s.feature = p_feature AND s.session_key = p_session_key;

  RETURN v_session.units;
END;
$$;

-- Read-only view of today's AI quota for the "uses 1 AI use; you have N left"
-- line before a session starts. Reserves nothing.
CREATE FUNCTION public.peek_ai_quota(
  p_user_id uuid,
  p_quota_key text DEFAULT 'ai'
)
RETURNS TABLE (current_count integer, week_spend_usd numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start timestamptz := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'quota reads are restricted to trusted server code';
  END IF;

  RETURN QUERY SELECT
    COALESCE((
      SELECT c.request_count FROM public.daily_usage_counters c
      WHERE c.user_id = p_user_id AND c.usage_date = CURRENT_DATE AND c.quota_key = p_quota_key
    ), 0),
    COALESCE((
      SELECT sum(r.cap_cost_usd) FROM public.ai_requests r
      WHERE r.user_id = p_user_id AND r.created_at >= v_week_start
    ), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_session_quota(uuid, text, text, integer, integer, numeric, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_session_quota(uuid, text, text, integer, integer, numeric, integer, integer, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.refund_ai_session_quota(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_session_quota(uuid, text, text, integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.peek_ai_quota(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_ai_quota(uuid, text)
  TO service_role;

-- The signed-in user's own AI units used today, as consume_ai_quota counts
-- them. The Settings usage line reads it: counting ai_requests rows
-- overstates usage now that a Crossfire or Sparring round logs a row per call
-- but is charged once, and a refunded run still logs its row.
CREATE FUNCTION public.ai_usage_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT c.request_count FROM public.daily_usage_counters c
    WHERE c.user_id = auth.uid() AND c.usage_date = CURRENT_DATE AND c.quota_key = 'ai'
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.ai_usage_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage_today() TO authenticated, service_role;
