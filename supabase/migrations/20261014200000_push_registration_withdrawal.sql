-- A registration the app gave up on can still commit after the phone's rows
-- were released: cancelling an HTTP request does not cancel its database
-- statement. The account that signed out would then keep its notifications on
-- the phone. So every registration now carries the ID of the app's local
-- registration record, and releasing withdraws that ID. Registration refuses
-- a withdrawn ID however late it arrives. Both take the ID's lock and hold it
-- until they commit, so whichever runs second sees the other: a release after
-- a registration deletes its row, and a registration after a release finds
-- its ID withdrawn.

CREATE TABLE public.push_withdrawn_registrations (
  registration_id uuid PRIMARY KEY,
  withdrawn_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_withdrawn_registrations_withdrawn_at_idx ON public.push_withdrawn_registrations (withdrawn_at);

-- Only the two functions below use it.
ALTER TABLE public.push_withdrawn_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_withdrawn_registrations FROM PUBLIC, anon, authenticated, service_role;

-- The registration that last wrote the row.
ALTER TABLE public.push_tokens ADD COLUMN registration_id uuid;
-- push_tokens comes from the previous migration, which no deployment has run yet, so it is empty.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX push_tokens_registration_id_idx ON public.push_tokens (registration_id);

-- No released app calls it, and keeping it would leave a registration that cannot be withdrawn.
-- squawk-ignore ban-drop-function
DROP FUNCTION public.register_push_token(text, text, text, uuid);

-- As before, plus p_registration, the ID a release withdraws.
CREATE FUNCTION public.register_push_token(
  p_token text,
  p_platform text,
  p_locale text,
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
  IF p_registration IS NULL THEN
    RAISE EXCEPTION 'registration ID is required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push-registration:' || p_registration::text, 0));
  -- A new statement, so under READ COMMITTED it sees a release that committed while this waited.
  IF EXISTS (SELECT 1 FROM public.push_withdrawn_registrations WHERE registration_id = p_registration) THEN
    RAISE EXCEPTION 'this registration was released' USING ERRCODE = '55000';
  END IF;

  -- One registration per account at a time: two at once would each count
  -- only their own new row and could keep eleven between them.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push-tokens:' || v_user_id::text, 0));

  IF p_installation_id IS NOT NULL THEN
    DELETE FROM public.push_tokens
    WHERE user_id = v_user_id AND installation_id = p_installation_id AND token <> p_token;
  END IF;

  INSERT INTO public.push_tokens (token, user_id, platform, installation_id, locale, registration_id)
  VALUES (p_token, v_user_id, p_platform, p_installation_id, COALESCE(p_locale, 'en'), p_registration)
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    installation_id = EXCLUDED.installation_id,
    locale = EXCLUDED.locale,
    registration_id = EXCLUDED.registration_id,
    enabled = true,
    updated_at = now(),
    last_seen_at = now();

  DELETE FROM public.push_tokens
  WHERE user_id = v_user_id
    AND token NOT IN (
      SELECT kept.token FROM public.push_tokens AS kept
      WHERE kept.user_id = v_user_id
      ORDER BY kept.last_seen_at DESC, kept.token
      LIMIT 10
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_push_token(text, text, text, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, uuid, uuid) TO authenticated;

-- No released app calls it; the new version also withdraws the registration.
-- squawk-ignore ban-drop-function
DROP FUNCTION public.release_push_token(text);

-- Withdraws a registration and deletes the phone's rows: the rows that
-- registration wrote, the token whatever account holds it, and the caller's
-- own rows from this install. The app calls it when notifications are turned
-- off, on sign-out with that account's access token, and from the next
-- account when that failed. Knowing the registration ID or the token is the
-- proof: only the phone has them, and the token alone already lets a caller
-- move the row to themselves with register_push_token.
CREATE FUNCTION public.release_push_token(
  p_token text,
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
  WHERE token = p_token
    OR registration_id = p_registration
    OR (user_id = v_user_id AND installation_id = p_installation_id);

  -- A request sent before its registration was withdrawn cannot arrive a day
  -- later: the access token it carries expires within the hour.
  DELETE FROM public.push_withdrawn_registrations WHERE withdrawn_at < now() - interval '1 day';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_push_token(text, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.release_push_token(text, uuid, uuid) TO authenticated;
