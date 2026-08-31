-- Complete the existing production-reconciled sparring table for the shipped
-- client contract. Existing rows keep their current JSON payloads and gain
-- explicit format/difficulty metadata with safe defaults.
ALTER TABLE public.sparring_sessions
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sparring_sessions_format_check'
      AND conrelid = 'public.sparring_sessions'::regclass
  ) THEN
    ALTER TABLE public.sparring_sessions
      ADD CONSTRAINT sparring_sessions_format_check
      CHECK (format = ANY (ARRAY['standard'::text, 'ld'::text, 'pf'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sparring_sessions_difficulty_check'
      AND conrelid = 'public.sparring_sessions'::regclass
  ) THEN
    ALTER TABLE public.sparring_sessions
      ADD CONSTRAINT sparring_sessions_difficulty_check
      CHECK (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]));
  END IF;
END
$$;

-- Final scores are presented as AI-judged feedback. Keep completion writes on
-- the authenticated Edge Function so clients cannot forge an evaluation.
DROP POLICY IF EXISTS "Users own sessions" ON public.sparring_sessions;
DROP POLICY IF EXISTS "sparring_sessions_select_own" ON public.sparring_sessions;
DROP POLICY IF EXISTS "sparring_sessions_delete_own" ON public.sparring_sessions;
CREATE POLICY "sparring_sessions_select_own" ON public.sparring_sessions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "sparring_sessions_delete_own" ON public.sparring_sessions
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.sparring_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.sparring_sessions TO authenticated;
GRANT ALL ON TABLE public.sparring_sessions TO service_role;

-- A per-user erase fence serializes score claims against Settings > Delete all
-- data. Requests that began before the latest erase cannot recreate a row
-- after the erase commits.
CREATE TABLE IF NOT EXISTS public.user_data_clear_markers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL
);
ALTER TABLE public.user_data_clear_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_data_clear_markers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_data_clear_markers TO service_role;

-- Capture the score-request fence on the database clock before the claim. The
-- later comparison with cleared_at therefore never depends on edge-host time.
CREATE OR REPLACE FUNCTION public.sparring_request_started_at()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.sparring_request_started_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sparring_request_started_at() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_sparring_score_session(
  p_payload jsonb,
  p_request_started_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := (p_payload->>'user_id')::uuid;
  v_session_id uuid := (p_payload->>'id')::uuid;
  v_claim_token uuid := (p_payload->>'claim_token')::uuid;
  v_cleared_at timestamptz;
  v_existing public.sparring_sessions%ROWTYPE;
  v_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  SELECT cleared_at INTO v_cleared_at
  FROM public.user_data_clear_markers
  WHERE user_id = v_user_id;
  IF v_cleared_at IS NOT NULL AND p_request_started_at <= v_cleared_at THEN
    RETURN jsonb_build_object('status', 'cleared');
  END IF;

  INSERT INTO public.sparring_sessions (
    id, user_id, motion, user_side, format, difficulty, persona, turns,
    judge_comments, final_evaluation, status, claim_token, created_at, updated_at
  ) VALUES (
    v_session_id, v_user_id, p_payload->>'motion', p_payload->>'user_side',
    p_payload->>'format', p_payload->>'difficulty', p_payload->>'persona',
    COALESCE(p_payload->'turns', '[]'::jsonb), '[]'::jsonb, NULL,
    'in_progress', v_claim_token, now(), now()
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    RETURN jsonb_build_object('status', 'claimed', 'token', v_claim_token);
  END IF;

  SELECT * INTO v_existing FROM public.sparring_sessions WHERE id = v_session_id;
  IF v_existing.user_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF v_existing.status = 'complete' THEN
    RETURN jsonb_build_object('status', 'complete', 'scorecard', v_existing.final_evaluation);
  END IF;

  IF v_existing.status = 'in_progress' AND v_existing.updated_at <= now() - interval '5 minutes' THEN
    UPDATE public.sparring_sessions SET
      motion = p_payload->>'motion',
      user_side = p_payload->>'user_side',
      format = p_payload->>'format',
      difficulty = p_payload->>'difficulty',
      persona = p_payload->>'persona',
      turns = COALESCE(p_payload->'turns', '[]'::jsonb),
      final_evaluation = NULL,
      status = 'in_progress',
      claim_token = v_claim_token,
      updated_at = now()
    WHERE id = v_session_id
      AND user_id = v_user_id
      AND status = 'in_progress'
      AND updated_at = v_existing.updated_at;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      RETURN jsonb_build_object('status', 'claimed', 'token', v_claim_token);
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sparring_score_session(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sparring_score_session(jsonb, timestamptz) TO service_role;

-- Keep Settings > Delete all data truthful for sparring history too.
CREATE OR REPLACE FUNCTION public.clear_current_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  INSERT INTO public.user_data_clear_markers (user_id, cleared_at)
  VALUES (v_user_id, clock_timestamp())
  ON CONFLICT (user_id) DO UPDATE SET cleared_at = EXCLUDED.cleared_at;

  DELETE FROM public.cases WHERE user_id = v_user_id;
  DELETE FROM public.attacks WHERE user_id = v_user_id;
  DELETE FROM public.brainstorms WHERE user_id = v_user_id;
  DELETE FROM public.factoids WHERE user_id = v_user_id;
  DELETE FROM public.chats WHERE user_id = v_user_id;
  DELETE FROM public.flowcharts WHERE user_id = v_user_id;
  DELETE FROM public.sparring_sessions WHERE user_id = v_user_id;
  DELETE FROM public.evidence_cards WHERE user_id = v_user_id;
  DELETE FROM public.sources WHERE user_id = v_user_id;
  DELETE FROM public.source_folders WHERE user_id = v_user_id;
  DELETE FROM public.api_keys WHERE user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_current_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_current_user_data() TO authenticated;
