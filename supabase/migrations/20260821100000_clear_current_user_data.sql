-- Delete user-managed session data atomically. Server-owned settings and audit
-- records intentionally remain outside this user-triggered erase operation.
CREATE OR REPLACE FUNCTION public.clear_current_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  DELETE FROM public.cases WHERE user_id = v_user_id;
  DELETE FROM public.attacks WHERE user_id = v_user_id;
  DELETE FROM public.brainstorms WHERE user_id = v_user_id;
  DELETE FROM public.factoids WHERE user_id = v_user_id;
  DELETE FROM public.chats WHERE user_id = v_user_id;
  DELETE FROM public.flowcharts WHERE user_id = v_user_id;
  DELETE FROM public.sources WHERE user_id = v_user_id;
  DELETE FROM public.source_folders WHERE user_id = v_user_id;
  DELETE FROM public.api_keys WHERE user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_current_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_current_user_data() TO authenticated;
