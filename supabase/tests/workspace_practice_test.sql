BEGIN;
SELECT plan(32);

SELECT has_table('public', 'workspace_sources', 'shared sources exist');
SELECT has_table('public', 'workspace_threads', 'shared threads exist');
SELECT has_table('public', 'workspace_thread_messages', 'thread messages exist');
SELECT has_table('public', 'workspace_artifacts', 'practice artifacts exist');
SELECT has_function('public', 'save_workspace_source', ARRAY['uuid','uuid','text','text','text','jsonb','jsonb'], 'sources use an authorized RPC');
SELECT has_function('public', 'create_workspace_thread', ARRAY['uuid','uuid','text'], 'threads use an authorized RPC');
SELECT has_function('public', 'save_workspace_thread_message', ARRAY['uuid','uuid','uuid','uuid','text','text','text'], 'messages use an authorized RPC');
SELECT has_function('public', 'start_workspace_thread_generation', ARRAY['uuid','uuid','uuid','uuid','uuid','uuid','text'], 'thread generation starts atomically');
SELECT has_function('public', 'complete_workspace_thread_generation', ARRAY['uuid','uuid','uuid','uuid','text','text'], 'assistant completion stays server-owned');
SELECT has_function('public', 'save_workspace_artifact', ARRAY['uuid','uuid','uuid','uuid','bigint','text','text','jsonb','jsonb','jsonb'], 'artifacts use an authorized RPC');
SELECT ok(
  NOT has_function_privilege('anon', 'public.start_workspace_thread_generation(uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.complete_workspace_thread_generation(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.start_workspace_thread_generation(uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.complete_workspace_thread_generation(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.start_workspace_thread_generation(uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.complete_workspace_thread_generation(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE'),
  'thread generation RPCs are service-role only'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.capture_workspace_version_text()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'private.capture_workspace_version_text()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'private.capture_workspace_version_text()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'private.restore_workspace_state_text()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'private.restore_workspace_state_text()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'private.restore_workspace_state_text()', 'EXECUTE'),
  'workspace text projection triggers are not directly executable'
);

