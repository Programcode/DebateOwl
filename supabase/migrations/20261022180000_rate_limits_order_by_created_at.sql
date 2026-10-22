-- Production public.rate_limits has id, user_id, limit_type, limit_value and
-- created_at. It has no updated_at column (the local CREATE TABLE that added
-- one never ran there). get_active_rate_limits still ordered by updated_at, so
-- the admin limits RPC failed at runtime and its fallback query failed too.
-- Do not add the column. Order the newest row by created_at instead.

CREATE OR REPLACE FUNCTION public.get_active_rate_limits()
RETURNS TABLE (id uuid, user_id uuid, limit_type text, limit_value integer, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT DISTINCT ON (rl.user_id, rl.limit_type) rl.id, rl.user_id, rl.limit_type,
    rl.limit_value, rl.created_at FROM public.rate_limits rl
    ORDER BY rl.user_id, rl.limit_type, rl.created_at DESC, rl.id DESC;
END; $$;
