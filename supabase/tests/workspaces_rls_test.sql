BEGIN;
SELECT plan(36);

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

SELECT has_table('public', 'workspaces', 'workspaces exists');
SELECT has_table('public', 'workspace_members', 'workspace_members exists');
SELECT has_table('public', 'workspace_documents', 'workspace_documents exists');
SELECT has_table('public', 'workspace_audit_events', 'workspace_audit_events exists');

SELECT results_eq(
  $$SELECT relrowsecurity
    FROM pg_class
    WHERE oid IN (
      'public.workspaces'::regclass,
      'public.workspace_members'::regclass,
      'public.workspace_documents'::regclass,
      'public.workspace_audit_events'::regclass
    )
    ORDER BY relname$$,
  ARRAY[true, true, true, true],
  'all workspace tables enable RLS'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.workspaces', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.workspace_members', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.workspace_documents', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.workspace_audit_events', 'SELECT'),
  'anonymous callers have no workspace table access'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.workspaces', 'SELECT')
    AND has_table_privilege('authenticated', 'public.workspace_members', 'SELECT')
    AND has_table_privilege('authenticated', 'public.workspace_documents', 'SELECT')
    AND has_table_privilege('authenticated', 'public.workspace_audit_events', 'SELECT'),
  'authenticated callers can select workspace rows allowed by RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.workspaces', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.workspace_members', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.workspace_documents', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.workspace_audit_events', 'INSERT,UPDATE,DELETE'),
  'authenticated callers cannot mutate workspace tables directly'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.create_workspace(text,text,text,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.update_workspace_document(uuid,uuid,text,text,uuid[],uuid,text,bigint,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.change_workspace_access(uuid,text,uuid,bigint,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.change_workspace_state(uuid,text,bigint,uuid)', 'EXECUTE'),
  'authenticated callers can execute the four named workspace RPCs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.create_workspace(text,text,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.update_workspace_document(uuid,uuid,text,text,uuid[],uuid,text,bigint,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.change_workspace_access(uuid,text,uuid,bigint,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.change_workspace_state(uuid,text,bigint,uuid)', 'EXECUTE'),
  'anonymous callers cannot execute workspace RPCs'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p,
      LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = ANY (ARRAY[
      'public.create_workspace(text,text,text,uuid)'::regprocedure,
      'public.update_workspace_document(uuid,uuid,text,text,uuid[],uuid,text,bigint,uuid)'::regprocedure,
      'public.change_workspace_access(uuid,text,uuid,bigint,uuid)'::regprocedure,
      'public.change_workspace_state(uuid,text,bigint,uuid)'::regprocedure
    ])
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute workspace RPCs'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.is_current_workspace_member(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'private.is_current_workspace_member(uuid)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_proc p,
        LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'private.is_current_workspace_member(uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
  'the private membership helper has the minimum policy-call grant'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace(
    'First motion', 'First workspace', 'en', 'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  'the first owner can create a workspace through the RPC'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace(
    'Second motion', 'Second workspace', 'en', 'aaaaaaaa-0000-4000-8000-000000000002'
  )$$,
  'another owner can create an independent workspace'
);

RESET ROLE;
INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, '22222222-2222-4222-8222-222222222222'
FROM public.workspaces
WHERE owner_id = '11111111-1111-4111-8111-111111111111';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces$$,
  ARRAY[1::bigint],
  'an owner reads only their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members$$,
  ARRAY[2::bigint],
  'an owner reads all members of their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_documents$$,
  ARRAY[8::bigint],
  'an owner reads all documents of their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_audit_events$$,
  ARRAY[1::bigint],
  'an owner reads their workspace audit events'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT title FROM public.workspaces$$,
  ARRAY['First workspace'::text],
  'a member reads their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members$$,
  ARRAY[2::bigint],
  'a member reads the membership roster for their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_documents$$,
  ARRAY[8::bigint],
  'a member reads documents from their workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_audit_events$$,
  ARRAY[1::bigint],
  'a member reads audit events from their workspace'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    (SELECT id FROM public.workspaces LIMIT 1),
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'Forged', NULL, NULL, NULL, NULL, 0,
    'aaaaaaaa-0000-4000-8000-000000000003'
  )$$,
  'P0001',
  'workspace unavailable',
  'a forged document ID returns the uniform unavailable error'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'Forged', NULL, NULL, NULL, NULL, 0,
    'aaaaaaaa-0000-4000-8000-000000000004'
  )$$,
  'P0001',
  'workspace unavailable',
  'a forged workspace ID returns the uniform unavailable error'
);
SELECT throws_ok(
  $$INSERT INTO public.workspace_members (workspace_id, user_id)
    SELECT id, '33333333-3333-4333-8333-333333333333' FROM public.workspaces LIMIT 1$$,
  '42501', NULL,
  'members cannot add another member directly'
);
SELECT throws_ok(
  $$UPDATE public.workspaces SET owner_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', NULL,
  'members cannot escalate ownership directly'
);
SELECT throws_ok(
  $$UPDATE public.workspace_documents SET assignee_id = '33333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'members cannot forge document assignments directly'
);
SELECT throws_ok(
  $$INSERT INTO public.workspace_audit_events (
      operation_id, request_fingerprint, workspace_id, actor_id, action
    )
    SELECT 'aaaaaaaa-0000-4000-8000-000000000005', '\\x00', id,
      '22222222-2222-4222-8222-222222222222', 'forged'
    FROM public.workspaces LIMIT 1$$,
  '42501', NULL,
  'members cannot forge audit events'
);
SELECT set_config(
  'test.workspace_id',
  (SELECT id::text FROM public.workspaces LIMIT 1),
  true
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces$$,
  ARRAY[0::bigint],
  'an outsider reads no workspaces'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members$$,
  ARRAY[0::bigint],
  'an outsider reads no workspace members'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_documents$$,
  ARRAY[0::bigint],
  'an outsider reads no workspace documents'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_audit_events$$,
  ARRAY[0::bigint],
  'an outsider reads no workspace audit events'
);
SELECT throws_ok(
  $$SELECT public.change_workspace_state(
    current_setting('test.workspace_id')::uuid,
    'archive', 0, 'aaaaaaaa-0000-4000-8000-000000000006'
  )$$,
  'P0001',
  'workspace unavailable',
  'an outsider cannot infer or mutate a workspace by ID'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT throws_ok(
  $$SELECT id FROM public.workspaces$$,
  '42501', NULL,
  'anonymous callers cannot select workspaces'
);
SELECT throws_ok(
  $$SELECT public.create_workspace(
    'Anonymous motion', NULL, 'en', 'aaaaaaaa-0000-4000-8000-000000000007'
  )$$,
  '42501', NULL,
  'anonymous callers cannot execute create_workspace'
);

RESET ROLE;
SELECT throws_ok(
  $$DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'$$,
  '23503', NULL,
  'the restrictive owner foreign key blocks raw owner deletion'
);

SELECT * FROM finish();
ROLLBACK;
