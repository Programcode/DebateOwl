-- Atomically record views without granting direct UPDATE access on shared items.
CREATE OR REPLACE FUNCTION public.increment_share_view(p_share_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_items
  SET view_count = view_count + 1
  WHERE id = p_share_id
    AND (expires_at IS NULL OR expires_at > now());
$$;

REVOKE ALL ON FUNCTION public.increment_share_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_share_view(uuid) TO anon, authenticated;
