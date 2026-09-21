CREATE TABLE public.private_writing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('snippet', 'template')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  content jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(convert_to(content::text, 'UTF8')) <= 1048576),
  CHECK (octet_length(convert_to(provenance::text, 'UTF8')) <= 16384)
);

CREATE TABLE public.workspace_document_provenance (
  document_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  imported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('markdown', 'docx', 'google_docs')),
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, document_id) REFERENCES public.workspace_documents(workspace_id, id) ON DELETE CASCADE,
  CHECK (octet_length(convert_to(provenance::text, 'UTF8')) <= 32768)
);
ALTER TABLE public.workspace_document_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_document_provenance_select_member ON public.workspace_document_provenance
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
REVOKE ALL ON public.workspace_document_provenance FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_document_provenance TO authenticated;

CREATE FUNCTION public.save_workspace_document_provenance(
  p_workspace_id uuid,
  p_document_id uuid,
  p_source_kind text,
  p_provenance jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_source_kind NOT IN ('markdown', 'docx', 'google_docs')
    OR p_provenance IS NULL OR octet_length(convert_to(p_provenance::text, 'UTF8')) > 32768
    OR NOT private.is_current_workspace_member(p_workspace_id)
    OR NOT EXISTS (SELECT 1 FROM public.workspace_documents WHERE workspace_id = p_workspace_id AND id = p_document_id)
  THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  INSERT INTO public.workspace_document_provenance (
    document_id, workspace_id, imported_by, source_kind, provenance
  ) VALUES (p_document_id, p_workspace_id, auth.uid(), p_source_kind, p_provenance)
  ON CONFLICT (document_id) DO UPDATE SET
    imported_by = auth.uid(), source_kind = EXCLUDED.source_kind,
    provenance = EXCLUDED.provenance, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_workspace_document_provenance(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_document_provenance(uuid, uuid, text, jsonb) TO authenticated;

CREATE INDEX private_writing_items_user_updated_idx
  ON public.private_writing_items(user_id, updated_at DESC);

ALTER TABLE public.private_writing_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_writing_items_owner_select ON public.private_writing_items
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY private_writing_items_owner_insert ON public.private_writing_items
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY private_writing_items_owner_update ON public.private_writing_items
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY private_writing_items_owner_delete ON public.private_writing_items
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.private_writing_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_writing_items TO authenticated;

CREATE FUNCTION public.get_workspace_export_manifest(
  p_workspace_id uuid,
  p_artifact_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_include_review boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_manifest jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) OR coalesce(array_length(p_artifact_ids, 1), 0) > 50 THEN
    RAISE EXCEPTION 'workspace unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_artifact_ids, ARRAY[]::uuid[])) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_artifacts
      WHERE workspace_id = p_workspace_id AND id = requested.id
    )
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  SELECT jsonb_build_object(
    'capturedAt', now(),
    'workspace', jsonb_build_object(
      'id', workspace.id, 'motion', workspace.motion, 'title', workspace.title,
      'revision', workspace.revision
    ),
    'documents', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', document.id, 'title', document.title, 'side', document.side,
        'position', document.position, 'assigneeId', document.assignee_id,
        'epoch', state.epoch, 'sequence', state.durable_sequence,
        'snapshot', encode(state.snapshot, 'base64'),
        'provenance', (SELECT provenance FROM public.workspace_document_provenance WHERE document_id = document.id)
      ) ORDER BY document.side, document.position), '[]'::jsonb)
      FROM public.workspace_documents AS document
      JOIN private.workspace_document_state AS state ON state.document_id = document.id
      WHERE document.workspace_id = p_workspace_id AND document.state = 'active'
    ),
    'excluded', (
      SELECT jsonb_build_object(
        'archived', count(*) FILTER (WHERE state = 'archived'),
        'trashed', count(*) FILTER (WHERE state = 'trashed')
      ) FROM public.workspace_documents WHERE workspace_id = p_workspace_id
    ),
    'sources', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'citationSnapshot', citation_snapshot,
        'provenance', provenance
      ) ORDER BY created_at), '[]'::jsonb)
      FROM public.workspace_sources WHERE workspace_id = p_workspace_id
    ),
    'artifacts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'tool', tool, 'status', status, 'documentId', document_id,
        'output', output_snapshot, 'createdAt', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM public.workspace_artifacts
      WHERE workspace_id = p_workspace_id
        AND id = ANY(coalesce(p_artifact_ids, ARRAY[]::uuid[]))
    ),
    'reviews', CASE WHEN p_include_review THEN jsonb_build_object(
      'proposals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'documentId', document_id, 'authorId', author_id, 'payload', payload, 'createdAt', created_at
      ) ORDER BY created_at), '[]'::jsonb) FROM public.workspace_proposals WHERE workspace_id = p_workspace_id),
      'comments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'documentId', document_id, 'authorId', author_id, 'body', body,
        'resolvedAt', resolved_at, 'createdAt', created_at
      ) ORDER BY created_at), '[]'::jsonb) FROM public.workspace_comments WHERE workspace_id = p_workspace_id)
    ) ELSE NULL END
  ) INTO v_manifest
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id AND workspace.status <> 'deleted';

  IF v_manifest IS NULL THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  RETURN v_manifest;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_export_manifest(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_export_manifest(uuid, uuid[], boolean) TO authenticated;

CREATE TABLE public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  account_label text NOT NULL CHECK (length(account_label) BETWEEN 1 AND 200),
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  refresh_token_ciphertext text NOT NULL,
  access_token_ciphertext text,
  access_expires_at timestamptz,
  refresh_claim_id uuid,
  refresh_claimed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE TABLE public.google_file_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.google_connections(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('export')),
  provider_file_id text,
  status text NOT NULL DEFAULT 'progress' CHECK (status IN ('progress', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
ALTER TABLE public.google_file_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_file_operations FROM PUBLIC, anon, authenticated;

CREATE TABLE public.google_connection_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verifier_ciphertext text NOT NULL,
  nonce text NOT NULL,
  return_to text NOT NULL CHECK (return_to ~ '^/app(?:/|$)'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_connection_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_connection_states FROM PUBLIC, anon, authenticated;

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY google_connections_owner_select ON public.google_connections
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.google_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, email, account_label, scopes, status, created_at, updated_at)
  ON public.google_connections TO authenticated;

CREATE FUNCTION public.claim_google_connection_refresh(
  p_connection_id uuid,
  p_user_id uuid,
  p_claim_id uuid
)
RETURNS TABLE (
  access_token_ciphertext text,
  access_expires_at timestamptz,
  refresh_token_ciphertext text,
  claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  RETURN QUERY
  UPDATE public.google_connections
  SET refresh_claim_id = CASE
        WHEN google_connections.refresh_claim_id IS NULL OR google_connections.refresh_claimed_at < now() - interval '1 minute'
        THEN p_claim_id ELSE google_connections.refresh_claim_id END,
      refresh_claimed_at = CASE
        WHEN google_connections.refresh_claim_id IS NULL OR google_connections.refresh_claimed_at < now() - interval '1 minute'
        THEN now() ELSE google_connections.refresh_claimed_at END
  WHERE id = p_connection_id AND user_id = p_user_id AND status = 'active'
  RETURNING google_connections.access_token_ciphertext,
    google_connections.access_expires_at,
    google_connections.refresh_token_ciphertext,
    google_connections.refresh_claim_id = p_claim_id;
END;
$$;

CREATE FUNCTION public.finish_google_connection_refresh(
  p_connection_id uuid,
  p_claim_id uuid,
  p_access_token_ciphertext text,
  p_access_expires_at timestamptz,
  p_refresh_token_ciphertext text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated bigint;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  UPDATE public.google_connections
  SET access_token_ciphertext = p_access_token_ciphertext,
      access_expires_at = p_access_expires_at,
      refresh_token_ciphertext = coalesce(p_refresh_token_ciphertext, refresh_token_ciphertext),
      refresh_claim_id = NULL,
      refresh_claimed_at = NULL,
      updated_at = now()
  WHERE id = p_connection_id AND refresh_claim_id = p_claim_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_connection_refresh(uuid, uuid, uuid),
  public.finish_google_connection_refresh(uuid, uuid, text, timestamptz, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_connection_refresh(uuid, uuid, uuid),
  public.finish_google_connection_refresh(uuid, uuid, text, timestamptz, text)
TO service_role;
