BEGIN;
SELECT plan(16);

SELECT has_table('public', 'private_writing_items', 'private writing library exists');
SELECT has_table('public', 'workspace_document_provenance', 'workspace import provenance exists');
SELECT has_table('public', 'google_connections', 'separate Google connections exist');
SELECT has_table('public', 'google_file_operations', 'idempotent Google operations exist');
SELECT has_function('public', 'get_workspace_export_manifest', ARRAY['uuid','uuid[]','boolean'], 'packet export captures a server manifest');
SELECT has_function('public', 'save_workspace_document_provenance', ARRAY['uuid','uuid','text','jsonb'], 'imports record provenance through an RPC');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.private_writing_items'::regclass), 'private writing enables RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.google_connections'::regclass), 'Google connections enable RLS');

INSERT INTO auth.users (id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('a2222222-2222-4222-8222-222222222222'),
  ('a3333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace('Portable motion', 'Portable workspace', 'en', 'a0000000-0000-4000-8000-000000000001')$$,
  'owner creates a portable workspace'
);
SELECT lives_ok(
  $$INSERT INTO public.private_writing_items (user_id, kind, title, content)
    VALUES (auth.uid(), 'snippet', 'R1 paragraph', '{"type":"doc","content":[]}')$$,
  'owner saves private writing'
);
SELECT results_eq($$SELECT count(*)::bigint FROM public.private_writing_items$$, ARRAY[1::bigint], 'owner reads private writing');

RESET ROLE;
INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, 'a2222222-2222-4222-8222-222222222222' FROM public.workspaces
WHERE owner_id = 'a1111111-1111-4111-8111-111111111111';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq($$SELECT count(*)::bigint FROM public.private_writing_items$$, ARRAY[0::bigint], 'teammate cannot browse private writing');
SELECT lives_ok(
  $$SELECT public.save_workspace_document_provenance(
    (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() LIMIT 1),
    (SELECT document_id FROM private.workspace_document_state WHERE workspace_id = (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() LIMIT 1) LIMIT 1),
    'markdown', '{"fileName":"speech.md"}'
  )$$,
  'member records independent-copy provenance'
);
SELECT results_eq(
  $$SELECT jsonb_array_length(public.get_workspace_export_manifest(
    (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() LIMIT 1), ARRAY[]::uuid[], true
  )->'documents')::bigint$$,
  ARRAY[8::bigint],
  'member captures all active documents in one manifest'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.save_workspace_document_provenance(
    (SELECT id FROM public.workspaces LIMIT 1),
    (SELECT document_id FROM private.workspace_document_state LIMIT 1),
    'docx', '{}'
  )$$,
  'P0001', 'workspace unavailable',
  'outsider cannot attach import provenance'
);

RESET ROLE;
SELECT ok(NOT has_table_privilege('anon', 'public.private_writing_items', 'SELECT'), 'anonymous callers cannot read private writing');
SELECT ok(NOT has_column_privilege('authenticated', 'public.google_connections', 'refresh_token_ciphertext', 'SELECT'), 'browser cannot read encrypted refresh tokens');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_google_connection_refresh(uuid,uuid,uuid)', 'EXECUTE'), 'browser cannot claim token refresh');

SELECT * FROM finish();
ROLLBACK;
