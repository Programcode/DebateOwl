CREATE TABLE private.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('code', 'email')),
  secret_digest bytea NOT NULL UNIQUE CHECK (octet_length(secret_digest) = 32),
  target_email_ciphertext text,
  target_email_hash bytea,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rotation_of uuid REFERENCES private.workspace_invites(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 30),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count BETWEEN 0 AND max_uses),
  revoked_at timestamptz,
  email_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invites_target_check CHECK (
    (
      kind = 'code'
      AND target_email_ciphertext IS NULL
      AND target_email_hash IS NULL
      AND email_delivered_at IS NULL
    )
    OR (
      kind = 'email'
      AND length(target_email_ciphertext) > 0
      AND octet_length(target_email_hash) = 32
      AND max_uses = 1
    )
  ),
  CONSTRAINT workspace_invites_delivery_time_check CHECK (
    email_delivered_at IS NULL OR email_delivered_at >= created_at
  )
);

CREATE TABLE private.workspace_invite_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
  success boolean NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workspace_invites_workspace_created_idx
  ON private.workspace_invites(workspace_id, created_at DESC);
CREATE INDEX workspace_invites_issuer_created_idx
  ON private.workspace_invites(issued_by, created_at DESC)
  WHERE issued_by IS NOT NULL;
CREATE INDEX workspace_invites_rotation_of_idx
  ON private.workspace_invites(rotation_of)
  WHERE rotation_of IS NOT NULL;
CREATE INDEX workspace_invites_live_code_idx
  ON private.workspace_invites(workspace_id, id)
  WHERE kind = 'code' AND revoked_at IS NULL;
CREATE INDEX workspace_invite_attempts_actor_failure_idx
  ON private.workspace_invite_attempts(actor_id, created_at DESC)
  WHERE success = false;
CREATE INDEX workspace_invite_attempts_ip_failure_idx
  ON private.workspace_invite_attempts(ip_hash, created_at DESC)
  WHERE success = false AND ip_hash IS NOT NULL;
CREATE INDEX workspace_invite_attempts_created_idx
  ON private.workspace_invite_attempts(created_at);

ALTER TABLE private.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_invite_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.workspace_invites, private.workspace_invite_attempts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.workspace_invite_attempts_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.workspace_audit_events
  ADD COLUMN invite_id uuid REFERENCES private.workspace_invites(id) ON DELETE SET NULL,
  ADD COLUMN invite_result text;

CREATE INDEX workspace_audit_events_invite_id_idx
  ON public.workspace_audit_events(invite_id)
  WHERE invite_id IS NOT NULL;

