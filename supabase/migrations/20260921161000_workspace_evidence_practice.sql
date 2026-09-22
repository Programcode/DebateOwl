ALTER TABLE private.workspace_document_state
  ADD COLUMN text_projection text NOT NULL DEFAULT '' CHECK (length(text_projection) <= 100000);
ALTER TABLE private.workspace_version_data
  ADD COLUMN text_projection text NOT NULL DEFAULT '' CHECK (length(text_projection) <= 100000);

CREATE FUNCTION private.capture_workspace_version_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT state.text_projection INTO NEW.text_projection
  FROM public.workspace_versions AS version
  JOIN private.workspace_document_state AS state ON state.document_id = version.document_id
  WHERE version.id = NEW.version_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_version_data_capture_text_before_insert
  BEFORE INSERT ON private.workspace_version_data
  FOR EACH ROW EXECUTE FUNCTION private.capture_workspace_version_text();

CREATE FUNCTION private.restore_workspace_state_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot AND NEW.text_projection IS NOT DISTINCT FROM OLD.text_projection THEN
    SELECT data.text_projection INTO NEW.text_projection
    FROM private.workspace_version_data AS data
    JOIN public.workspace_versions AS version ON version.id = data.version_id
    WHERE version.document_id = NEW.document_id AND data.snapshot = NEW.snapshot
    ORDER BY version.created_at DESC LIMIT 1;
    NEW.text_projection := coalesce(NEW.text_projection, '');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_document_state_restore_text_before_update
  BEFORE UPDATE OF snapshot ON private.workspace_document_state
  FOR EACH ROW EXECUTE FUNCTION private.restore_workspace_state_text();

CREATE TABLE public.workspace_sources (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 100000),
  source_type text NOT NULL CHECK (source_type IN ('url', 'file', 'text')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  citation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE public.workspace_threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  active_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE public.workspace_thread_messages (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 50000),
  status text NOT NULL CHECK (status IN ('progress', 'interrupted', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, thread_id) REFERENCES public.workspace_threads(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (thread_id, request_id, role)
);

CREATE TABLE public.workspace_artifacts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id uuid,
  document_epoch bigint CHECK (document_epoch IS NULL OR document_epoch >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  tool text NOT NULL CHECK (tool IN ('generate', 'factoids', 'brainstorm', 'attack', 'ask', 'flowchart', 'crossfire', 'sparring')),
  status text NOT NULL CHECK (status IN ('progress', 'interrupted', 'complete')),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, document_id) REFERENCES public.workspace_documents(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (created_by, request_id)
);

CREATE INDEX workspace_sources_workspace_created_idx ON public.workspace_sources(workspace_id, created_at DESC);
CREATE INDEX workspace_threads_workspace_updated_idx ON public.workspace_threads(workspace_id, updated_at DESC);
CREATE INDEX workspace_thread_messages_thread_created_idx ON public.workspace_thread_messages(thread_id, created_at);
CREATE INDEX workspace_artifacts_workspace_updated_idx ON public.workspace_artifacts(workspace_id, updated_at DESC);

ALTER TABLE public.workspace_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_sources_select_member ON public.workspace_sources
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_threads_select_member ON public.workspace_threads
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_thread_messages_select_member ON public.workspace_thread_messages
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));
CREATE POLICY workspace_artifacts_select_member ON public.workspace_artifacts
  FOR SELECT TO authenticated USING ((SELECT private.is_current_workspace_member(workspace_id)));

REVOKE ALL ON TABLE public.workspace_sources, public.workspace_threads,
  public.workspace_thread_messages, public.workspace_artifacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workspace_sources, public.workspace_threads,
  public.workspace_thread_messages, public.workspace_artifacts TO authenticated;

