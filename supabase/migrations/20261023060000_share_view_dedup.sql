-- SC-04: get_shared_item counted every call, so reloading a share link
-- inflated its view count. Count each viewer at most once per share per UTC
-- day instead. The share page and the function's signature and result stay
-- the same. The number shown on the share page now means distinct viewers
-- per day, not page loads.
--
-- A viewer is the signed-in user, otherwise the client IP the API gateway
-- forwards. The stored key is a SHA-256 of share, day and viewer. It keeps
-- raw IPs out of the table, but it is not anonymous: with no secret in it,
-- an IPv4 address can be recovered by trying every address. Only server
-- roles can read the table, and each counted view deletes up to 500 rows
-- from earlier days. This stops reload inflation; it is not abuse
-- protection: a client that varies its IP still counts again, and viewers
-- behind one NAT address count once.

CREATE TABLE public.share_views (
  share_id uuid NOT NULL REFERENCES public.shared_items(id) ON DELETE CASCADE,
  viewed_on date NOT NULL,
  viewer_key bytea NOT NULL,
  PRIMARY KEY (share_id, viewed_on, viewer_key)
);
CREATE INDEX share_views_viewed_on_idx ON public.share_views (viewed_on);
ALTER TABLE public.share_views ENABLE ROW LEVEL SECURITY;
-- Only get_shared_item (SECURITY DEFINER) touches this table.
REVOKE ALL ON TABLE public.share_views FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_item(p_share_code text)
RETURNS TABLE (id uuid, share_code text, item_type text, item_data jsonb, title text, created_at timestamptz, view_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_item public.shared_items%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_headers jsonb;
  v_viewer text;
BEGIN
  SELECT * INTO v_item FROM public.shared_items AS s
  WHERE s.share_code = p_share_code
    AND (s.expires_at IS NULL OR s.expires_at > now());
  IF NOT FOUND THEN RETURN; END IF;

  v_viewer := 'user:' || (SELECT auth.uid())::text;
  IF v_viewer IS NULL THEN
    -- PostgREST sets request.headers; it is unset for direct SQL callers,
    -- which then share one 'unknown' viewer per share per day.
    BEGIN
      v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    EXCEPTION WHEN others THEN
      v_headers := NULL;
    END;
    -- On hosted Supabase, Cloudflare sets cf-connecting-ip and overwrites any
    -- client value; the first x-forwarded-for entry is the fallback.
    v_viewer := 'ip:' || coalesce(
      nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
      nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
      nullif(btrim(v_headers ->> 'x-real-ip'), ''),
      'unknown'
    );
  END IF;

  INSERT INTO public.share_views (share_id, viewed_on, viewer_key)
  VALUES (
    v_item.id,
    v_today,
    sha256(convert_to(v_item.id::text || ':' || to_char(v_today, 'YYYY-MM-DD') || ':' || v_viewer, 'UTF8'))
  )
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    UPDATE public.shared_items AS s
    SET view_count = s.view_count + 1
    WHERE s.id = v_item.id
    RETURNING s.view_count INTO v_item.view_count;
    -- Bounded, so a busy day never makes one viewer's request slow; the
    -- next counted views delete the rest.
    DELETE FROM public.share_views AS v
    WHERE v.ctid = ANY (ARRAY(
      SELECT o.ctid FROM public.share_views AS o WHERE o.viewed_on < v_today LIMIT 500
    ));
  END IF;

  RETURN QUERY SELECT v_item.id, v_item.share_code, v_item.item_type,
    v_item.item_data, v_item.title, v_item.created_at, v_item.view_count;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shared_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_item(text) TO anon, authenticated;
