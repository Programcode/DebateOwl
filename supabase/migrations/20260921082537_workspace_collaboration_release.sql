ALTER TABLE public.workspace_documents
  ADD COLUMN document_epoch bigint NOT NULL DEFAULT 0 CHECK (document_epoch >= 0),
  ADD COLUMN durable_sequence bigint NOT NULL DEFAULT 0 CHECK (durable_sequence >= 0);

-- PostgREST 16 supplies modern JWT claims through auth.role(). Keep invite
-- service RPCs compatible with that path as well as pgTAP's legacy role GUC.
CREATE OR REPLACE FUNCTION private.require_workspace_invite_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_workspace_invite_service_role()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.workspace_document_state (
  workspace_id uuid NOT NULL,
  document_id uuid PRIMARY KEY,
  epoch bigint NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  durable_sequence bigint NOT NULL DEFAULT 0 CHECK (durable_sequence >= 0),
  snapshot bytea NOT NULL DEFAULT '\x'::bytea CHECK (octet_length(snapshot) <= 2097152),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_document_state_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE
);

CREATE TABLE private.workspace_document_updates (
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  epoch bigint NOT NULL CHECK (epoch >= 0),
  sequence bigint NOT NULL CHECK (sequence > 0),
  mutation_id text NOT NULL CHECK (mutation_id ~ '^[A-Za-z0-9_-]{43}$'),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sync_type smallint NOT NULL CHECK (sync_type IN (1, 2)),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, epoch, sequence),
  UNIQUE (document_id, epoch, mutation_id),
  CONSTRAINT workspace_document_updates_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_document_updates_workspace_created_idx
  ON private.workspace_document_updates(workspace_id, created_at DESC);

ALTER TABLE private.workspace_document_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_document_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
  private.workspace_document_state,
  private.workspace_document_updates
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.initialize_workspace_document_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.workspace_document_state (workspace_id, document_id, epoch)
  VALUES (NEW.workspace_id, NEW.id, NEW.document_epoch)
  ON CONFLICT (document_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_documents_initialize_state_after_insert
AFTER INSERT ON public.workspace_documents
FOR EACH ROW EXECUTE FUNCTION private.initialize_workspace_document_state();

REVOKE ALL ON FUNCTION private.initialize_workspace_document_state()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.workspace_document_state (workspace_id, document_id, epoch)
SELECT workspace_id, id, document_epoch
FROM public.workspace_documents
ON CONFLICT (document_id) DO NOTHING;

CREATE FUNCTION private.notify_workspace_access_revoked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_notify('workspace_access_revoked', OLD.workspace_id::text);
  RETURN OLD;
END;
$$;

CREATE TRIGGER workspace_members_notify_access_revoked_after_delete
AFTER DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION private.notify_workspace_access_revoked();

REVOKE ALL ON FUNCTION private.notify_workspace_access_revoked()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_workspace_document(
  p_workspace_id uuid,
  p_title text,
  p_side text,
  p_duplicate_document_id uuid,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS TABLE (document_id uuid, revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := btrim(p_title);
  v_fingerprint bytea;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_source public.workspace_documents%ROWTYPE;
  v_document_id uuid;
  v_new_revision bigint;
  v_position integer;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'create_workspace_document',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'title', v_title,
    'side', p_side,
    'duplicate_document', p_duplicate_document_id,
    'expected_revision', p_expected_revision
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.workspace_audit_events
  WHERE operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
      OR v_existing.document_id IS NULL THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN QUERY SELECT v_existing.document_id, v_existing.after_revision;
    RETURN;
  END IF;

  IF p_workspace_id IS NULL OR p_expected_revision < 0
    OR v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200
    OR p_side NOT IN ('pro', 'con') THEN
    RAISE EXCEPTION 'invalid document request';
  END IF;

  SELECT w.* INTO v_workspace
  FROM public.workspaces AS w
  WHERE w.id = p_workspace_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = w.id AND m.user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND OR v_workspace.status <> 'active' THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF v_workspace.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'workspace conflict';
  END IF;

  IF p_duplicate_document_id IS NOT NULL THEN
    SELECT d.* INTO v_source
    FROM public.workspace_documents AS d
    WHERE d.workspace_id = p_workspace_id
      AND d.id = p_duplicate_document_id
      AND d.state <> 'trashed'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace unavailable';
    END IF;
  END IF;

  SELECT coalesce(max(position), -1) + 1 INTO v_position
  FROM public.workspace_documents
  WHERE workspace_id = p_workspace_id AND side = p_side AND state = 'active';

  INSERT INTO public.workspace_documents (
    workspace_id, created_by, side, title, position, assignee_id
  ) VALUES (
    p_workspace_id, v_user_id, p_side, v_title, v_position, NULL
  )
  RETURNING id INTO v_document_id;

  IF p_duplicate_document_id IS NOT NULL THEN
    UPDATE private.workspace_document_state AS destination
    SET snapshot = source.snapshot,
        updated_at = now()
    FROM private.workspace_document_state AS source
    WHERE destination.document_id = v_document_id
      AND source.document_id = p_duplicate_document_id;
  END IF;

  v_new_revision := v_workspace.revision + 1;
  UPDATE public.workspaces
  SET revision = v_new_revision, updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, document_id, actor_id,
    action, before_revision, after_revision
  ) VALUES (
    p_request_id, v_fingerprint, p_workspace_id, v_document_id, v_user_id,
    CASE WHEN p_duplicate_document_id IS NULL THEN 'document_create' ELSE 'document_duplicate' END,
    v_workspace.revision, v_new_revision
  );

  RETURN QUERY SELECT v_document_id, v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_document(uuid, text, text, uuid, bigint, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_document(uuid, text, text, uuid, bigint, uuid)
  TO authenticated;

CREATE TABLE public.workspace_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('automatic', 'named', 'pre_restore')),
  document_epoch bigint NOT NULL CHECK (document_epoch >= 0),
  durable_sequence bigint NOT NULL CHECK (durable_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_versions_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE
);

CREATE TABLE private.workspace_version_data (
  version_id uuid PRIMARY KEY REFERENCES public.workspace_versions(id) ON DELETE CASCADE,
  snapshot bytea NOT NULL CHECK (octet_length(snapshot) <= 2097152)
);

CREATE INDEX workspace_versions_document_created_idx
  ON public.workspace_versions(workspace_id, document_id, created_at DESC);
ALTER TABLE public.workspace_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_version_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_versions_select_member ON public.workspace_versions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_current_workspace_member(workspace_id)));
REVOKE ALL ON TABLE public.workspace_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workspace_versions TO authenticated;
REVOKE ALL ON TABLE private.workspace_version_data FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.workspace_audit_events
  ADD COLUMN version_id uuid REFERENCES public.workspace_versions(id) ON DELETE SET NULL,
  ADD COLUMN payload jsonb;

