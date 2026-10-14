-- Expo push tokens for the iOS app, and the tickets the Expo push service
-- returns for them.
--
-- A token belongs to one device, and a device has one signed-in user. When a
-- second account signs in on the same phone, registering moves the token to
-- that account, so the first account's notifications stop reaching a phone it
-- no longer uses. Under RLS the second account cannot see the first one's row,
-- so registration goes through register_push_token, which only ever writes the
-- caller's own user ID. Clients read and delete their own rows directly.
--
-- Sign-out deletes the account's rows with its own access token. If that
-- fails, the next account on the phone calls release_push_token, which
-- deletes a token whatever account holds it.

CREATE TABLE public.push_tokens (
  token text PRIMARY KEY
    CHECK (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_+/=-]{8,200}\]$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  -- The app's random per-install ID, so a new token from the same install replaces the old one.
  installation_id uuid,
  -- The app language, so the server writes the notification in it.
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es', 'hu')),
  -- Cleared by the sender when Expo reports the device is no longer registered.
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.push_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO service_role;

-- Tickets wait here until their receipts are read. They carry no user ID: the
-- token says where a message went, and deleting the token deletes its tickets.
CREATE TABLE public.push_tickets (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 200),
  token text NOT NULL REFERENCES public.push_tokens(token) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_tickets_token_idx ON public.push_tickets (token);
CREATE INDEX push_tickets_created_at_idx ON public.push_tickets (created_at);

ALTER TABLE public.push_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.push_tickets TO service_role;

-- Registers the caller's device token, or refreshes it. Re-registering turns a
-- disabled token back on. An install keeps one token, and an account at most
-- ten, so a client cannot make the sender fan out to many made-up tokens.
CREATE FUNCTION public.register_push_token(
  p_token text,
  p_platform text,
  p_locale text,
  p_installation_id uuid
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

  -- One registration per account at a time: two at once would each count
  -- only their own new row and could keep eleven between them.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push-tokens:' || v_user_id::text, 0));

  IF p_installation_id IS NOT NULL THEN
    DELETE FROM public.push_tokens
    WHERE user_id = v_user_id AND installation_id = p_installation_id AND token <> p_token;
  END IF;

  INSERT INTO public.push_tokens (token, user_id, platform, installation_id, locale)
  VALUES (p_token, v_user_id, p_platform, p_installation_id, COALESCE(p_locale, 'en'))
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    installation_id = EXCLUDED.installation_id,
    locale = EXCLUDED.locale,
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

REVOKE EXECUTE ON FUNCTION public.register_push_token(text, text, text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, uuid) TO authenticated;

-- Deletes a token whatever account holds it. Holding the token is the proof:
-- the same caller could already move it to themselves with
-- register_push_token. The app calls it when the account that registered this
-- phone signed out but its rows could not be removed, so that account's
-- notifications stop reaching the next person on the phone.
CREATE FUNCTION public.release_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_tokens WHERE token = p_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_push_token(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.release_push_token(text) TO authenticated;
