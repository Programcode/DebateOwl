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
  INSERT INTO private.workspace_document_state (workspace_id, document_id)
  VALUES (NEW.workspace_id, NEW.id)
  ON CONFLICT (document_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_documents_initialize_state_after_insert
AFTER INSERT ON public.workspace_documents
FOR EACH ROW EXECUTE FUNCTION private.initialize_workspace_document_state();

REVOKE ALL ON FUNCTION private.initialize_workspace_document_state()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.workspace_document_state (workspace_id, document_id)
SELECT workspace_id, id
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
