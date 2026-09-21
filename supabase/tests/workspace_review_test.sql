BEGIN;
SELECT plan(20);

SELECT has_table('public', 'workspace_proposals', 'proposal metadata is persisted');
SELECT has_table('public', 'workspace_comments', 'inline comments are persisted');
SELECT has_table('public', 'workspace_comment_replies', 'comment replies are persisted');
SELECT has_table('public', 'workspace_notifications', 'mention notifications are persisted');
SELECT has_function('public', 'create_workspace_proposal', ARRAY['uuid', 'uuid', 'uuid', 'bigint', 'bigint', 'jsonb'], 'proposal creation is authorized');
SELECT has_function('public', 'create_workspace_comment', ARRAY['uuid', 'uuid', 'uuid', 'jsonb', 'text', 'uuid[]'], 'comment creation is authorized');
SELECT has_function('public', 'reply_workspace_comment', ARRAY['uuid', 'uuid', 'uuid', 'text'], 'comment replies are authorized');
SELECT has_function('public', 'resolve_workspace_comment', ARRAY['uuid', 'uuid', 'boolean'], 'comment resolution is authorized');

INSERT INTO auth.users (id) VALUES
  ('81111111-1111-4111-8111-111111111111'),
  ('82222222-2222-4222-8222-222222222222'),
  ('83333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace('Review motion', 'Review workspace', 'en', '80000000-0000-4000-8000-000000000001')$$,
  'review tests create a workspace'
);
RESET ROLE;
SELECT set_config('test.review_workspace', (SELECT id::text FROM public.workspaces WHERE owner_id = '81111111-1111-4111-8111-111111111111'), true);
SELECT set_config('test.review_document', (SELECT id::text FROM public.workspace_documents WHERE workspace_id = current_setting('test.review_workspace')::uuid ORDER BY side, position LIMIT 1), true);
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES (current_setting('test.review_workspace')::uuid, '82222222-2222-4222-8222-222222222222');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.create_workspace_proposal(
    current_setting('test.review_workspace')::uuid,
    current_setting('test.review_document')::uuid,
    '80000000-0000-4000-8000-000000000002', 0, 0,
    jsonb_build_object(
      'id', '80000000-0000-4000-8000-000000000002',
      'authorId', '81111111-1111-4111-8111-111111111111',
      'documentEpoch', 0,
      'baseStateVector', jsonb_build_array(),
      'hunks', jsonb_build_array(jsonb_build_object('id', 'hunk-1'))
    )
  )$$,
  ARRAY['80000000-0000-4000-8000-000000000002'::uuid],
  'a member persists a proposal at the current durable sequence'
);
SELECT results_eq(
  $$SELECT public.create_workspace_comment(
    current_setting('test.review_workspace')::uuid,
    current_setting('test.review_document')::uuid,
    '80000000-0000-4000-8000-000000000003',
    jsonb_build_object(
      'id', '80000000-0000-4000-8000-000000000003',
      'documentEpoch', 0,
      'from', jsonb_build_array(1),
      'to', jsonb_build_array(2),
      'quote', 'claim'
    ),
    'Please verify this claim.',
    ARRAY['82222222-2222-4222-8222-222222222222'::uuid]
  )$$,
  ARRAY['80000000-0000-4000-8000-000000000003'::uuid],
  'a member creates an anchored comment with a member mention'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT recipient_id FROM public.workspace_notifications WHERE comment_id = '80000000-0000-4000-8000-000000000003'$$,
  ARRAY['82222222-2222-4222-8222-222222222222'::uuid],
  'a mention notifies only the selected workspace member'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.reply_workspace_comment(
    current_setting('test.review_workspace')::uuid,
    '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000004',
    'I will check it.'
  )$$,
  ARRAY['80000000-0000-4000-8000-000000000004'::uuid],
  'a teammate replies to the inline comment'
);
SELECT results_eq(
  $$SELECT public.resolve_workspace_comment(
    current_setting('test.review_workspace')::uuid,
    '80000000-0000-4000-8000-000000000003', true
  )$$,
  ARRAY[true],
  'a teammate resolves the comment'
);
SELECT throws_ok(
  $$SELECT public.create_workspace_comment(
    current_setting('test.review_workspace')::uuid,
    current_setting('test.review_document')::uuid,
    '80000000-0000-4000-8000-000000000007',
    jsonb_build_object('id', '80000000-0000-4000-8000-000000000007', 'from', jsonb_build_array(1), 'to', jsonb_build_array(2)),
    'Missing quote', ARRAY[]::uuid[]
  )$$,
  'P0001', 'invalid comment request',
  'comments require a bounded detached quote'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_notifications$$,
  ARRAY[1::bigint],
  'the mentioned teammate reads their notification'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '83333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_proposals$$,
  ARRAY[0::bigint],
  'an outsider reads no proposals'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_comments$$,
  ARRAY[0::bigint],
  'an outsider reads no comments'
);
SELECT throws_ok(
  $$SELECT public.create_workspace_comment(
    current_setting('test.review_workspace')::uuid,
    current_setting('test.review_document')::uuid,
    '80000000-0000-4000-8000-000000000005',
    jsonb_build_object('id', '80000000-0000-4000-8000-000000000005', 'from', jsonb_build_array(1), 'to', jsonb_build_array(2), 'quote', 'claim'),
    'Forged comment', ARRAY[]::uuid[]
  )$$,
  'P0001', 'workspace unavailable',
  'an outsider cannot create a comment'
);
SELECT throws_ok(
  $$SELECT public.create_workspace_proposal(
    current_setting('test.review_workspace')::uuid,
    current_setting('test.review_document')::uuid,
    '80000000-0000-4000-8000-000000000006', 0, 0,
    jsonb_build_object('id', '80000000-0000-4000-8000-000000000006', 'authorId', '83333333-3333-4333-8333-333333333333', 'documentEpoch', 0, 'hunks', jsonb_build_array(jsonb_build_object('id', 'hunk')))
  )$$,
  'P0001', 'workspace unavailable',
  'an outsider cannot create a proposal'
);

SELECT * FROM finish();
ROLLBACK;
