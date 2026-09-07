-- Demo codes are only reachable through the authenticated admin function and
-- the service-role demo login function. Keep both tables closed to the Data API.
REVOKE ALL ON TABLE public.demo_access_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_access_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.demo_access_codes TO service_role;
GRANT ALL ON TABLE public.demo_access_attempts TO service_role;

-- PostgreSQL resolves RETURNS TABLE columns as variables. Qualify the CTE
-- column so the reservation RPC works on current local and hosted versions.
CREATE OR REPLACE FUNCTION public.consume_demo_access_code(p_code_id uuid)
RETURNS TABLE(reserved boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH consumed AS (
    UPDATE public.demo_access_codes
       SET use_count = use_count + 1,
           last_used_at = now()
     WHERE id = p_code_id
       AND disabled_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_uses IS NULL OR use_count < max_uses)
     RETURNING true AS reserved
  )
  SELECT consumed.reserved FROM consumed
  UNION ALL
  SELECT false WHERE NOT EXISTS (SELECT 1 FROM consumed);
END;
$$;

-- Keep the atomic login reservation private to the service role.
REVOKE ALL ON FUNCTION public.consume_demo_access_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_demo_access_code(uuid) TO service_role;