CREATE FUNCTION private.require_workspace_invite_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.require_workspace_invite_service_role()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_workspace_invite(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_kind text,
  p_secret_digest bytea,
  p_target_email_ciphertext text,
  p_target_email_hash bytea,
  p_max_uses integer,
  p_request_id uuid,
  p_rotate_invite_id uuid
)
RETURNS TABLE (
  invite_id uuid,
  expires_at timestamptz,
  max_uses integer,
  replayed boolean,
  revoked boolean,
  email_delivered boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace public.workspaces%ROWTYPE;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_previous private.workspace_invites%ROWTYPE;
  v_invite private.workspace_invites%ROWTYPE;
  v_fingerprint bytea;
  v_remaining integer;
  v_max_uses integer;
BEGIN
  PERFORM private.require_workspace_invite_service_role();
  IF p_actor_id IS NULL OR p_workspace_id IS NULL OR p_request_id IS NULL
    OR p_kind NOT IN ('code', 'email')
    OR p_secret_digest IS NULL OR octet_length(p_secret_digest) <> 32 THEN
    RAISE EXCEPTION 'invalid invite request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-request:' || p_request_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-actor:' || p_actor_id::text, 0));

  SELECT w.* INTO v_workspace
  FROM public.workspaces AS w
  WHERE w.id = p_workspace_id
    AND w.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = w.id AND m.user_id = p_actor_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'create_workspace_invite',
    'actor', p_actor_id,
    'workspace', p_workspace_id,
    'kind', p_kind,
    'secret_digest', encode(p_secret_digest, 'hex'),
    'target_email_hash', CASE
      WHEN p_target_email_hash IS NULL THEN NULL
      ELSE encode(p_target_email_hash, 'hex')
    END,
    'max_uses', p_max_uses,
    'rotate_invite', p_rotate_invite_id
  ));

  SELECT a.* INTO v_existing
  FROM public.workspace_audit_events AS a
  WHERE a.operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
      OR v_existing.invite_id IS NULL THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;

    SELECT i.* INTO v_invite
    FROM private.workspace_invites AS i
    WHERE i.id = v_existing.invite_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace unavailable';
    END IF;

    RETURN QUERY SELECT
      v_invite.id, v_invite.expires_at, v_invite.max_uses, true,
      v_invite.revoked_at IS NOT NULL, v_invite.email_delivered_at IS NOT NULL;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM private.workspace_invites
      WHERE issued_by = p_actor_id AND created_at >= now() - interval '1 hour') >= 20
    OR (SELECT count(*) FROM private.workspace_invites
        WHERE workspace_id = p_workspace_id AND created_at >= now() - interval '1 day') >= 50 THEN
    RAISE EXCEPTION 'invite rate limited';
  END IF;

  SELECT 30 - count(*)::integer INTO v_remaining
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'invite capacity exceeded';
  END IF;

  IF p_kind = 'email' THEN
    IF p_target_email_ciphertext IS NULL OR p_target_email_ciphertext = ''
      OR p_target_email_hash IS NULL OR octet_length(p_target_email_hash) <> 32
      OR p_max_uses IS DISTINCT FROM 1 OR p_rotate_invite_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid invite request';
    END IF;
    v_max_uses := 1;
  ELSE
    IF p_target_email_ciphertext IS NOT NULL OR p_target_email_hash IS NOT NULL THEN
      RAISE EXCEPTION 'invalid invite request';
    END IF;
    v_max_uses := coalesce(p_max_uses, v_remaining);
  END IF;

  IF v_max_uses NOT BETWEEN 1 AND v_remaining THEN
    RAISE EXCEPTION 'invite capacity exceeded';
  END IF;

  IF p_rotate_invite_id IS NOT NULL THEN
    IF p_kind <> 'code' THEN
      RAISE EXCEPTION 'invalid invite request';
    END IF;

    SELECT i.* INTO v_previous
    FROM private.workspace_invites AS i
    WHERE i.id = p_rotate_invite_id
      AND i.workspace_id = p_workspace_id
      AND i.kind = 'code'
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace unavailable';
    END IF;

    UPDATE private.workspace_invites
    SET revoked_at = now()
    WHERE id = v_previous.id;
  END IF;

  INSERT INTO private.workspace_invites (
    workspace_id, kind, secret_digest, target_email_ciphertext,
    target_email_hash, issued_by, rotation_of, expires_at, max_uses
  )
  VALUES (
    p_workspace_id, p_kind, p_secret_digest, p_target_email_ciphertext,
    p_target_email_hash, p_actor_id, p_rotate_invite_id,
    now() + CASE p_kind WHEN 'code' THEN interval '48 hours' ELSE interval '7 days' END,
    v_max_uses
  )
  RETURNING * INTO v_invite;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, actor_id, action,
    invite_id, invite_result
  )
  VALUES (
    p_request_id, v_fingerprint, p_workspace_id, p_actor_id,
    CASE WHEN p_rotate_invite_id IS NULL
      THEN 'invite_' || p_kind || '_create'
      ELSE 'invite_code_rotate'
    END,
    v_invite.id, 'created'
  );

  RETURN QUERY SELECT
    v_invite.id, v_invite.expires_at, v_invite.max_uses, false, false,
    v_invite.email_delivered_at IS NOT NULL;
END;
$$;

