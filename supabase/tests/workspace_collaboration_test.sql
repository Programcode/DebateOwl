BEGIN;
SELECT plan(19);

SELECT has_table(
  'private',
  'workspace_document_state',
  'canonical workspace document state is private'
);
SELECT has_table(
  'private',
  'workspace_document_updates',
  'durable workspace updates are private'
);
SELECT has_function(
  'public',
  'create_workspace_document',
  ARRAY['uuid', 'text', 'text', 'uuid', 'bigint', 'uuid'],
  'members create or duplicate files through one transactional RPC'
);
SELECT has_trigger(
  'public',
  'workspace_members',
  'workspace_members_notify_access_revoked_after_delete',
  'member removal notifies the collaboration fence after commit'
);
SELECT has_table('public', 'workspace_versions', 'version metadata is member-readable');
SELECT has_function(
  'public', 'create_workspace_version',
  ARRAY['uuid', 'uuid', 'text', 'bigint', 'uuid'],
  'members create named or automatic versions through one RPC'
);
SELECT has_function(
  'public', 'restore_workspace_version',
  ARRAY['uuid', 'uuid', 'uuid', 'bigint', 'uuid'],
  'restore compares the previewed sequence through one RPC'
);
SELECT has_function(
  'public', 'get_workspace_version_snapshot',
  ARRAY['uuid', 'uuid', 'uuid'],
  'preview returns private version bytes only through an authorized RPC'
);

INSERT INTO auth.users (id) VALUES
  ('71111111-1111-4111-8111-111111111111'),
  ('72222222-2222-4222-8222-222222222222');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace(
    'Version motion', 'Version workspace', 'en',
    '70000000-0000-4000-8000-000000000001'
  )$$,
  'version tests create one workspace'
);
RESET ROLE;
SELECT set_config(
  'test.version_workspace_id',
  (SELECT id::text FROM public.workspaces WHERE owner_id = '71111111-1111-4111-8111-111111111111'),
  true
);
SELECT set_config(
  'test.version_document_id',
  (SELECT id::text FROM public.workspace_documents
    WHERE workspace_id = current_setting('test.version_workspace_id')::uuid
    ORDER BY side, position LIMIT 1),
  true
);
UPDATE private.workspace_document_state
SET snapshot = decode('01', 'hex'), durable_sequence = 5
WHERE document_id = current_setting('test.version_document_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT ok(
  public.create_workspace_version(
    current_setting('test.version_workspace_id')::uuid,
    current_setting('test.version_document_id')::uuid,
    'Before edits', 5, '70000000-0000-4000-8000-000000000002'
  ) IS NOT NULL,
  'a current member saves a named version at the durable sequence'
);
RESET ROLE;
SELECT set_config(
  'test.version_id',
  (SELECT version_id::text FROM public.workspace_audit_events
    WHERE operation_id = '70000000-0000-4000-8000-000000000002'),
  true
);
UPDATE private.workspace_document_state
SET snapshot = decode('02', 'hex'), durable_sequence = 6
WHERE document_id = current_setting('test.version_document_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT snapshot_base64, current_sequence
    FROM public.get_workspace_version_snapshot(
      current_setting('test.version_workspace_id')::uuid,
      current_setting('test.version_document_id')::uuid,
      current_setting('test.version_id')::uuid
    )$$,
  $$VALUES ('AQ=='::text, 6::bigint)$$,
  'preview returns the selected snapshot and captures the current durable sequence'
);
SELECT throws_ok(
  $$SELECT public.restore_workspace_version(
    current_setting('test.version_workspace_id')::uuid,
    current_setting('test.version_document_id')::uuid,
    current_setting('test.version_id')::uuid,
    5, '70000000-0000-4000-8000-000000000003'
  )$$,
  'P0001', 'document conflict',
  'restore rejects a stale previewed sequence'
);
SELECT results_eq(
  $$SELECT public.restore_workspace_version(
    current_setting('test.version_workspace_id')::uuid,
    current_setting('test.version_document_id')::uuid,
    current_setting('test.version_id')::uuid,
    6, '70000000-0000-4000-8000-000000000004'
  )$$,
  ARRAY[1::bigint],
  'restore starts a new document epoch'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT state.epoch, state.durable_sequence, state.snapshot, document.document_epoch
    FROM private.workspace_document_state state
    JOIN public.workspace_documents document ON document.id = state.document_id
    WHERE state.document_id = current_setting('test.version_document_id')::uuid$$,
  $$VALUES (1::bigint, 0::bigint, decode('01', 'hex'), 1::bigint)$$,
  'restore installs the previewed snapshot and synchronizes the public epoch'
);
SELECT results_eq(
  $$SELECT string_agg(kind, ',' ORDER BY created_at, kind)
    FROM public.workspace_versions
    WHERE document_id = current_setting('test.version_document_id')::uuid$$,
  ARRAY['named,pre_restore'::text],
  'restore keeps both the named target and a pre-restore version'
);
SELECT results_eq(
  $$SELECT data.snapshot
    FROM private.workspace_version_data data
    JOIN public.workspace_versions version ON version.id = data.version_id
    WHERE version.document_id = current_setting('test.version_document_id')::uuid
      AND version.kind = 'pre_restore'$$,
  ARRAY[decode('02', 'hex')],
  'the pre-restore version preserves the replaced content'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM private.workspace_document_updates
    WHERE document_id = current_setting('test.version_document_id')::uuid AND epoch = 1$$,
  ARRAY[0::bigint],
  'old updates never enter the restored epoch'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_versions$$,
  ARRAY[0::bigint],
  'an outsider reads no version metadata'
);
SELECT results_eq(
  $$SELECT count(*)::bigint
    FROM public.get_workspace_version_snapshot(
      current_setting('test.version_workspace_id')::uuid,
      current_setting('test.version_document_id')::uuid,
      current_setting('test.version_id')::uuid
    )$$,
  ARRAY[0::bigint],
  'an outsider cannot retrieve private version bytes'
);

SELECT * FROM finish();
ROLLBACK;
