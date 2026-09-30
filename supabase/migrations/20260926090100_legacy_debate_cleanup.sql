-- One-time purge of legacy material that predates Current Debate and had no
-- activity in the 30 days before it shipped. This migration only defines the
-- function; it does not run it. Adam chose on 2026-09-30 to keep production's
-- legacy material, so any purge is a separate, explicitly authorized call:
--
--   SELECT private.purge_legacy_debate_material(
--     (SELECT started_at FROM private.current_debate_rollout)
--   );
--
-- Until then, legacy material stays, without a debate, in the Unsorted view.
-- Only rows with no debate that were created before the rollout are
-- candidates, so neither debate work nor later one-off work can be removed,
-- however late it runs. Activity is the latest edit where a table records one
-- (flowcharts, sparring sessions) and the latest message for chats. Chat
-- messages and source files go with their parents through ON DELETE CASCADE;
-- evidence cards keep a null source.

CREATE FUNCTION private.purge_legacy_debate_material(p_rollout timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_cutoff timestamptz := p_rollout - interval '30 days';
BEGIN
  DELETE FROM public.cases WHERE debate_id IS NULL AND created_at < v_cutoff;
  DELETE FROM public.attacks WHERE debate_id IS NULL AND created_at < v_cutoff;
  DELETE FROM public.brainstorms WHERE debate_id IS NULL AND created_at < v_cutoff;
  DELETE FROM public.factoids WHERE debate_id IS NULL AND created_at < v_cutoff;
  DELETE FROM public.flowcharts
  WHERE debate_id IS NULL AND created_at < v_cutoff AND updated_at < v_cutoff;
  DELETE FROM public.sparring_sessions
  WHERE debate_id IS NULL AND created_at < v_cutoff AND updated_at < v_cutoff;
  DELETE FROM public.chats AS chat
  WHERE chat.debate_id IS NULL
    AND chat.created_at < v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.messages AS message
      WHERE message.chat_id = chat.id AND message.created_at >= v_cutoff
    );
  DELETE FROM public.sources WHERE debate_id IS NULL AND created_at < v_cutoff;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_legacy_debate_material(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