CREATE FUNCTION public.create_workspace_version(
  p_workspace_id uuid,
  p_document_id uuid,
  p_name text,
  p_expected_sequence bigint,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_name), '');
  v_fingerprint bytea;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_state private.workspace_document_state%ROWTYPE;
  v_version_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_expected_sequence IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_workspace_id IS NULL OR p_document_id IS NULL OR p_expected_sequence < 0
    OR (v_name IS NOT NULL AND length(v_name) > 200) THEN
    RAISE EXCEPTION 'invalid version request';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'create_workspace_version',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'document', p_document_id,
    'name', v_name,
    'expected_sequence', p_expected_sequence
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.workspace_audit_events WHERE operation_id = p_request_id;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
      OR v_existing.version_id IS NULL THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.version_id;
  END IF;

  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE OF workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces AS workspace
    JOIN public.workspace_members AS member
      ON member.workspace_id = workspace.id AND member.user_id = v_user_id
    WHERE workspace.id = p_workspace_id AND workspace.status = 'active'
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  SELECT state.* INTO v_state
  FROM private.workspace_document_state AS state
  JOIN public.workspace_documents AS document
    ON document.workspace_id = state.workspace_id AND document.id = state.document_id
  WHERE state.workspace_id = p_workspace_id AND state.document_id = p_document_id
  FOR UPDATE OF state;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF v_state.durable_sequence <> p_expected_sequence THEN RAISE EXCEPTION 'document conflict'; END IF;

  INSERT INTO public.workspace_versions (
    workspace_id, document_id, created_by, name, kind, document_epoch, durable_sequence
  ) VALUES (
    p_workspace_id, p_document_id, v_user_id, v_name,
    CASE WHEN v_name IS NULL THEN 'automatic' ELSE 'named' END,
    v_state.epoch, v_state.durable_sequence
  ) RETURNING id INTO v_version_id;
  INSERT INTO private.workspace_version_data (version_id, snapshot)
  VALUES (v_version_id, v_state.snapshot);
  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, document_id, actor_id,
    action, before_revision, after_revision, version_id
  )
  SELECT p_request_id, v_fingerprint, p_workspace_id, p_document_id, v_user_id,
    'version_create', revision, revision, v_version_id
  FROM public.workspaces WHERE id = p_workspace_id;
  RETURN v_version_id;
