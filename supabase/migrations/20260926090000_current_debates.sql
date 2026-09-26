-- Personal Current Debate: one motion that the signed-in user prepares across
-- every tool. Results and sources carry the debate they belong to; rows without
-- a debate are one-off work or legacy material awaiting confirmation.

CREATE TABLE public.debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motion text NOT NULL CHECK (char_length(btrim(motion)) BETWEEN 1 AND 1200),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 4000),
  instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 2000),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Child tables reference (user_id, id) so a row can only join its owner's debate.
  CONSTRAINT debates_user_id_id_key UNIQUE (user_id, id)
);

CREATE INDEX debates_user_activity_idx ON public.debates (user_id, last_activity_at DESC);

ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY debates_own ON public.debates
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE TABLE public.current_debates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT current_debates_debate_fkey FOREIGN KEY (user_id, debate_id)
    REFERENCES public.debates (user_id, id) ON DELETE CASCADE
);

CREATE INDEX current_debates_user_debate_idx ON public.current_debates (user_id, debate_id);

ALTER TABLE public.current_debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY current_debates_own ON public.current_debates
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Crossfire previously lived only in the browser; completed rounds now persist
-- beside the other tool results.
CREATE TABLE public.crossfires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  input jsonb NOT NULL,
  output jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crossfires ENABLE ROW LEVEL SECURITY;
CREATE POLICY crossfires_own ON public.crossfires
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cases', 'attacks', 'brainstorms', 'factoids', 'chats',
    'flowcharts', 'sparring_sessions', 'crossfires', 'sources'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN debate_id uuid', v_table);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id, debate_id) REFERENCES public.debates (user_id, id) ON DELETE CASCADE',
      v_table, v_table || '_debate_fkey'
    );
    EXECUTE format(
      'CREATE INDEX %I ON public.%I (user_id, debate_id, created_at DESC)',
      v_table || '_user_debate_idx', v_table
    );
    IF v_table <> 'sources' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN side text CHECK (side IN (''pro'', ''con'', ''both'', ''neutral''))',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

-- Every new source belongs to exactly one debate. Legacy rows may stay unsorted
-- until the user attaches them, but an attached source cannot be detached.
CREATE FUNCTION private.require_source_debate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.debate_id IS NULL AND (TG_OP = 'INSERT' OR OLD.debate_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a source must belong to a debate' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_source_debate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sources_require_debate
  BEFORE INSERT OR UPDATE OF debate_id ON public.sources
  FOR EACH ROW EXECUTE FUNCTION private.require_source_debate();

-- Meaningful work (a new result, source, or chat message in a debate) resets
-- the inactivity clock that drives the five-day check-in.
CREATE FUNCTION private.touch_debate_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_debate_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'messages' THEN
    SELECT debate_id INTO v_debate_id FROM public.chats WHERE id = NEW.chat_id;
  ELSIF TG_OP = 'INSERT' OR NEW.debate_id IS DISTINCT FROM OLD.debate_id THEN
    v_debate_id := NEW.debate_id;
  END IF;
  IF v_debate_id IS NOT NULL THEN
    UPDATE public.debates SET last_activity_at = now() WHERE id = v_debate_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_debate_activity() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cases', 'attacks', 'brainstorms', 'factoids', 'chats',
    'flowcharts', 'sparring_sessions', 'crossfires', 'sources'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF debate_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.touch_debate_activity()',
      v_table || '_touch_debate', v_table
    );
  END LOOP;
END;
$$;

CREATE TRIGGER messages_touch_debate
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.touch_debate_activity();

-- Attaches one-off or legacy work to one of the caller's debates. Sparring rows
-- are written only by the server, so the client cannot update them directly.
CREATE FUNCTION public.attach_to_debate(p_kind text, p_id uuid, p_debate_id uuid, p_side text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_side IS NOT NULL AND p_side NOT IN ('pro', 'con', 'both', 'neutral') THEN
    RAISE EXCEPTION 'invalid side' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.debates WHERE id = p_debate_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'debate not found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_kind
    WHEN 'case' THEN
      UPDATE public.cases SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'attack' THEN
      UPDATE public.attacks SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'brainstorm' THEN
      UPDATE public.brainstorms SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'factoids' THEN
      UPDATE public.factoids SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'chat' THEN
      UPDATE public.chats SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'flowchart' THEN
      UPDATE public.flowcharts SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'sparring' THEN
      UPDATE public.sparring_sessions SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'crossfire' THEN
      UPDATE public.crossfires SET debate_id = p_debate_id, side = COALESCE(p_side, side)
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    WHEN 'source' THEN
      UPDATE public.sources SET debate_id = p_debate_id
      WHERE id = p_id AND user_id = v_user_id AND debate_id IS NULL;
    ELSE
      RAISE EXCEPTION 'unknown item kind' USING ERRCODE = '22023';
  END CASE;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'item not found or already in a debate' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_to_debate(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_to_debate(text, uuid, uuid, text) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.debates, public.current_debates, public.crossfires
  TO authenticated, service_role;

-- Account erase also removes debates and persisted Crossfire rounds.
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
END;
$$;

REVOKE ALL ON FUNCTION public.clear_current_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_current_user_data() TO authenticated;
