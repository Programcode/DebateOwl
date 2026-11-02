-- The no-login mini round on /ai-debate (supabase/functions/demo-rebuttal).
--
-- Server-only: the function calls claim_demo_round_turn with the service
-- role. Rows hold counts and a salted, per-day hash of the caller's IP, never
-- the IP itself or anything the visitor typed. Sessions older than yesterday
-- are deleted on every claim.

CREATE TABLE public.demo_round_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL CHECK (char_length(ip_hash) = 64),
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  turns integer NOT NULL DEFAULT 0 CHECK (turns >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demo_round_sessions_ip_day_idx ON public.demo_round_sessions (ip_hash, usage_date);

CREATE TABLE public.demo_round_days (
  usage_date date PRIMARY KEY,
  model_calls integer NOT NULL DEFAULT 0 CHECK (model_calls >= 0)
);

ALTER TABLE public.demo_round_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_round_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_round_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_round_days FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_round_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_round_days TO service_role;

/**
 * Reserves one model call for a demo turn, or says which limit stops it.
 * A NULL p_session_id starts a session. Returns (status, session_id), status
 * one of: ok, ip_limit, turn_limit, unknown_session, daily_limit. Nothing is
 * written unless the status is ok.
 */
CREATE FUNCTION public.claim_demo_round_turn(
  p_session_id uuid,
  p_ip_hash text,
  p_sessions_per_ip integer,
  p_turns_per_session integer,
  p_daily_calls integer
)
RETURNS TABLE (status text, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_session public.demo_round_sessions%ROWTYPE;
  v_reserved integer;
BEGIN
  -- Two first turns from one IP at once must not both see a free slot.
  PERFORM pg_advisory_xact_lock(hashtextextended('demo_round:' || p_ip_hash, 0));
  DELETE FROM public.demo_round_sessions WHERE usage_date < v_today - 1;

  IF p_session_id IS NULL THEN
    IF (SELECT count(*) FROM public.demo_round_sessions s
        WHERE s.ip_hash = p_ip_hash AND s.usage_date = v_today) >= p_sessions_per_ip THEN
      RETURN QUERY SELECT 'ip_limit'::text, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    SELECT * INTO v_session FROM public.demo_round_sessions s
    WHERE s.id = p_session_id AND s.ip_hash = p_ip_hash AND s.usage_date = v_today
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'unknown_session'::text, NULL::uuid;
      RETURN;
    END IF;
    IF v_session.turns >= p_turns_per_session THEN
      RETURN QUERY SELECT 'turn_limit'::text, v_session.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.demo_round_days AS d (usage_date, model_calls)
  VALUES (v_today, 1)
  ON CONFLICT (usage_date) DO UPDATE SET model_calls = d.model_calls + 1
  WHERE d.model_calls < p_daily_calls
  RETURNING d.model_calls INTO v_reserved;
  -- A first insert reserves 1 even when the cap is 0; refuse that too.
  IF v_reserved IS NULL OR v_reserved > p_daily_calls THEN
    IF v_reserved IS NOT NULL THEN
      UPDATE public.demo_round_days SET model_calls = model_calls - 1 WHERE usage_date = v_today;
    END IF;
    RETURN QUERY SELECT 'daily_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.demo_round_sessions (ip_hash, usage_date, turns)
    VALUES (p_ip_hash, v_today, 1)
    RETURNING * INTO v_session;
  ELSE
    UPDATE public.demo_round_sessions SET turns = turns + 1 WHERE id = v_session.id;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_session.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_demo_round_turn(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_round_turn(uuid, text, integer, integer, integer) TO service_role;