END;
$$;

CREATE FUNCTION public.restore_workspace_version(
  p_workspace_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_previewed_sequence bigint,
  p_request_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_fingerprint bytea;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_state private.workspace_document_state%ROWTYPE;
  v_target private.workspace_version_data%ROWTYPE;
  v_pre_restore_id uuid;
  v_new_epoch bigint;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_previewed_sequence IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_workspace_id IS NULL OR p_document_id IS NULL OR p_version_id IS NULL
    OR p_previewed_sequence < 0 THEN
    RAISE EXCEPTION 'invalid version request';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'restore_workspace_version',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'document', p_document_id,
    'version', p_version_id,
    'previewed_sequence', p_previewed_sequence
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.workspace_audit_events WHERE operation_id = p_request_id;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN (v_existing.payload->>'epoch')::bigint;
  END IF;

  SELECT workspace.* INTO v_workspace
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS member
      WHERE member.workspace_id = workspace.id AND member.user_id = v_user_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  SELECT state.* INTO v_state
  FROM private.workspace_document_state AS state
  WHERE state.workspace_id = p_workspace_id AND state.document_id = p_document_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF v_state.durable_sequence <> p_previewed_sequence THEN RAISE EXCEPTION 'document conflict'; END IF;

  SELECT data.* INTO v_target
  FROM private.workspace_version_data AS data
  JOIN public.workspace_versions AS version ON version.id = data.version_id
  WHERE version.id = p_version_id
    AND version.workspace_id = p_workspace_id
    AND version.document_id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  INSERT INTO public.workspace_versions (
    workspace_id, document_id, created_by, kind, document_epoch, durable_sequence
  ) VALUES (
    p_workspace_id, p_document_id, v_user_id, 'pre_restore',
    v_state.epoch, v_state.durable_sequence
  ) RETURNING id INTO v_pre_restore_id;
  INSERT INTO private.workspace_version_data (version_id, snapshot)
  VALUES (v_pre_restore_id, v_state.snapshot);

  v_new_epoch := v_state.epoch + 1;
  UPDATE private.workspace_document_state
  SET epoch = v_new_epoch, durable_sequence = 0, snapshot = v_target.snapshot, updated_at = now()
  WHERE document_id = p_document_id;
  UPDATE public.workspace_documents
  SET document_epoch = v_new_epoch, durable_sequence = 0, updated_at = now()
  WHERE workspace_id = p_workspace_id AND id = p_document_id;
  UPDATE public.workspaces
  SET revision = revision + 1, updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, document_id, actor_id,
    action, before_revision, after_revision, version_id, payload
  ) VALUES (
    p_request_id, v_fingerprint, p_workspace_id, p_document_id, v_user_id,
    'version_restore', v_workspace.revision, v_workspace.revision + 1,
    p_version_id, jsonb_build_object('epoch', v_new_epoch, 'pre_restore_version', v_pre_restore_id)
  );
  PERFORM pg_catalog.pg_notify('workspace_document_restored', p_document_id::text);
  RETURN v_new_epoch;
END;
$$;