INSERT INTO auth.users (id) VALUES
  ('91111111-1111-4111-8111-111111111111'),
  ('92222222-2222-4222-8222-222222222222');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace('Practice motion', 'Practice workspace', 'en', '90000000-0000-4000-8000-000000000001')$$,
  'practice fixture creates a workspace'
);
RESET ROLE;
SELECT set_config('test.practice_workspace', (SELECT id::text FROM public.workspaces WHERE owner_id = '91111111-1111-4111-8111-111111111111'), true);
SELECT set_config('test.practice_document', (SELECT id::text FROM public.workspace_documents WHERE workspace_id = current_setting('test.practice_workspace')::uuid ORDER BY side, position LIMIT 1), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.save_workspace_source(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000002', 'Study', 'Quoted evidence', 'url',
    '{"url":"https://example.com/study"}', '{"title":"Study","url":"https://example.com/study"}'
  )$$,
  'a member copies evidence with provenance'
);
SELECT lives_ok(
  $$SELECT public.create_workspace_thread(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003', 'Both sides'
  )$$,
  'a member creates a named shared thread'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT results_eq(
  $$SELECT (public.start_workspace_thread_generation(
    '91111111-1111-4111-8111-111111111111',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000008',
    '90000000-0000-4000-8000-000000000005',
    'Compare both sides'
  )->>'claimed')::boolean$$,
  ARRAY[true],
  'the first thread request claims generation'
);
SELECT results_eq(
  $$SELECT (public.start_workspace_thread_generation(
    '91111111-1111-4111-8111-111111111111',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000008',
    '90000000-0000-4000-8000-000000000005',
    'Compare both sides'
  )->>'claimed')::boolean$$,
  ARRAY[false],
  'an identical retry does not claim another provider call'
);
SELECT throws_ok(
  $$SELECT public.start_workspace_thread_generation(
    '91111111-1111-4111-8111-111111111111',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000006',
    '90000000-0000-4000-8000-000000000013',
    '90000000-0000-4000-8000-000000000007',
    'Race'
  )$$,
  'P0001', 'thread generation in progress',
  'a thread serializes generation'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.save_workspace_thread_message(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000014',
    '90000000-0000-4000-8000-000000000005',
    'assistant', 'Forged answer', 'complete'
  )$$,
  'P0001', 'invalid message',
  'members cannot forge assistant messages'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.complete_workspace_thread_generation(
    '91111111-1111-4111-8111-111111111111',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000005',
    'Shared answer', 'complete'
  )$$,
  'server-owned assistant completion releases the thread'
);
SELECT results_eq(
  $$SELECT public.start_workspace_thread_generation(
    '91111111-1111-4111-8111-111111111111',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000008',
    '90000000-0000-4000-8000-000000000005',
    'Compare both sides'
  ) - 'assistantMessageId'$$,
  ARRAY['{"claimed": false, "content": "Shared answer", "status": "complete"}'::jsonb],
  'a completed retry returns its cached answer without reclaiming generation'
);
RESET ROLE;
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES (current_setting('test.practice_workspace')::uuid, '92222222-2222-4222-8222-222222222222');
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.start_workspace_thread_generation(
    '92222222-2222-4222-8222-222222222222',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000015',
    '90000000-0000-4000-8000-000000000016',
    '90000000-0000-4000-8000-000000000017',
    'Request before revocation'
  )$$,
  'server starts a teammate request'
);
RESET ROLE;
DELETE FROM public.workspace_members WHERE user_id = '92222222-2222-4222-8222-222222222222';
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.complete_workspace_thread_generation(
    '92222222-2222-4222-8222-222222222222',
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000017',
    'Generation interrupted', 'interrupted'
  )$$,
  'revocation still releases a matching pending request'
);
SELECT results_eq(
  $$SELECT active_request_id FROM public.workspace_threads WHERE id = '90000000-0000-4000-8000-000000000003'$$,
  ARRAY[NULL::uuid],
  'revoked request no longer blocks the thread'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.save_workspace_artifact(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000018',
    '90000000-0000-4000-8000-000000000019',
    current_setting('test.practice_document')::uuid, 99,
    'attack', 'complete', '{}', '{}', '{}'
  )$$,
  'P0001', 'workspace unavailable',
  'a stale document epoch cannot receive a result'
);
SELECT results_eq(
  $$SELECT public.save_workspace_artifact(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000009',
    '90000000-0000-4000-8000-000000000010',
    current_setting('test.practice_document')::uuid, 0,
    'attack', 'complete', '{"case":"R1"}', '{"score":80}', '{}'
  )$$,
  ARRAY['90000000-0000-4000-8000-000000000009'::uuid],
  'a completed result stays pinned to its origin'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_sources$$,
  ARRAY[1::bigint],
  'the member reads shared evidence'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_artifacts$$,
  ARRAY[1::bigint],
  'the member reads attached feedback'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '92222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq($$SELECT count(*)::bigint FROM public.workspace_sources$$, ARRAY[0::bigint], 'private outsider reads no workspace sources');
SELECT results_eq($$SELECT count(*)::bigint FROM public.workspace_threads$$, ARRAY[0::bigint], 'private outsider reads no shared chats');
SELECT results_eq($$SELECT count(*)::bigint FROM public.workspace_artifacts$$, ARRAY[0::bigint], 'private outsider reads no practice results');
SELECT throws_ok(
  $$SELECT public.save_workspace_artifact(
    current_setting('test.practice_workspace')::uuid,
    '90000000-0000-4000-8000-000000000011',
    '90000000-0000-4000-8000-000000000012',
    current_setting('test.practice_document')::uuid, 0,
    'attack', 'complete', '{}', '{}', '{}'
  )$$,
  'P0001', 'workspace unavailable',
  'foreign results cannot attach to a workspace'
);

SELECT * FROM finish();
ROLLBACK;