CREATE FUNCTION private.require_active_workspace_member(p_workspace_id uuid)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_workspace public.workspaces%ROWTYPE;
BEGIN
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_workspace.status <> 'active' OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  RETURN v_workspace;
END;
$$;
REVOKE ALL ON FUNCTION private.require_active_workspace_member(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_workspace_source(
  p_workspace_id uuid, p_source_id uuid, p_title text, p_content text,
  p_source_type text, p_provenance jsonb, p_citation_snapshot jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_existing public.workspace_sources%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_source_id IS NULL OR p_provenance IS NULL OR p_citation_snapshot IS NULL
    OR p_source_type NOT IN ('url', 'file', 'text')
    OR length(btrim(p_title)) NOT BETWEEN 1 AND 300 OR length(p_content) NOT BETWEEN 1 AND 100000
    OR octet_length(convert_to(p_provenance::text, 'UTF8')) > 32768
    OR octet_length(convert_to(p_citation_snapshot::text, 'UTF8')) > 32768 THEN
    RAISE EXCEPTION 'invalid source';
  END IF;
  PERFORM private.require_active_workspace_member(p_workspace_id);
  SELECT * INTO v_existing FROM public.workspace_sources WHERE id = p_source_id;
  IF FOUND THEN
    IF v_existing.workspace_id <> p_workspace_id OR v_existing.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.workspace_sources (
    id, workspace_id, created_by, title, content, source_type, provenance, citation_snapshot
  ) VALUES (
    p_source_id, p_workspace_id, auth.uid(), btrim(p_title), p_content,
    p_source_type, p_provenance, p_citation_snapshot
  );
  RETURN p_source_id;
END;
$$;

CREATE FUNCTION public.create_workspace_thread(p_workspace_id uuid, p_thread_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_thread_id IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid thread';
  END IF;
  PERFORM private.require_active_workspace_member(p_workspace_id);
  INSERT INTO public.workspace_threads (id, workspace_id, created_by, name)
  VALUES (p_thread_id, p_workspace_id, auth.uid(), btrim(p_name))
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_threads
    WHERE id = p_thread_id AND workspace_id = p_workspace_id AND created_by = auth.uid()
  ) THEN RAISE EXCEPTION 'operation ID conflict'; END IF;
  RETURN p_thread_id;
END;
$$;

CREATE FUNCTION public.save_workspace_thread_message(
  p_workspace_id uuid, p_thread_id uuid, p_message_id uuid, p_request_id uuid,
  p_role text, p_content text, p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.workspace_thread_messages%ROWTYPE;
  v_active_request_id uuid;
  v_thread_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_message_id IS NULL OR p_request_id IS NULL
    OR p_role <> 'user' OR p_status <> 'complete'
    OR length(p_content) NOT BETWEEN 1 AND 50000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  PERFORM private.require_active_workspace_member(p_workspace_id);
  SELECT active_request_id, updated_at INTO v_active_request_id, v_thread_updated_at FROM public.workspace_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF v_active_request_id IS NOT NULL AND v_active_request_id <> p_request_id
    AND v_thread_updated_at > now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'thread generation in progress';
  END IF;
  IF v_active_request_id IS NOT NULL AND v_active_request_id <> p_request_id THEN
    UPDATE public.workspace_thread_messages SET status = 'interrupted', updated_at = now()
    WHERE thread_id = p_thread_id AND request_id = v_active_request_id AND status = 'progress';
  END IF;
  UPDATE public.workspace_threads SET active_request_id = p_request_id, updated_at = now() WHERE id = p_thread_id;
  SELECT * INTO v_existing FROM public.workspace_thread_messages
  WHERE thread_id = p_thread_id AND request_id = p_request_id AND role = p_role;
  IF FOUND THEN
    UPDATE public.workspace_thread_messages SET content = p_content, status = p_status, updated_at = now()
    WHERE id = v_existing.id AND author_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.workspace_thread_messages (
    id, workspace_id, thread_id, author_id, request_id, role, content, status
  ) VALUES (p_message_id, p_workspace_id, p_thread_id, auth.uid(), p_request_id, p_role, p_content, p_status);
  RETURN p_message_id;
END;
$$;

CREATE FUNCTION public.start_workspace_thread_generation(
  p_user_id uuid, p_workspace_id uuid, p_thread_id uuid, p_user_message_id uuid,
  p_assistant_message_id uuid, p_request_id uuid, p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_request_id uuid;
  v_thread_updated_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_user_message_id IS NULL OR p_assistant_message_id IS NULL
    OR p_request_id IS NULL OR length(p_content) NOT BETWEEN 1 AND 50000
    OR NOT EXISTS (
      SELECT 1 FROM public.workspaces AS workspace
      JOIN public.workspace_members AS member ON member.workspace_id = workspace.id
      WHERE workspace.id = p_workspace_id AND workspace.status = 'active' AND member.user_id = p_user_id
    )
  THEN RAISE EXCEPTION 'invalid message'; END IF;
  SELECT active_request_id, updated_at INTO v_active_request_id, v_thread_updated_at
  FROM public.workspace_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF v_active_request_id IS NOT NULL AND v_active_request_id <> p_request_id
    AND v_thread_updated_at > now() - interval '5 minutes'
  THEN RAISE EXCEPTION 'thread generation in progress'; END IF;
  IF v_active_request_id IS NOT NULL AND v_active_request_id <> p_request_id THEN
    UPDATE public.workspace_thread_messages SET status = 'interrupted', updated_at = now()
    WHERE thread_id = p_thread_id AND request_id = v_active_request_id AND status = 'progress';
  END IF;
  INSERT INTO public.workspace_thread_messages (
    id, workspace_id, thread_id, author_id, request_id, role, content, status
  ) VALUES (
    p_user_message_id, p_workspace_id, p_thread_id, p_user_id, p_request_id, 'user', p_content, 'complete'
  ) ON CONFLICT (thread_id, request_id, role) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_thread_messages
    WHERE thread_id = p_thread_id AND request_id = p_request_id
      AND role = 'user' AND author_id = p_user_id AND content = p_content
  ) THEN RAISE EXCEPTION 'operation ID conflict'; END IF;
  INSERT INTO public.workspace_thread_messages (
    id, workspace_id, thread_id, author_id, request_id, role, content, status
  ) VALUES (
    p_assistant_message_id, p_workspace_id, p_thread_id, p_user_id, p_request_id, 'assistant', 'Thinking…', 'progress'
  ) ON CONFLICT (thread_id, request_id, role) DO NOTHING;
  UPDATE public.workspace_threads SET active_request_id = p_request_id, updated_at = now() WHERE id = p_thread_id;
  RETURN (SELECT id FROM public.workspace_thread_messages
    WHERE thread_id = p_thread_id AND request_id = p_request_id AND role = 'assistant');
END;
$$;

CREATE FUNCTION public.complete_workspace_thread_generation(
  p_user_id uuid, p_workspace_id uuid, p_thread_id uuid,
  p_request_id uuid, p_content text, p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_status NOT IN ('complete', 'interrupted')
    OR length(p_content) NOT BETWEEN 1 AND 50000
    OR p_status = 'complete' AND NOT EXISTS (
      SELECT 1 FROM public.workspaces AS workspace
      JOIN public.workspace_members AS member ON member.workspace_id = workspace.id
      WHERE workspace.id = p_workspace_id AND workspace.status = 'active' AND member.user_id = p_user_id
    ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  PERFORM 1 FROM public.workspace_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id AND active_request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  UPDATE public.workspace_thread_messages
  SET content = p_content, status = p_status, updated_at = now()
  WHERE workspace_id = p_workspace_id AND thread_id = p_thread_id
    AND request_id = p_request_id AND role = 'assistant' AND author_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  UPDATE public.workspace_threads SET active_request_id = NULL, updated_at = now() WHERE id = p_thread_id;
END;
$$;

CREATE FUNCTION public.save_workspace_artifact(
  p_workspace_id uuid, p_artifact_id uuid, p_request_id uuid, p_document_id uuid,
  p_document_epoch bigint, p_tool text, p_status text, p_input_snapshot jsonb,
  p_output_snapshot jsonb, p_progress jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_existing public.workspace_artifacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_artifact_id IS NULL OR p_request_id IS NULL
    OR p_tool NOT IN ('generate', 'factoids', 'brainstorm', 'attack', 'ask', 'flowchart', 'crossfire', 'sparring')
    OR p_status NOT IN ('progress', 'interrupted', 'complete') OR p_input_snapshot IS NULL OR p_progress IS NULL
    OR p_document_epoch IS NOT NULL AND p_document_epoch < 0
    OR octet_length(convert_to(p_input_snapshot::text, 'UTF8')) > 262144
    OR octet_length(convert_to(coalesce(p_output_snapshot, '{}'::jsonb)::text, 'UTF8')) > 1048576
    OR octet_length(convert_to(p_progress::text, 'UTF8')) > 262144 THEN
    RAISE EXCEPTION 'invalid artifact';
  END IF;
  PERFORM private.require_active_workspace_member(p_workspace_id);
  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_documents
    WHERE id = p_document_id AND workspace_id = p_workspace_id AND document_epoch = p_document_epoch
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  SELECT * INTO v_existing FROM public.workspace_artifacts
  WHERE created_by = auth.uid() AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.workspace_id <> p_workspace_id OR v_existing.tool <> p_tool
      OR v_existing.document_id IS DISTINCT FROM p_document_id
      OR v_existing.document_epoch IS DISTINCT FROM p_document_epoch THEN
      RAISE EXCEPTION 'operation ID conflict';
    END IF;
    UPDATE public.workspace_artifacts
    SET status = p_status, output_snapshot = p_output_snapshot, progress = p_progress, updated_at = now()
    WHERE id = v_existing.id;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.workspace_artifacts (
    id, workspace_id, document_id, document_epoch, created_by, request_id,
    tool, status, input_snapshot, output_snapshot, progress
  ) VALUES (
    p_artifact_id, p_workspace_id, p_document_id, p_document_epoch, auth.uid(), p_request_id,
    p_tool, p_status, p_input_snapshot, p_output_snapshot, p_progress
  );
  RETURN p_artifact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_workspace_source(uuid, uuid, text, text, text, jsonb, jsonb),
  public.create_workspace_thread(uuid, uuid, text),
  public.save_workspace_thread_message(uuid, uuid, uuid, uuid, text, text, text),
  public.start_workspace_thread_generation(uuid, uuid, uuid, uuid, uuid, uuid, text),
  public.complete_workspace_thread_generation(uuid, uuid, uuid, uuid, text, text),
  public.save_workspace_artifact(uuid, uuid, uuid, uuid, bigint, text, text, jsonb, jsonb, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_source(uuid, uuid, text, text, text, jsonb, jsonb),
  public.create_workspace_thread(uuid, uuid, text),
  public.save_workspace_thread_message(uuid, uuid, uuid, uuid, text, text, text),
  public.save_workspace_artifact(uuid, uuid, uuid, uuid, bigint, text, text, jsonb, jsonb, jsonb)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_workspace_thread_generation(uuid, uuid, uuid, uuid, uuid, uuid, text),
  public.complete_workspace_thread_generation(uuid, uuid, uuid, uuid, text, text)
TO service_role;

CREATE FUNCTION public.get_workspace_ai_context(
  p_user_id uuid,
  p_workspace_id uuid,
  p_document_ids uuid[],
  p_source_ids uuid[],
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document_count integer;
  v_source_count integer;
BEGIN
  IF p_user_id IS NULL OR p_workspace_id IS NULL
    OR coalesce(array_length(p_document_ids, 1), 0) NOT BETWEEN 1 AND 12
    OR coalesce(array_length(p_source_ids, 1), 0) > 20
    OR NOT EXISTS (
      SELECT 1 FROM public.workspaces AS workspace
      JOIN public.workspace_members AS member ON member.workspace_id = workspace.id
      WHERE workspace.id = p_workspace_id AND workspace.status = 'active' AND member.user_id = p_user_id
    ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  SELECT count(*) INTO v_document_count FROM public.workspace_documents
  WHERE workspace_id = p_workspace_id AND id = ANY(p_document_ids);
  IF v_document_count <> array_length(p_document_ids, 1) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  SELECT count(*) INTO v_source_count FROM public.workspace_sources
  WHERE workspace_id = p_workspace_id AND id = ANY(coalesce(p_source_ids, ARRAY[]::uuid[]));
  IF v_source_count <> coalesce(array_length(p_source_ids, 1), 0) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;
  IF p_thread_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_threads WHERE workspace_id = p_workspace_id AND id = p_thread_id
  ) THEN RAISE EXCEPTION 'workspace unavailable'; END IF;

  RETURN jsonb_build_object(
    'workspace', (SELECT jsonb_build_object('motion', motion, 'title', title) FROM public.workspaces WHERE id = p_workspace_id),
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', document.id, 'title', document.title, 'side', document.side,
      'epoch', state.epoch, 'sequence', state.durable_sequence, 'text', state.text_projection
    ) ORDER BY document.side, document.position), '[]'::jsonb)
      FROM public.workspace_documents AS document
      JOIN private.workspace_document_state AS state ON state.document_id = document.id
      WHERE document.workspace_id = p_workspace_id AND document.id = ANY(p_document_ids)),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'content', content, 'provenance', provenance,
      'citationSnapshot', citation_snapshot
    ) ORDER BY created_at), '[]'::jsonb)
      FROM public.workspace_sources WHERE workspace_id = p_workspace_id AND id = ANY(coalesce(p_source_ids, ARRAY[]::uuid[]))),
    'messages', (SELECT coalesce(jsonb_agg(message ORDER BY message.created_at), '[]'::jsonb)
      FROM (SELECT role, content, created_at FROM public.workspace_thread_messages
        WHERE workspace_id = p_workspace_id AND thread_id = p_thread_id AND status = 'complete'
        ORDER BY created_at DESC LIMIT 12) AS message)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_workspace_ai_context(uuid, uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_ai_context(uuid, uuid, uuid[], uuid[], uuid) TO service_role;
