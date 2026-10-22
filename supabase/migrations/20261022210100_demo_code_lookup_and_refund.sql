-- Demo login looks up one Auth user by email and gives a reserved use back
-- when account setup fails after consume_demo_access_code. Both stay
-- service-role only, same as the reservation itself.

CREATE OR REPLACE FUNCTION public.lookup_auth_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text, app_metadata jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR nullif(trim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT users.id, users.email::text, COALESCE(users.raw_app_meta_data, '{}'::jsonb)
  FROM auth.users AS users
  WHERE lower(users.email) = lower(trim(p_email))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_demo_access_code(p_code_id uuid)
RETURNS TABLE(reserved boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_code_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH refunded AS (
    UPDATE public.demo_access_codes
       SET use_count = GREATEST(use_count - 1, 0)
     WHERE id = p_code_id
       AND use_count > 0
     RETURNING true AS reserved
  )
  SELECT refunded.reserved FROM refunded
  UNION ALL
  SELECT false WHERE NOT EXISTS (SELECT 1 FROM refunded);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_demo_access_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_auth_user_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_demo_access_code(uuid) TO service_role;