CREATE FUNCTION public.mark_workspace_invite_email_delivered(
  p_actor_id uuid,
  p_invite_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.require_workspace_invite_service_role();
  IF p_actor_id IS NULL OR p_invite_id IS NULL THEN
    RAISE EXCEPTION 'invalid invite request';
  END IF;

  UPDATE private.workspace_invites
  SET email_delivered_at = coalesce(email_delivered_at, now())
  WHERE id = p_invite_id
    AND kind = 'email'
    AND issued_by = p_actor_id
    AND revoked_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  RETURN true;
END;
$$;

CREATE FUNCTION public.revoke_workspace_invite(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_invite_id uuid,
  p_request_id uuid
)
RETURNS TABLE (revoked boolean, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.workspace_audit_events%ROWTYPE;
  v_fingerprint bytea;
BEGIN
  PERFORM private.require_workspace_invite_service_role();
  IF p_actor_id IS NULL OR p_workspace_id IS NULL OR p_invite_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid invite request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-request:' || p_request_id::text, 0));

  PERFORM 1
  FROM public.workspaces AS w
  WHERE w.id = p_workspace_id
    AND w.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = w.id AND m.user_id = p_actor_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'revoke_workspace_invite',
    'actor', p_actor_id,
    'workspace', p_workspace_id,
    'invite', p_invite_id
  ));

  SELECT a.* INTO v_existing
  FROM public.workspace_audit_events AS a
  WHERE a.operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
      OR v_existing.invite_id IS DISTINCT FROM p_invite_id THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN QUERY SELECT true, true;
    RETURN;
  END IF;

  UPDATE private.workspace_invites
  SET revoked_at = coalesce(revoked_at, now())
  WHERE id = p_invite_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, actor_id, action,
    invite_id, invite_result
  )
  VALUES (
    p_request_id, v_fingerprint, p_workspace_id, p_actor_id,
    'invite_revoke', p_invite_id, 'revoked'
  );

  RETURN QUERY SELECT true, false;
END;
$$;

