-- Opt-in public pages for /ai-debate mini rounds (supabase/functions/demo-rebuttal).
--
-- A visitor who finishes a mini round can publish it at /ai-debate/round/<slug>.
-- Nothing is stored unless they do. The function verifies that every turn is
-- one it signed (so the text is what the visitor typed and the model answered,
-- after moderation), removes personal details, decides whether the round is
-- substantial enough to index, and writes the row through
-- publish_demo_round. The row holds the redacted text, no IP hash and no
-- account. The visitor gets a delete token; only its SHA-256 is kept.
--
-- Clients never touch the table. Anyone may read a published round through
-- get_published_demo_round and list the indexable ones through
-- list_published_demo_rounds, which return the public columns only.

CREATE TABLE public.published_demo_rounds (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]{12}$'),
  -- The demo session it came from: one page per round. The session row itself
  -- is deleted after a day, so this is not a foreign key.
  session_id uuid NOT NULL UNIQUE,
  motion text NOT NULL CHECK (char_length(motion) BETWEEN 1 AND 200),
  side text NOT NULL CHECK (side IN ('for', 'against')),
  -- [{argument, rebuttal, judgeNote}], one or two turns.
  turns jsonb NOT NULL CHECK (jsonb_typeof(turns) = 'array' AND jsonb_array_length(turns) BETWEEN 1 AND 2),
  indexable boolean NOT NULL,
  delete_token_hash text NOT NULL CHECK (delete_token_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX published_demo_rounds_indexable_idx
  ON public.published_demo_rounds (published_at DESC) WHERE indexable;

ALTER TABLE public.published_demo_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.published_demo_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.published_demo_rounds TO service_role;

/**
 * Stores a published round. Returns (status, indexable, slug): status 'ok', or
 * 'already_published' with the stored round's indexable and slug, so a retried
 * publish learns its page. A round the function judged
 * indexable stays noindex when an indexable round on the same motion and side
 * already exists, so a preset motion does not fill the index with near-copies.
 */
CREATE FUNCTION public.publish_demo_round(
  p_slug text,
  p_session_id uuid,
  p_motion text,
  p_side text,
  p_turns jsonb,
  p_indexable boolean,
  p_delete_token_hash text
)
RETURNS TABLE (status text, indexable boolean, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_indexable boolean := p_indexable;
BEGIN
  -- Two publishes of the same motion and side at once must not both index.
  PERFORM pg_advisory_xact_lock(hashtextextended('published_demo_round:' || lower(btrim(p_motion)) || ':' || p_side, 0));
  IF v_indexable AND EXISTS (
    SELECT 1 FROM public.published_demo_rounds r
    WHERE r.indexable AND r.side = p_side AND lower(btrim(r.motion)) = lower(btrim(p_motion))
  ) THEN
    v_indexable := false;
  END IF;

  INSERT INTO public.published_demo_rounds (slug, session_id, motion, side, turns, indexable, delete_token_hash)
  VALUES (p_slug, p_session_id, p_motion, p_side, p_turns, v_indexable, p_delete_token_hash)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'already_published'::text, r.indexable, r.slug
      FROM public.published_demo_rounds r WHERE r.session_id = p_session_id;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_indexable, p_slug;
END;
$$;

/** Deletes a published round when the token's hash matches. True when a row went. */
CREATE FUNCTION public.unpublish_demo_round(p_slug text, p_delete_token_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH removed AS (
    DELETE FROM public.published_demo_rounds
    WHERE slug = p_slug AND delete_token_hash = p_delete_token_hash
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed);
$$;

/** One published round's public columns, or no row. */
CREATE FUNCTION public.get_published_demo_round(p_slug text)
RETURNS TABLE (slug text, motion text, side text, turns jsonb, indexable boolean, published_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.slug, r.motion, r.side, r.turns, r.indexable, r.published_at
  FROM public.published_demo_rounds r
  WHERE r.slug = p_slug;
$$;

/** The newest indexable rounds, at most 1000: the build prerenders and lists these. */
CREATE FUNCTION public.list_published_demo_rounds(p_limit integer)
RETURNS TABLE (slug text, motion text, side text, turns jsonb, indexable boolean, published_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.slug, r.motion, r.side, r.turns, r.indexable, r.published_at
  FROM public.published_demo_rounds r
  WHERE r.indexable
  ORDER BY r.published_at DESC, r.slug
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000);
$$;

REVOKE ALL ON FUNCTION public.publish_demo_round(text, uuid, text, text, jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpublish_demo_round(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_published_demo_round(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_published_demo_rounds(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_demo_round(text, uuid, text, text, jsonb, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_demo_round(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_published_demo_round(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_published_demo_rounds(integer) TO anon, authenticated, service_role;
