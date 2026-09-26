-- DESTRUCTIVE, ONE-TIME: remove legacy material that predates Current Debate
-- and is older than 30 days. Recent legacy material stays, without a debate,
-- in the Unsorted view until the user confirms where it belongs.
--
-- The function only touches rows that are not in a debate, so rerunning it can
-- never remove debate work. Nothing schedules it; this migration calls it once.
-- Chat messages and source files are removed by their ON DELETE CASCADE keys.

CREATE FUNCTION private.purge_legacy_debate_material(p_cutoff timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.cases WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.attacks WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.brainstorms WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.factoids WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.chats WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.flowcharts WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.sparring_sessions WHERE debate_id IS NULL AND created_at < p_cutoff;
  DELETE FROM public.sources WHERE debate_id IS NULL AND created_at < p_cutoff;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_legacy_debate_material(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.purge_legacy_debate_material(now() - interval '30 days');