CREATE FUNCTION public.redeem_workspace_invite(
  p_actor_id uuid,
  p_secret_digest bytea,
  p_actor_email_hash bytea,
  p_ip_hash bytea,
  p_request_id uuid
)
RETURNS TABLE (status text, workspace_id uuid, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.workspace_audit_events%ROWTYPE;
  v_invite private.workspace_invites%ROWTYPE;
  v_fingerprint bytea;
  v_is_member boolean;
BEGIN
  PERFORM private.require_workspace_invite_service_role();
  IF p_actor_id IS NULL OR p_request_id IS NULL
    OR p_secret_digest IS NULL OR octet_length(p_secret_digest) <> 32
    OR (p_actor_email_hash IS NOT NULL AND octet_length(p_actor_email_hash) <> 32)
    OR (p_ip_hash IS NOT NULL AND octet_length(p_ip_hash) <> 32) THEN
    RAISE EXCEPTION 'invalid invite request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-request:' || p_request_id::text, 0));
  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'redeem_workspace_invite',
    'actor', p_actor_id,
    'secret_digest', encode(p_secret_digest, 'hex'),
    'actor_email_hash', CASE
      WHEN p_actor_email_hash IS NULL THEN NULL
      ELSE encode(p_actor_email_hash, 'hex')
    END
  ));

  SELECT a.* INTO v_existing
  FROM public.workspace_audit_events AS a
  WHERE a.operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = v_existing.workspace_id AND m.user_id = p_actor_id
    ) THEN
      RETURN QUERY SELECT
        'accepted'::text, v_existing.workspace_id,
        v_existing.invite_result = 'member_existing';
    ELSE
      RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-actor:' || p_actor_id::text, 0));
  IF p_ip_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('workspace-invite-ip:' || encode(p_ip_hash, 'hex'), 0));
  END IF;

  DELETE FROM private.workspace_invite_attempts
  WHERE created_at < now() - interval '1 day';

  IF (SELECT count(*) FROM private.workspace_invite_attempts
      WHERE actor_id = p_actor_id AND success = false
        AND created_at >= now() - interval '15 minutes') >= 10
    OR (p_ip_hash IS NOT NULL AND (
      SELECT count(*) FROM private.workspace_invite_attempts
      WHERE ip_hash = p_ip_hash AND success = false
        AND created_at >= now() - interval '15 minutes'
    ) >= 10) THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid, false;
    RETURN;
  END IF;

  SELECT i.* INTO v_invite
  FROM private.workspace_invites AS i
  WHERE i.secret_digest = p_secret_digest;

  IF NOT FOUND THEN
    INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success, failure_reason)
    VALUES (p_actor_id, p_ip_hash, false, 'unavailable');
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, false;
    RETURN;
  END IF;

  PERFORM 1 FROM public.workspaces
  WHERE id = v_invite.workspace_id
  FOR UPDATE;

  SELECT i.* INTO v_invite
  FROM private.workspace_invites AS i
  WHERE i.id = v_invite.id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members AS m
    WHERE m.workspace_id = v_invite.workspace_id AND m.user_id = p_actor_id
  ) INTO v_is_member;

  IF v_is_member THEN
    INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success)
    VALUES (p_actor_id, p_ip_hash, true);
    INSERT INTO public.workspace_audit_events (
      operation_id, request_fingerprint, workspace_id, actor_id, action,
      invite_id, invite_result
    )
    VALUES (
      p_request_id, v_fingerprint, v_invite.workspace_id, p_actor_id,
      'invite_redeem', v_invite.id, 'member_existing'
    );
    RETURN QUERY SELECT 'accepted'::text, v_invite.workspace_id, true;
    RETURN;
  END IF;

  IF v_invite.revoked_at IS NOT NULL OR v_invite.expires_at <= now()
    OR v_invite.use_count >= v_invite.max_uses
    OR NOT EXISTS (
      SELECT 1 FROM public.workspaces AS w
      WHERE w.id = v_invite.workspace_id AND w.status = 'active'
    )
    OR (v_invite.kind = 'email'
      AND v_invite.target_email_hash IS DISTINCT FROM p_actor_email_hash) THEN
    INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success, failure_reason)
    VALUES (p_actor_id, p_ip_hash, false, 'unavailable');
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, false;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.workspace_members AS m
      WHERE m.workspace_id = v_invite.workspace_id) >= 30 THEN
    INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success, failure_reason)
    VALUES (p_actor_id, p_ip_hash, false, 'capacity');
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, false;
    RETURN;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id)
  VALUES (v_invite.workspace_id, p_actor_id);

  UPDATE private.workspace_invites
  SET use_count = use_count + 1
  WHERE id = v_invite.id;

  INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success)
  VALUES (p_actor_id, p_ip_hash, true);
  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, actor_id, action,
    invite_id, invite_result
  )
  VALUES (
    p_request_id, v_fingerprint, v_invite.workspace_id, p_actor_id,
    'invite_redeem', v_invite.id, 'member_added'
  );

  RETURN QUERY SELECT 'accepted'::text, v_invite.workspace_id, false;
END;
$$;

CREATE FUNCTION private.revoke_workspace_codes_after_member_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.workspace_invites
  SET revoked_at = coalesce(revoked_at, now())
  WHERE workspace_id = OLD.workspace_id
    AND kind = 'code'
    AND revoked_at IS NULL;
  RETURN OLD;
END;
$$;

CREATE TRIGGER workspace_members_revoke_codes_after_delete
AFTER DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION private.revoke_workspace_codes_after_member_removal();

REVOKE ALL ON FUNCTION private.revoke_workspace_codes_after_member_removal()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_workspace_invite(uuid, uuid, text, bytea, text, bytea, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_workspace_invite(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_workspace_invite(uuid, bytea, bytea, bytea, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_workspace_invite_email_delivered(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_workspace_invite(uuid, uuid, text, bytea, text, bytea, integer, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invite(uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_workspace_invite(uuid, bytea, bytea, bytea, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_workspace_invite_email_delivered(uuid, uuid)
  TO service_role;
