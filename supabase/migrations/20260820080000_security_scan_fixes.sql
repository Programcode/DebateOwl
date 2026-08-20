-- Security scan remediation: keep authorization checks fail-closed in the
-- edge functions and make demo-code consumption a single atomic operation.

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
  SELECT reserved FROM consumed
  UNION ALL
  SELECT false WHERE NOT EXISTS (SELECT 1 FROM consumed);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_demo_access_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_demo_access_code(uuid) TO service_role;
