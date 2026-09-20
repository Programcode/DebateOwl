CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  motion text NOT NULL CHECK (length(btrim(motion)) BETWEEN 1 AND 2000),
  title text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 200),
  initial_language text NOT NULL CHECK (initial_language IN ('en', 'es', 'hu')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  deleted_at timestamptz,
  access_epoch bigint NOT NULL DEFAULT 0 CHECK (access_epoch >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  create_request_id uuid NOT NULL,
  pending_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_owner_create_request_key UNIQUE (owner_id, create_request_id),
  CONSTRAINT workspaces_pending_owner_check CHECK (pending_owner_id IS DISTINCT FROM owner_id),
  CONSTRAINT workspaces_deleted_state_check CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE public.workspace_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('pro', 'con')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  position integer NOT NULL CHECK (position >= 0),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived', 'trashed')),
  trashed_at timestamptz,
  trash_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_documents_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT workspace_documents_trash_state_check CHECK (
    (state = 'trashed') = (trashed_at IS NOT NULL)
    AND (state = 'trashed') = (trash_expires_at IS NOT NULL)
  )
);

CREATE TABLE public.workspace_audit_events (
  operation_id uuid PRIMARY KEY,
  request_fingerprint bytea NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id uuid,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_revision bigint CHECK (before_revision IS NULL OR before_revision >= 0),
  after_revision bigint CHECK (after_revision IS NULL OR after_revision >= 0),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_audit_events_document_fkey
    FOREIGN KEY (workspace_id, document_id)
    REFERENCES public.workspace_documents(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_audit_events_revision_check CHECK (
    before_revision IS NULL OR after_revision IS NULL OR after_revision >= before_revision
  )
);

CREATE INDEX workspaces_owner_id_idx ON public.workspaces(owner_id);
CREATE INDEX workspaces_pending_owner_id_idx ON public.workspaces(pending_owner_id)
  WHERE pending_owner_id IS NOT NULL;
CREATE INDEX workspace_members_user_workspace_idx
  ON public.workspace_members(user_id, workspace_id);
CREATE INDEX workspace_documents_workspace_side_position_idx
  ON public.workspace_documents(workspace_id, side, position);
CREATE INDEX workspace_documents_created_by_idx ON public.workspace_documents(created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX workspace_documents_assignee_id_idx ON public.workspace_documents(assignee_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX workspace_audit_events_workspace_created_idx
  ON public.workspace_audit_events(workspace_id, created_at);
CREATE INDEX workspace_audit_events_document_idx ON public.workspace_audit_events(workspace_id, document_id)
  WHERE document_id IS NOT NULL;
CREATE INDEX workspace_audit_events_actor_id_idx ON public.workspace_audit_events(actor_id)
  WHERE actor_id IS NOT NULL;
CREATE INDEX workspace_audit_events_target_user_id_idx ON public.workspace_audit_events(target_user_id)
  WHERE target_user_id IS NOT NULL;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.workspace_request_fingerprint(p_payload jsonb)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256');
$$;

REVOKE ALL ON FUNCTION private.workspace_request_fingerprint(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.is_current_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
        AND user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION private.is_current_workspace_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_current_workspace_member(uuid) TO authenticated;

CREATE POLICY workspaces_select_member ON public.workspaces
  FOR SELECT TO authenticated
  USING ((SELECT private.is_current_workspace_member(id)));

CREATE POLICY workspace_members_select_member ON public.workspace_members
  FOR SELECT TO authenticated
  USING ((SELECT private.is_current_workspace_member(workspace_id)));

CREATE POLICY workspace_documents_select_member ON public.workspace_documents
  FOR SELECT TO authenticated
  USING ((SELECT private.is_current_workspace_member(workspace_id)));

CREATE POLICY workspace_audit_events_select_member ON public.workspace_audit_events
  FOR SELECT TO authenticated
  USING ((SELECT private.is_current_workspace_member(workspace_id)));

REVOKE ALL ON TABLE
  public.workspaces,
  public.workspace_members,
  public.workspace_documents,
  public.workspace_audit_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.workspaces,
  public.workspace_members,
  public.workspace_documents,
  public.workspace_audit_events
TO authenticated;

CREATE FUNCTION public.create_workspace(
  p_motion text,
  p_title text,
  p_language text,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_motion text := btrim(p_motion);
  v_title text := nullif(btrim(p_title), '');
  v_fingerprint bytea;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_workspace_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'create_workspace',
    'actor', v_user_id,
    'motion', v_motion,
    'title', v_title,
    'language', p_language
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.workspace_audit_events
  WHERE operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.workspace_id;
  END IF;

  IF v_motion IS NULL OR length(v_motion) NOT BETWEEN 1 AND 2000
    OR p_language IS NULL OR p_language NOT IN ('en', 'es', 'hu')
    OR (v_title IS NOT NULL AND length(v_title) > 200) THEN
    RAISE EXCEPTION 'invalid workspace request';
  END IF;

  INSERT INTO public.workspaces (
    owner_id, motion, title, initial_language, create_request_id
  )
  VALUES (v_user_id, v_motion, v_title, p_language, p_request_id)
  ON CONFLICT (owner_id, create_request_id) DO NOTHING
  RETURNING id INTO v_workspace_id;

  IF v_workspace_id IS NULL THEN
    SELECT id INTO v_workspace_id
    FROM public.workspaces
    WHERE owner_id = v_user_id
      AND create_request_id = p_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
  ELSE
    INSERT INTO public.workspace_members (workspace_id, user_id)
    VALUES (v_workspace_id, v_user_id);

    INSERT INTO public.workspace_documents (
      workspace_id, created_by, side, title, position
    )
    SELECT v_workspace_id, v_user_id, defaults.side, defaults.title, defaults.position
    FROM (VALUES
      ('pro', 'Intro', 0),
      ('pro', 'R1', 1),
      ('pro', 'R2', 2),
      ('pro', CASE p_language WHEN 'es' THEN 'Conclusión' WHEN 'hu' THEN 'Összegzés' ELSE 'Conclusion' END, 3),
      ('con', 'Intro', 0),
      ('con', 'R1', 1),
      ('con', 'R2', 2),
      ('con', CASE p_language WHEN 'es' THEN 'Conclusión' WHEN 'hu' THEN 'Összegzés' ELSE 'Conclusion' END, 3)
    ) AS defaults(side, title, position);

    INSERT INTO public.workspace_audit_events (
      operation_id, request_fingerprint, workspace_id, actor_id, action, after_revision
    )
    VALUES (p_request_id, v_fingerprint, v_workspace_id, v_user_id, 'workspace_create', 0);
  END IF;

  RETURN v_workspace_id;
END;
$$;

CREATE FUNCTION public.update_workspace_document(
  p_workspace_id uuid,
  p_document_id uuid,
  p_title text,
  p_side text,
  p_ordered_ids uuid[],
  p_assignee_id uuid,
  p_assignee_changed boolean,
  p_state text,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := CASE WHEN p_title IS NULL THEN NULL ELSE btrim(p_title) END;
  v_fingerprint bytea;
  v_existing public.workspace_audit_events%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_document public.workspace_documents%ROWTYPE;
  v_side text;
  v_state text;
  v_new_revision bigint;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'update_workspace_document',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'document', p_document_id,
    'title', v_title,
    'side', p_side,
    'ordered_ids', to_jsonb(p_ordered_ids),
    'assignee', p_assignee_id,
    'assignee_changed', p_assignee_changed,
    'state', p_state,
    'expected_revision', p_expected_revision
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.workspace_audit_events
  WHERE operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.after_revision;
  END IF;

  IF p_workspace_id IS NULL OR p_document_id IS NULL OR p_expected_revision < 0
    OR p_assignee_changed IS NULL
    OR (NOT p_assignee_changed AND p_assignee_id IS NOT NULL)
    OR (p_title IS NOT NULL AND (v_title = '' OR length(v_title) > 200))
    OR (p_side IS NOT NULL AND p_side NOT IN ('pro', 'con'))
    OR (p_state IS NOT NULL AND p_state NOT IN ('active', 'archived', 'trashed')) THEN
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

  SELECT d.* INTO v_document
  FROM public.workspace_documents AS d
  WHERE d.workspace_id = p_workspace_id
    AND d.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF p_assignee_changed AND p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_assignee_id
  ) THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  v_side := coalesce(p_side, v_document.side);
  v_state := coalesce(p_state, v_document.state);

  IF v_document.state = 'trashed' AND v_state <> 'trashed'
    AND v_document.trash_expires_at <= now() THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF v_state = 'active'
    AND (v_document.state <> 'active' OR v_side <> v_document.side)
    AND p_ordered_ids IS NULL THEN
    RAISE EXCEPTION 'invalid document order';
  END IF;

  UPDATE public.workspace_documents
  SET title = coalesce(v_title, v_document.title),
      side = v_side,
      assignee_id = CASE
        WHEN p_assignee_changed THEN p_assignee_id
        ELSE v_document.assignee_id
      END,
      state = v_state,
      trashed_at = CASE
        WHEN v_state = 'trashed' AND v_document.state <> 'trashed' THEN now()
        WHEN v_state = 'trashed' THEN v_document.trashed_at
        ELSE NULL
      END,
      trash_expires_at = CASE
        WHEN v_state = 'trashed' AND v_document.state <> 'trashed' THEN now() + interval '30 days'
        WHEN v_state = 'trashed' THEN v_document.trash_expires_at
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_document_id;

  IF p_ordered_ids IS NOT NULL THEN
    IF cardinality(p_ordered_ids) <> (
        SELECT count(*) FROM public.workspace_documents
        WHERE workspace_id = p_workspace_id AND side = v_side AND state = 'active'
      )
      OR cardinality(p_ordered_ids) <> (
        SELECT count(DISTINCT ordered_id) FROM unnest(p_ordered_ids) AS ordered_id
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p_ordered_ids) AS ordered_id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.workspace_documents
          WHERE workspace_id = p_workspace_id
            AND id = ordered_id
            AND side = v_side
            AND state = 'active'
        )
      ) THEN
      RAISE EXCEPTION 'invalid document order';
    END IF;

    UPDATE public.workspace_documents AS d
    SET position = ordered.position - 1,
        updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS ordered(id, position)
    WHERE d.workspace_id = p_workspace_id
      AND d.id = ordered.id;
  END IF;

  v_new_revision := v_workspace.revision + 1;
  UPDATE public.workspaces
  SET revision = v_new_revision, updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, document_id, actor_id,
    action, before_revision, after_revision, target_user_id
  )
  VALUES (
    p_request_id, v_fingerprint, p_workspace_id, p_document_id, v_user_id,
    'document_update', v_workspace.revision, v_new_revision,
    CASE WHEN p_assignee_changed THEN p_assignee_id ELSE NULL END
  );

  RETURN v_new_revision;
END;
$$;

CREATE FUNCTION public.change_workspace_access(
  p_workspace_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_expected_revision bigint,
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
  v_new_revision bigint;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'change_workspace_access',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'action', p_action,
    'target', p_target_user_id,
    'expected_revision', p_expected_revision
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.workspace_audit_events
  WHERE operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.after_revision;
  END IF;

  IF p_workspace_id IS NULL OR p_target_user_id IS NULL OR p_expected_revision < 0
    OR p_action IS NULL OR p_action NOT IN ('remove', 'propose_transfer', 'accept_transfer') THEN
    RAISE EXCEPTION 'invalid access request';
  END IF;

  SELECT w.* INTO v_workspace
  FROM public.workspaces AS w
  WHERE w.id = p_workspace_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = w.id AND m.user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND OR v_workspace.status = 'deleted' THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF v_workspace.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'workspace conflict';
  END IF;

  v_new_revision := v_workspace.revision + 1;

  CASE p_action
    WHEN 'remove' THEN
      IF p_target_user_id = v_workspace.owner_id OR NOT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id
      ) THEN
        RAISE EXCEPTION 'workspace unavailable';
      END IF;

      UPDATE public.workspace_documents
      SET assignee_id = NULL, updated_at = now()
      WHERE workspace_id = p_workspace_id AND assignee_id = p_target_user_id;

      DELETE FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

      UPDATE public.workspaces
      SET pending_owner_id = CASE
            WHEN pending_owner_id = p_target_user_id THEN NULL
            ELSE pending_owner_id
          END,
          revision = v_new_revision,
          access_epoch = access_epoch + 1,
          updated_at = now()
      WHERE id = p_workspace_id;

    WHEN 'propose_transfer' THEN
      IF v_user_id <> v_workspace.owner_id OR p_target_user_id = v_workspace.owner_id
        OR NOT EXISTS (
          SELECT 1 FROM public.workspace_members
          WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id
        ) THEN
        RAISE EXCEPTION 'workspace unavailable';
      END IF;

      UPDATE public.workspaces
      SET pending_owner_id = p_target_user_id,
          revision = v_new_revision,
          updated_at = now()
      WHERE id = p_workspace_id;

    WHEN 'accept_transfer' THEN
      IF v_user_id <> p_target_user_id
        OR v_workspace.pending_owner_id IS DISTINCT FROM v_user_id
        OR NOT EXISTS (
          SELECT 1 FROM public.workspace_members
          WHERE workspace_id = p_workspace_id AND user_id = v_user_id
        ) THEN
        RAISE EXCEPTION 'workspace unavailable';
      END IF;

      UPDATE public.workspaces
      SET owner_id = v_user_id,
          pending_owner_id = NULL,
          revision = v_new_revision,
          access_epoch = access_epoch + 1,
          updated_at = now()
      WHERE id = p_workspace_id;
  END CASE;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, actor_id, action,
    before_revision, after_revision, target_user_id
  )
  VALUES (
    p_request_id, v_fingerprint, p_workspace_id, v_user_id, p_action,
    v_workspace.revision, v_new_revision, p_target_user_id
  );

  RETURN v_new_revision;
END;
$$;

CREATE FUNCTION public.change_workspace_state(
  p_workspace_id uuid,
  p_action text,
  p_expected_revision bigint,
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
  v_new_revision bigint;
BEGIN
  IF v_user_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_fingerprint := private.workspace_request_fingerprint(jsonb_build_object(
    'rpc', 'change_workspace_state',
    'actor', v_user_id,
    'workspace', p_workspace_id,
    'action', p_action,
    'expected_revision', p_expected_revision
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.workspace_audit_events
  WHERE operation_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.after_revision;
  END IF;

  IF p_workspace_id IS NULL OR p_expected_revision < 0
    OR p_action IS NULL OR p_action NOT IN ('archive', 'reopen', 'delete', 'restore') THEN
    RAISE EXCEPTION 'invalid state request';
  END IF;

  SELECT w.* INTO v_workspace
  FROM public.workspaces AS w
  WHERE w.id = p_workspace_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = w.id AND m.user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF p_action IN ('delete', 'restore') AND v_workspace.owner_id <> v_user_id THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF v_workspace.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'workspace conflict';
  END IF;

  IF (p_action = 'archive' AND v_workspace.status <> 'active')
    OR (p_action = 'reopen' AND v_workspace.status <> 'archived')
    OR (p_action = 'delete' AND v_workspace.status = 'deleted')
    OR (p_action = 'restore' AND (
      v_workspace.status <> 'deleted'
      OR v_workspace.deleted_at < now() - interval '30 days'
    )) THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;

  v_new_revision := v_workspace.revision + 1;
  UPDATE public.workspaces
  SET status = CASE p_action
        WHEN 'archive' THEN 'archived'
        WHEN 'reopen' THEN 'active'
        WHEN 'delete' THEN 'deleted'
        WHEN 'restore' THEN 'active'
      END,
      deleted_at = CASE WHEN p_action = 'delete' THEN now() ELSE NULL END,
      revision = v_new_revision,
      updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_audit_events (
    operation_id, request_fingerprint, workspace_id, actor_id, action,
    before_revision, after_revision
  )
  VALUES (
    p_request_id, v_fingerprint, p_workspace_id, v_user_id, p_action,
    v_workspace.revision, v_new_revision
  );

  RETURN v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text, text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_workspace_document(uuid, uuid, text, text, uuid[], uuid, boolean, text, bigint, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_workspace_access(uuid, text, uuid, bigint, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_workspace_state(uuid, text, bigint, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_document(uuid, uuid, text, text, uuid[], uuid, boolean, text, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_workspace_access(uuid, text, uuid, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_workspace_state(uuid, text, bigint, uuid) TO authenticated;
