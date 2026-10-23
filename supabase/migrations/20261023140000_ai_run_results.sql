-- The final answer of a streamed AI run, kept so a browser whose stream
-- dropped can still read it (src/lib/ai/run-recovery.ts).
--
-- Additive only. The ai Edge Function (supabase/functions/ai/stream.ts) writes
-- a row when a streamed run starts (status NULL) and fills in the status and
-- body the stream's `result` event carries before it sends that event. A row
-- left with status NULL long after started_at is a run the worker never
-- finished. A function deployed before this migration finds no table, logs a
-- warning, and streams as before.
--
-- One row per user and feature: the next run of a feature replaces the last,
-- so the table stays bounded without a cleanup job. Only the service role
-- writes it; a signed-in user reads their own rows.
CREATE TABLE IF NOT EXISTS public.ai_run_results (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('generate', 'attack', 'brainstorm', 'factoids', 'ask', 'sparring', 'crossfire')),
  -- The id the browser sent with the run; recovery reads only a matching row.
  result_key text NOT NULL CHECK (result_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  status integer CHECK (status BETWEEN 100 AND 599),
  body jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (user_id, feature)
);

COMMENT ON TABLE public.ai_run_results IS
  'Latest streamed AI run per user and feature, written by the ai Edge Function so a dropped stream can recover its result.';

ALTER TABLE public.ai_run_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_run_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ai_run_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_run_results TO service_role;

CREATE POLICY "ai_run_results_select_own" ON public.ai_run_results
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Account erase also removes kept AI run results. The body is unchanged from
-- 20260926090000_current_debates.sql apart from the ai_run_results line.
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
  DELETE FROM public.crossfires WHERE user_id = v_user_id;
  DELETE FROM public.evidence_cards WHERE user_id = v_user_id;
  DELETE FROM public.sources WHERE user_id = v_user_id;
  DELETE FROM public.source_folders WHERE user_id = v_user_id;
  DELETE FROM public.api_keys WHERE user_id = v_user_id;
  DELETE FROM public.current_debates WHERE user_id = v_user_id;
  DELETE FROM public.debates WHERE user_id = v_user_id;
  DELETE FROM public.ai_run_results WHERE user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_current_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_current_user_data() TO authenticated;
