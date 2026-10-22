-- A release deleted the phone's token whatever registration had written it,
-- and every row the caller's install held. A release that arrived late, after
-- its sign-out had timed out, could then delete a newer registration of the
-- same token: the next account's, or the same account's after it registered
-- again. That account's switch stayed on while its notifications stopped.
--
-- A release now deletes only the rows its registration wrote, and the caller's
-- own rows from the install that carry no registration ID. A registration ID
-- is used for one registration only: once the app sends a release for it, the
-- next registration gets a new ID. So the rows a release can reach were
-- written before it was sent, and a newer registration keeps its row. The
-- token is no longer an argument.

-- No released app calls it.
-- squawk-ignore ban-drop-function
DROP FUNCTION public.release_push_token(text, uuid, uuid);

-- Withdraws a registration and deletes the rows it wrote, whichever account
-- holds them, and the caller's own rows from this install that carry no
-- registration ID. The app calls it when notifications are turned off, on
-- sign-out with that account's access token, and from the next account when
-- that failed. Knowing the registration ID is the proof: only the phone has it.
CREATE FUNCTION public.release_push_token(
  p_installation_id uuid,
  p_registration uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_registration IS NOT NULL THEN
    -- Waits for a registration with this ID that is still running, so the delete below sees its row.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push-registration:' || p_registration::text, 0));
    INSERT INTO public.push_withdrawn_registrations (registration_id) VALUES (p_registration)
    ON CONFLICT (registration_id) DO NOTHING;
  END IF;

  DELETE FROM public.push_tokens
  WHERE registration_id = p_registration
    OR (user_id = v_user_id AND installation_id = p_installation_id AND registration_id IS NULL);

  -- A request sent before its registration was withdrawn cannot arrive a day
  -- later: the access token it carries expires within the hour.
  DELETE FROM public.push_withdrawn_registrations WHERE withdrawn_at < now() - interval '1 day';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_push_token(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.release_push_token(uuid, uuid) TO authenticated;