CREATE FUNCTION public.get_workspace_version_snapshot(
  p_workspace_id uuid,
  p_document_id uuid,
  p_version_id uuid
)
RETURNS TABLE(snapshot_base64 text, current_sequence bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(data.snapshot, 'base64'), state.durable_sequence
  FROM public.workspace_versions AS version
  JOIN private.workspace_version_data AS data ON data.version_id = version.id
  JOIN private.workspace_document_state AS state
    ON state.workspace_id = version.workspace_id
   AND state.document_id = version.document_id
  WHERE version.id = p_version_id
    AND version.workspace_id = p_workspace_id
    AND version.document_id = p_document_id
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members AS member
      WHERE member.workspace_id = version.workspace_id
        AND member.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.create_workspace_version(uuid, uuid, text, bigint, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_workspace_version(uuid, uuid, uuid, bigint, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_workspace_version_snapshot(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_version(uuid, uuid, text, bigint, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_workspace_version(uuid, uuid, uuid, bigint, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_version_snapshot(uuid, uuid, uuid)
  TO authenticated;

CREATE TABLE public.workspace_proposals (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_epoch bigint NOT NULL CHECK (document_epoch >= 0),
  durable_sequence bigint NOT NULL CHECK (durable_sequence >= 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_proposals_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_proposals_payload_size
    CHECK (octet_length(convert_to(payload::text, 'UTF8')) <= 262144)
);

CREATE TABLE public.workspace_comments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor jsonb NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_comments_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_comments_anchor_size
    CHECK (octet_length(convert_to(anchor::text, 'UTF8')) <= 32768)
);

CREATE TABLE public.workspace_comment_replies (
  id uuid PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.workspace_comments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  comment_id uuid NOT NULL REFERENCES public.workspace_comments(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind = 'mention'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, recipient_id),
  CONSTRAINT workspace_notifications_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_proposals_document_created_idx
  ON public.workspace_proposals(workspace_id, document_id, created_at DESC);
CREATE INDEX workspace_comments_document_created_idx
  ON public.workspace_comments(workspace_id, document_id, created_at DESC);
CREATE INDEX workspace_comment_replies_comment_created_idx
  ON public.workspace_comment_replies(comment_id, created_at);
CREATE INDEX workspace_notifications_recipient_created_idx
  ON public.workspace_notifications(recipient_id, created_at DESC);

ALTER TABLE public.workspace_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_proposals_select_member ON public.workspace_proposals
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_comments_select_member ON public.workspace_comments
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_comment_replies_select_member ON public.workspace_comment_replies
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_notifications_select_recipient ON public.workspace_notifications
  FOR SELECT TO authenticated USING (
    recipient_id = (SELECT auth.uid())
    AND (SELECT private.is_current_workspace_member(workspace_id))
  );
REVOKE ALL ON TABLE public.workspace_proposals, public.workspace_comments,
  public.workspace_comment_replies, public.workspace_notifications
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workspace_proposals, public.workspace_comments,
  public.workspace_comment_replies, public.workspace_notifications
TO authenticated;

CREATE FUNCTION private.require_workspace_document_member(
  p_workspace_id uuid,
  p_document_id uuid,
  p_require_active boolean DEFAULT true
)
RETURNS private.workspace_document_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state private.workspace_document_state%ROWTYPE;
BEGIN
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE OF workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces AS workspace
    JOIN public.workspace_members AS member
      ON member.workspace_id = workspace.id AND member.user_id = auth.uid()
    WHERE workspace.id = p_workspace_id
      AND (NOT p_require_active OR workspace.status = 'active')
      AND workspace.status <> 'deleted'
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  SELECT state.* INTO v_state
  FROM private.workspace_document_state AS state
  WHERE state.workspace_id = p_workspace_id AND state.document_id = p_document_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  RETURN v_state;
END;
$$;
REVOKE ALL ON FUNCTION private.require_workspace_document_member(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_workspace_proposal(
  p_workspace_id uuid,
  p_document_id uuid,
  p_proposal_id uuid,
  p_document_epoch bigint,
  p_expected_sequence bigint,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state private.workspace_document_state%ROWTYPE;
  v_existing public.workspace_proposals%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR p_proposal_id IS NULL OR p_payload IS NULL
    OR p_document_epoch IS NULL OR p_expected_sequence IS NULL
    OR p_document_epoch < 0 OR p_expected_sequence < 0
    OR octet_length(convert_to(p_payload::text, 'UTF8')) > 262144
    OR p_payload->>'id' IS DISTINCT FROM p_proposal_id::text
    OR p_payload->>'authorId' IS DISTINCT FROM v_user_id::text
    OR (p_payload->>'documentEpoch')::bigint IS DISTINCT FROM p_document_epoch
    OR coalesce(jsonb_typeof(p_payload->'hunks'), 'null') <> 'array'
    OR jsonb_array_length(p_payload->'hunks') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid proposal request';
  END IF;
  v_state := private.require_workspace_document_member(p_workspace_id, p_document_id, true);
  IF v_state.epoch <> p_document_epoch OR v_state.durable_sequence <> p_expected_sequence THEN
    RAISE EXCEPTION 'document conflict';
  END IF;
  SELECT * INTO v_existing FROM public.workspace_proposals WHERE id = p_proposal_id;
  IF FOUND THEN
    IF v_existing.workspace_id IS DISTINCT FROM p_workspace_id
      OR v_existing.document_id IS DISTINCT FROM p_document_id
      OR v_existing.author_id IS DISTINCT FROM v_user_id
      OR v_existing.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.workspace_proposals (
    id, workspace_id, document_id, author_id, document_epoch, durable_sequence, payload
  ) VALUES (
    p_proposal_id, p_workspace_id, p_document_id, v_user_id,
    p_document_epoch, p_expected_sequence, p_payload
  );
  RETURN p_proposal_id;
END;
$$;

CREATE FUNCTION public.create_workspace_comment(
  p_workspace_id uuid,
  p_document_id uuid,
  p_comment_id uuid,
  p_anchor jsonb,
  p_body text,
  p_mention_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_body text := btrim(p_body);
BEGIN
  IF v_user_id IS NULL OR p_comment_id IS NULL OR p_anchor IS NULL OR p_body IS NULL
    OR length(v_body) NOT BETWEEN 1 AND 2000
    OR octet_length(convert_to(p_anchor::text, 'UTF8')) > 32768
    OR p_anchor->>'id' IS DISTINCT FROM p_comment_id::text
    OR coalesce(jsonb_typeof(p_anchor->'from'), 'null') <> 'array'
    OR coalesce(jsonb_typeof(p_anchor->'to'), 'null') <> 'array'
    OR coalesce(jsonb_typeof(p_anchor->'quote'), 'null') <> 'string'
    OR length(p_anchor->>'quote') NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'invalid comment request';
  END IF;
  PERFORM private.require_workspace_document_member(p_workspace_id, p_document_id, true);
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_mention_ids, ARRAY[]::uuid[])) AS mentioned(user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_members AS member
      WHERE member.workspace_id = p_workspace_id AND member.user_id = mentioned.user_id
    )
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  INSERT INTO public.workspace_comments (id, workspace_id, document_id, author_id, anchor, body)
  VALUES (p_comment_id, p_workspace_id, p_document_id, v_user_id, p_anchor, v_body);
  INSERT INTO public.workspace_notifications (
    workspace_id, document_id, comment_id, recipient_id, actor_id, kind
  )
  SELECT p_workspace_id, p_document_id, p_comment_id, mentioned.user_id, v_user_id, 'mention'
  FROM (SELECT DISTINCT unnest(coalesce(p_mention_ids, ARRAY[]::uuid[])) AS user_id) AS mentioned
  WHERE mentioned.user_id <> v_user_id;
  RETURN p_comment_id;
END;
$$;

CREATE FUNCTION public.reply_workspace_comment(
  p_workspace_id uuid,
  p_comment_id uuid,
  p_reply_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_body text := btrim(p_body);
  v_document_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_reply_id IS NULL OR length(v_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  SELECT document_id INTO v_document_id
  FROM public.workspace_comments
  WHERE id = p_comment_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  PERFORM private.require_workspace_document_member(p_workspace_id, v_document_id, true);
  INSERT INTO public.workspace_comment_replies (id, comment_id, workspace_id, author_id, body)
  VALUES (p_reply_id, p_comment_id, p_workspace_id, v_user_id, v_body);
  RETURN p_reply_id;
END;
$$;

CREATE FUNCTION public.resolve_workspace_comment(
  p_workspace_id uuid,
  p_comment_id uuid,
  p_resolved boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_document_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_resolved IS NULL THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  SELECT document_id INTO v_document_id
  FROM public.workspace_comments
  WHERE id = p_comment_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  PERFORM private.require_workspace_document_member(p_workspace_id, v_document_id, true);
  UPDATE public.workspace_comments
  SET resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_resolved THEN v_user_id ELSE NULL END
  WHERE id = p_comment_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  RETURN p_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_proposal(uuid, uuid, uuid, bigint, bigint, jsonb),
  public.create_workspace_comment(uuid, uuid, uuid, jsonb, text, uuid[]),
  public.reply_workspace_comment(uuid, uuid, uuid, text),
  public.resolve_workspace_comment(uuid, uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_proposal(uuid, uuid, uuid, bigint, bigint, jsonb),
  public.create_workspace_comment(uuid, uuid, uuid, jsonb, text, uuid[]),
  public.reply_workspace_comment(uuid, uuid, uuid, text),
  public.resolve_workspace_comment(uuid, uuid, boolean)
TO authenticated;
