BEGIN;
SELECT plan(92);

INSERT INTO auth.users (id)
VALUES
  ('51111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222'),
  ('53333333-3333-4333-8333-333333333333'),
  ('54444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('56666666-6666-4666-8666-666666666666');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
  $$SELECT public.create_workspace(
    'English motion', 'English workspace', 'en', 'baaaaaaa-0000-4000-8000-000000000001'
  )$$,
  'an authenticated owner creates an English workspace'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '54444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace(
    'Spanish motion', 'Spanish workspace', 'es', 'baaaaaaa-0000-4000-8000-000000000002'
  )$$,
  'another owner creates a Spanish workspace'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '56666666-6666-4666-8666-666666666666', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.create_workspace(
    'Hungarian motion', 'Hungarian workspace', 'hu', 'baaaaaaa-0000-4000-8000-000000000003'
  )$$,
  'another owner creates a Hungarian workspace'
);

RESET ROLE;
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members$$,
  ARRAY[3::bigint],
  'creation atomically inserts one owner membership per workspace'
);
SELECT results_eq(
  $$SELECT w.initial_language, count(d.*)::bigint
    FROM public.workspaces w
    JOIN public.workspace_documents d ON d.workspace_id = w.id
    GROUP BY w.initial_language
    ORDER BY w.initial_language$$,
  $$VALUES ('en'::text, 8::bigint), ('es'::text, 8::bigint), ('hu'::text, 8::bigint)$$,
  'creation atomically inserts exactly eight documents per language'
);
SELECT results_eq(
  $$SELECT w.initial_language, d.side, string_agg(d.title, ',' ORDER BY d.position)
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    GROUP BY w.initial_language, d.side
    ORDER BY w.initial_language, d.side$$,
  $$VALUES
    ('en'::text, 'con'::text, 'Intro,R1,R2,Conclusion'::text),
    ('en'::text, 'pro'::text, 'Intro,R1,R2,Conclusion'::text),
    ('es'::text, 'con'::text, 'Intro,R1,R2,Conclusión'::text),
    ('es'::text, 'pro'::text, 'Intro,R1,R2,Conclusión'::text),
    ('hu'::text, 'con'::text, 'Intro,R1,R2,Összegzés'::text),
    ('hu'::text, 'pro'::text, 'Intro,R1,R2,Összegzés'::text)$$,
  'default documents use canonical sides, positions, and localized final titles'
);
SELECT results_eq(
  $$SELECT side, min(position), max(position), count(DISTINCT position)::bigint
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en'
    GROUP BY side ORDER BY side$$,
  $$VALUES ('con'::text, 0, 3, 4::bigint), ('pro'::text, 0, 3, 4::bigint)$$,
  'each side starts with positions zero through three'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.create_workspace(
    'English motion', 'English workspace', 'en', 'baaaaaaa-0000-4000-8000-000000000001'
  )$$,
  $$SELECT id FROM public.workspaces WHERE initial_language = 'en'$$,
  'an identical create replay returns the original workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces$$,
  ARRAY[1::bigint],
  'an identical create replay adds no workspace visible to the owner'
);
SELECT throws_ok(
  $$SELECT public.create_workspace(
    'Changed motion', 'English workspace', 'en', 'baaaaaaa-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'operation ID conflict',
  'a create request ID cannot be reused with different arguments'
);
SELECT throws_ok(
  $$SELECT public.create_workspace(
    '  ', NULL, 'en', 'baaaaaaa-0000-4000-8000-000000000004'
  )$$,
  'P0001', 'invalid workspace request',
  'workspace creation rejects an empty motion'
);

RESET ROLE;
INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, member_id
FROM public.workspaces
CROSS JOIN unnest(ARRAY[
  '52222222-2222-4222-8222-222222222222'::uuid,
  '53333333-3333-4333-8333-333333333333'::uuid,
  '55555555-5555-4555-8555-555555555555'::uuid
]) AS member_id
WHERE initial_language = 'en';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, '55555555-5555-4555-8555-555555555555'
FROM public.workspaces
WHERE initial_language = 'es';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT id, '52222222-2222-4222-8222-222222222222'
FROM public.workspaces
WHERE initial_language = 'hu';

UPDATE public.workspace_documents AS d
SET assignee_id = '55555555-5555-4555-8555-555555555555'
FROM public.workspaces AS w
WHERE w.id = d.workspace_id
  AND w.initial_language = 'en'
  AND d.side = 'con'
  AND d.position = 1;

SELECT set_config(
  'test.clear_assignment_document_id',
  (SELECT d.id::text
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en' AND d.side = 'con' AND d.position = 1),
  true
);

SELECT set_config(
  'test.foreign_document_id',
  (SELECT d.id::text
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'es'
    LIMIT 1),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'es'),
    'remove', '55555555-5555-4555-8555-555555555555', 0,
    'baaaaaaa-0000-4000-8000-000000000005'
  )$$,
  ARRAY[1::bigint],
  'a non-owner member can remove themselves'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces WHERE initial_language = 'es'$$,
  ARRAY[0::bigint],
  'self-removal revokes reads immediately'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '56666666-6666-4666-8666-666666666666', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'hu'),
    'propose_transfer', '52222222-2222-4222-8222-222222222222', 0,
    'baaaaaaa-0000-4000-8000-000000000006'
  )$$,
  ARRAY[1::bigint],
  'an owner can set a pending owner only to an existing member'
);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'hu'),
    'remove', '52222222-2222-4222-8222-222222222222', 1,
    'baaaaaaa-0000-4000-8000-000000000007'
  )$$,
  ARRAY[2::bigint],
  'the owner can remove a pending nominee safely'
);
SELECT results_eq(
  $$SELECT pending_owner_id, revision, access_epoch
    FROM public.workspaces WHERE initial_language = 'hu'$$,
  $$VALUES (NULL::uuid, 2::bigint, 1::bigint)$$,
  'removing a pending nominee clears pending ownership atomically'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    NULL, NULL, NULL, '52222222-2222-4222-8222-222222222222', true, NULL,
    0, 'baaaaaaa-0000-4000-8000-000000000010'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[1::bigint],
  'a document update assigns a member and increments the workspace revision once'
);
SELECT results_eq(
  $$SELECT d.title, d.assignee_id
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en' AND d.side = 'pro' AND d.position = 0$$,
  $$VALUES ('Intro'::text, '52222222-2222-4222-8222-222222222222'::uuid)$$,
  'the document update assigns the member without changing unrelated metadata'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    NULL, NULL, NULL, '52222222-2222-4222-8222-222222222222', true, NULL,
    0, 'baaaaaaa-0000-4000-8000-000000000010'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[1::bigint],
  'an identical document operation returns its original revision'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    NULL, NULL, NULL, '52222222-2222-4222-8222-222222222222', false, NULL,
    0, 'baaaaaaa-0000-4000-8000-000000000010'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'operation ID conflict',
  'the assignment-presence flag participates in the request fingerprint'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    'Stale', NULL, NULL, NULL, false, NULL,
    0, 'baaaaaaa-0000-4000-8000-000000000011'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'workspace conflict',
  'a stale document revision changes nothing'
);
SELECT results_eq(
  $$SELECT d.title, w.revision
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en' AND d.side = 'pro' AND d.position = 0$$,
  $$VALUES ('Intro'::text, 1::bigint)$$,
  'the stale document update leaves metadata and revision unchanged'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    current_setting('test.foreign_document_id')::uuid,
    'Cross workspace', NULL, NULL, NULL, false, NULL,
    1, 'baaaaaaa-0000-4000-8000-000000000012'
  )$$,
  'P0001', 'workspace unavailable',
  'a cross-workspace document reference returns the uniform unavailable error'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    NULL, NULL, NULL, '54444444-4444-4444-8444-444444444444', true, NULL,
    1, 'baaaaaaa-0000-4000-8000-000000000013'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'workspace unavailable',
  'a nonmember cannot be assigned to a document'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    'Opening', NULL, NULL, NULL, false, NULL,
    1, 'baaaaaaa-0000-4000-8000-000000000038'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[2::bigint],
  'an unrelated rename increments the workspace revision once'
);
SELECT results_eq(
  $$SELECT d.title, d.assignee_id, w.revision
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en' AND d.side = 'pro' AND d.position = 0$$,
  $$VALUES ('Opening'::text, '52222222-2222-4222-8222-222222222222'::uuid, 2::bigint)$$,
  'an unrelated rename preserves assignment'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND position = 0),
    NULL, NULL,
    (SELECT array_agg(id ORDER BY position DESC) FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND state = 'active'),
    NULL, false, NULL, 2, 'baaaaaaa-0000-4000-8000-000000000014'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[3::bigint],
  'an exact side list reorders documents and increments one revision'
);
SELECT results_eq(
  $$SELECT string_agg(d.title, ',' ORDER BY d.position)
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en' AND d.side = 'pro'$$,
  ARRAY['Conclusion,R2,R1,Opening'::text],
  'the exact reorder persists every supplied position'
);
SELECT results_eq(
  $$SELECT assignee_id FROM public.workspace_documents WHERE title = 'Opening'$$,
  ARRAY['52222222-2222-4222-8222-222222222222'::uuid],
  'an unrelated reorder preserves assignment'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' LIMIT 1),
    NULL, NULL,
    ARRAY[(SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' LIMIT 1),
          (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' LIMIT 1)],
    NULL, false, NULL, 3, 'baaaaaaa-0000-4000-8000-000000000015'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'invalid document order',
  'a duplicate or incomplete reorder list is rejected atomically'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' LIMIT 1),
    NULL, NULL,
    ARRAY(SELECT id FROM public.workspace_documents
      WHERE workspace_id = w.id AND side = 'pro' ORDER BY position LIMIT 3)
      || ARRAY[current_setting('test.foreign_document_id')::uuid],
    NULL, false, NULL, 3, 'baaaaaaa-0000-4000-8000-000000000034'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'invalid document order',
  'a reorder list containing a foreign document is rejected atomically'
);

SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, NULL, NULL, NULL, false, 'trashed',
    3, 'baaaaaaa-0000-4000-8000-000000000016'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[4::bigint],
  'a member can trash a document through the metadata RPC'
);
SELECT ok(
  (SELECT trashed_at IS NOT NULL
      AND trash_expires_at BETWEEN now() + interval '29 days' AND now() + interval '31 days'
      AND assignee_id = '52222222-2222-4222-8222-222222222222'
    FROM public.workspace_documents WHERE title = 'Opening'),
  'trash records a 30-day recovery deadline and preserves assignment'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, NULL, NULL, NULL, false, 'active',
    4, 'baaaaaaa-0000-4000-8000-000000000039'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'invalid document order',
  'restoring an inactive document without an exact side order fails atomically'
);
SELECT results_eq(
  $$SELECT d.state, d.position, d.assignee_id, w.revision,
      (SELECT string_agg(active.title || ':' || active.position, ',' ORDER BY active.position)
       FROM public.workspace_documents active
       WHERE active.workspace_id = w.id AND active.side = 'pro' AND active.state = 'active')
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE d.title = 'Opening'$$,
  $$VALUES (
    'trashed'::text,
    3,
    '52222222-2222-4222-8222-222222222222'::uuid,
    4::bigint,
    'Conclusion:0,R2:1,R1:2'::text
  )$$,
  'failed restore preserves document state, assignment, side order, and revision'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, NULL,
    (SELECT array_agg(id ORDER BY position)
      FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND state = 'active')
      || ARRAY[(SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening')],
    NULL, false, 'active',
    4, 'baaaaaaa-0000-4000-8000-000000000017'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[5::bigint],
  'a trashed document can be restored'
);
SELECT results_eq(
  $$SELECT state, trashed_at, trash_expires_at, assignee_id
    FROM public.workspace_documents WHERE title = 'Opening'$$,
  $$VALUES ('active'::text, NULL::timestamptz, NULL::timestamptz, '52222222-2222-4222-8222-222222222222'::uuid)$$,
  'restore clears recovery timestamps and retains a current member assignment'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, NULL, NULL, NULL, false, 'archived',
    5, 'baaaaaaa-0000-4000-8000-000000000029'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[6::bigint],
  'a document can be archived through the metadata RPC'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, NULL,
    (SELECT array_agg(id ORDER BY position)
      FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'pro' AND state = 'active')
      || ARRAY[(SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening')],
    NULL, false, 'active',
    6, 'baaaaaaa-0000-4000-8000-000000000030'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[7::bigint],
  'an archived document can be restored with its current assignment'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, 'con', NULL, NULL, false, NULL,
    7, 'baaaaaaa-0000-4000-8000-000000000040'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'invalid document order',
  'moving an active document without an exact destination order fails atomically'
);
SELECT results_eq(
  $$SELECT d.side, d.position, d.assignee_id, w.revision,
      (SELECT string_agg(active.title || ':' || active.position, ',' ORDER BY active.position)
       FROM public.workspace_documents active
       WHERE active.workspace_id = w.id AND active.side = 'con' AND active.state = 'active')
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE d.title = 'Opening'$$,
  $$VALUES (
    'pro'::text,
    3,
    '52222222-2222-4222-8222-222222222222'::uuid,
    7::bigint,
    'Intro:0,R1:1,R2:2,Conclusion:3'::text
  )$$,
  'failed side move preserves document metadata, destination order, and revision'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    w.id,
    (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening'),
    NULL, 'con',
    (SELECT array_agg(id ORDER BY position) FROM public.workspace_documents
      WHERE workspace_id = w.id AND side = 'con' AND state = 'active')
      || ARRAY[(SELECT id FROM public.workspace_documents WHERE workspace_id = w.id AND title = 'Opening')],
    NULL, false, NULL,
    7, 'baaaaaaa-0000-4000-8000-000000000035'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  ARRAY[8::bigint],
  'a document moves sides with an exact destination order'
);
SELECT results_eq(
  $$SELECT side, position, assignee_id FROM public.workspace_documents WHERE title = 'Opening'$$,
  $$VALUES ('con'::text, 4, '52222222-2222-4222-8222-222222222222'::uuid)$$,
  'the side move persists destination position and assignment'
);
SELECT set_config(
  'test.english_workspace_id',
  (SELECT id::text FROM public.workspaces WHERE initial_language = 'en'),
  true
);
SELECT set_config(
  'test.english_document_id',
  (SELECT id::text FROM public.workspace_documents WHERE title = 'Opening'),
  true
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    current_setting('test.clear_assignment_document_id')::uuid,
    NULL, NULL, NULL, NULL, true, NULL,
    8, 'baaaaaaa-0000-4000-8000-000000000041'
  )$$,
  ARRAY[9::bigint],
  'an explicit assignment change can clear an assignee'
);
SELECT results_eq(
  $$SELECT d.assignee_id, w.revision
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE d.id = current_setting('test.clear_assignment_document_id')::uuid$$,
  $$VALUES (NULL::uuid, 9::bigint)$$,
  'explicit clear stores NULL without affecting another document assignment'
);
SELECT results_eq(
  $$SELECT public.update_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    current_setting('test.english_document_id')::uuid,
    NULL, NULL, NULL, NULL, false, 'trashed',
    9, 'baaaaaaa-0000-4000-8000-000000000042'
  )$$,
  ARRAY[10::bigint],
  'trash after a side move preserves assignment and records a recovery deadline'
);

RESET ROLE;
UPDATE public.workspace_documents
SET trash_expires_at = now() - interval '1 second'
WHERE id = current_setting('test.english_document_id')::uuid;
SELECT set_config(
  'test.expired_document_trashed_at',
  (SELECT trashed_at::text FROM public.workspace_documents
    WHERE id = current_setting('test.english_document_id')::uuid),
  true
);
SELECT set_config(
  'test.expired_document_expires_at',
  (SELECT trash_expires_at::text FROM public.workspace_documents
    WHERE id = current_setting('test.english_document_id')::uuid),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id,
    current_setting('test.english_document_id')::uuid,
    NULL, NULL,
    (SELECT array_agg(id ORDER BY position)
      FROM public.workspace_documents WHERE workspace_id = w.id AND side = 'con' AND state = 'active')
      || ARRAY[current_setting('test.english_document_id')::uuid],
    NULL, false, 'active',
    10, 'baaaaaaa-0000-4000-8000-000000000043'
  )
  FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'workspace unavailable',
  'expired trash cannot be restored even with an exact destination order'
);
SELECT results_eq(
  $$SELECT d.state, d.trashed_at, d.trash_expires_at, d.assignee_id, w.revision,
      (SELECT string_agg(active.title || ':' || active.position, ',' ORDER BY active.position)
       FROM public.workspace_documents active
       WHERE active.workspace_id = w.id AND active.side = 'con' AND active.state = 'active')
    FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE d.id = current_setting('test.english_document_id')::uuid$$,
  $$VALUES (
    'trashed'::text,
    current_setting('test.expired_document_trashed_at')::timestamptz,
    current_setting('test.expired_document_expires_at')::timestamptz,
    '52222222-2222-4222-8222-222222222222'::uuid,
    10::bigint,
    'Intro:0,R1:1,R2:2,Conclusion:3'::text
  )$$,
  'expired restore failure preserves state, timestamps, assignment, order, and revision'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '52222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'archive', 10, 'baaaaaaa-0000-4000-8000-000000000020'
  )$$,
  ARRAY[11::bigint],
  'a current member can archive a workspace'
);
SELECT results_eq(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'archive', 10, 'baaaaaaa-0000-4000-8000-000000000020'
  )$$,
  ARRAY[11::bigint],
  'an identical member archive replay returns its original outcome'
);
SELECT throws_ok(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'reopen', 11, 'baaaaaaa-0000-4000-8000-000000000020'
  )$$,
  'P0001', 'operation ID conflict',
  'a workspace state operation ID cannot be reused with different arguments'
);
SELECT results_eq(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'reopen', 11, 'baaaaaaa-0000-4000-8000-000000000021'
  )$$,
  ARRAY[12::bigint],
  'a current member can reopen an archived workspace'
);
SELECT throws_ok(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'remove', '51111111-1111-4111-8111-111111111111', 12,
    'baaaaaaa-0000-4000-8000-000000000019'
  )$$,
  'P0001', 'workspace unavailable',
  'no member can remove the owner'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'remove', '52222222-2222-4222-8222-222222222222', 12,
    'baaaaaaa-0000-4000-8000-000000000022'
  )$$,
  ARRAY[13::bigint],
  'member removal increments revision and returns the committed outcome'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members
    WHERE user_id = '52222222-2222-4222-8222-222222222222'$$,
  ARRAY[0::bigint],
  'member removal deletes access immediately'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_documents
    WHERE assignee_id = '52222222-2222-4222-8222-222222222222'$$,
  ARRAY[0::bigint],
  'member removal clears every assignment atomically'
);
SELECT results_eq(
  $$SELECT revision, access_epoch FROM public.workspaces WHERE initial_language = 'en'$$,
  $$VALUES (13::bigint, 1::bigint)$$,
  'member removal increments the metadata revision and access epoch'
);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'remove', '52222222-2222-4222-8222-222222222222', 12,
    'baaaaaaa-0000-4000-8000-000000000022'
  )$$,
  ARRAY[13::bigint],
  'an identical removal replay returns its original outcome'
);
SELECT throws_ok(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'remove', '53333333-3333-4333-8333-333333333333', 13,
    'baaaaaaa-0000-4000-8000-000000000022'
  )$$,
  'P0001', 'operation ID conflict',
  'a removal operation ID cannot be reused with different arguments'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '52222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces$$,
  ARRAY[0::bigint],
  'a removed member immediately loses workspace reads'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    current_setting('test.english_workspace_id')::uuid,
    current_setting('test.english_document_id')::uuid,
    'Removed write', NULL, NULL, NULL, false, NULL, 13,
    'baaaaaaa-0000-4000-8000-000000000036'
  )$$,
  'P0001', 'workspace unavailable',
  'a removed member immediately loses workspace writes'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'propose_transfer', '54444444-4444-4444-8444-444444444444', 13,
    'baaaaaaa-0000-4000-8000-000000000037'
  )$$,
  'P0001', 'workspace unavailable',
  'ownership cannot be proposed to a nonmember'
);

SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'propose_transfer', '53333333-3333-4333-8333-333333333333', 13,
    'baaaaaaa-0000-4000-8000-000000000023'
  )$$,
  ARRAY[14::bigint],
  'the owner can nominate an existing member for ownership'
);
SELECT results_eq(
  $$SELECT pending_owner_id FROM public.workspaces WHERE initial_language = 'en'$$,
  ARRAY['53333333-3333-4333-8333-333333333333'::uuid],
  'the ownership nominee remains pending until acceptance'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'accept_transfer', '55555555-5555-4555-8555-555555555555', 14,
    'baaaaaaa-0000-4000-8000-000000000024'
  )$$,
  'P0001', 'workspace unavailable',
  'only the nominated member can accept ownership'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'accept_transfer', '53333333-3333-4333-8333-333333333333', 14,
    'baaaaaaa-0000-4000-8000-000000000025'
  )$$,
  ARRAY[15::bigint],
  'the nominated member accepts ownership atomically'
);
SELECT results_eq(
  $$SELECT owner_id, pending_owner_id, revision, access_epoch
    FROM public.workspaces WHERE initial_language = 'en'$$,
  $$VALUES ('53333333-3333-4333-8333-333333333333'::uuid, NULL::uuid, 15::bigint, 2::bigint)$$,
  'accepted transfer changes one owner, clears pending state, and increments epochs'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members
    WHERE workspace_id = (SELECT id FROM public.workspaces WHERE initial_language = 'en')
      AND user_id IN (
        '51111111-1111-4111-8111-111111111111',
        '53333333-3333-4333-8333-333333333333'
      )$$,
  ARRAY[2::bigint],
  'accepted transfer keeps both the old and new owners as members'
);
SELECT results_eq(
  $$SELECT public.change_workspace_access(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'accept_transfer', '53333333-3333-4333-8333-333333333333', 14,
    'baaaaaaa-0000-4000-8000-000000000025'
  )$$,
  ARRAY[15::bigint],
  'an identical transfer acceptance replay returns its original outcome'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'delete', 15, 'baaaaaaa-0000-4000-8000-000000000031'
  )$$,
  'P0001', 'workspace unavailable',
  'a non-owner cannot delete a workspace'
);

RESET ROLE;
SELECT lives_ok(
  $$DELETE FROM auth.users WHERE id = '51111111-1111-4111-8111-111111111111'$$,
  'after transfer the former owner account can be deleted'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspaces WHERE initial_language = 'en'$$,
  ARRAY[1::bigint],
  'deleting the former owner preserves the shared workspace'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_documents d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE w.initial_language = 'en'$$,
  ARRAY[8::bigint],
  'deleting the former owner preserves shared documents'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'delete', 15, 'baaaaaaa-0000-4000-8000-000000000026'
  )$$,
  ARRAY[16::bigint],
  'the current owner can soft-delete the workspace'
);
SELECT ok(
  (SELECT status = 'deleted' AND deleted_at IS NOT NULL
    FROM public.workspaces WHERE initial_language = 'en'),
  'soft deletion records deleted state and timestamp'
);
SELECT throws_ok(
  $$SELECT public.update_workspace_document(
    w.id, (SELECT id FROM public.workspace_documents WHERE workspace_id = w.id LIMIT 1),
    'Blocked', NULL, NULL, NULL, false, NULL, 16,
    'baaaaaaa-0000-4000-8000-000000000027'
  ) FROM public.workspaces w WHERE initial_language = 'en'$$,
  'P0001', 'workspace unavailable',
  'deleted workspaces reject collaboration mutations'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'restore', 16, 'baaaaaaa-0000-4000-8000-000000000032'
  )$$,
  'P0001', 'workspace unavailable',
  'a non-owner cannot restore a deleted workspace'
);

RESET ROLE;
UPDATE public.workspaces
SET deleted_at = now() - interval '31 days'
WHERE initial_language = 'en';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'restore', 16, 'baaaaaaa-0000-4000-8000-000000000033'
  )$$,
  'P0001', 'workspace unavailable',
  'a workspace cannot be restored after the recovery window'
);

RESET ROLE;
UPDATE public.workspaces SET deleted_at = now() WHERE initial_language = 'en';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT public.change_workspace_state(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'restore', 16, 'baaaaaaa-0000-4000-8000-000000000028'
  )$$,
  ARRAY[17::bigint],
  'the current owner can restore within the recovery window'
);
SELECT results_eq(
  $$SELECT status, deleted_at FROM public.workspaces WHERE initial_language = 'en'$$,
  $$VALUES ('active'::text, NULL::timestamptz)$$,
  'workspace restore clears deleted state'
);

SELECT results_eq(
  $$SELECT revision FROM public.create_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'Custom rebuttal', 'pro', NULL, 17,
    'baaaaaaa-0000-4000-8000-000000000044'
  )$$,
  ARRAY[18::bigint],
  'a member creates a custom file at the end of one side'
);
RESET ROLE;
SELECT set_config(
  'test.custom_document_id',
  (SELECT document_id::text FROM public.workspace_audit_events
    WHERE operation_id = 'baaaaaaa-0000-4000-8000-000000000044'),
  true
);
SELECT results_eq(
  $$SELECT title, side,
      position = (SELECT max(position) FROM public.workspace_documents sibling
        WHERE sibling.workspace_id = created.workspace_id
          AND sibling.side = created.side
          AND sibling.state = 'active'),
      state
    FROM public.workspace_documents
    AS created
    WHERE id = current_setting('test.custom_document_id')::uuid$$,
  $$VALUES ('Custom rebuttal'::text, 'pro'::text, true, 'active'::text)$$,
  'custom creation stores the requested metadata without disturbing default files'
);
UPDATE private.workspace_document_state
SET snapshot = decode('01020304', 'hex')
WHERE document_id = current_setting('test.custom_document_id')::uuid;
UPDATE public.workspace_documents
SET assignee_id = '55555555-5555-4555-8555-555555555555'
WHERE id = current_setting('test.custom_document_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT revision FROM public.create_workspace_document(
    current_setting('test.english_workspace_id')::uuid,
    'Custom rebuttal copy', 'con', current_setting('test.custom_document_id')::uuid, 18,
    'baaaaaaa-0000-4000-8000-000000000045'
  )$$,
  ARRAY[19::bigint],
  'duplication creates one independent file and revision'
);
RESET ROLE;
SELECT set_config(
  'test.duplicate_document_id',
  (SELECT document_id::text FROM public.workspace_audit_events
    WHERE operation_id = 'baaaaaaa-0000-4000-8000-000000000045'),
  true
);
SELECT results_eq(
  $$SELECT snapshot, epoch, durable_sequence
    FROM private.workspace_document_state
    WHERE document_id = current_setting('test.duplicate_document_id')::uuid$$,
  $$VALUES (decode('01020304', 'hex'), 0::bigint, 0::bigint)$$,
  'duplication copies only the accepted content snapshot into a fresh epoch'
);
SELECT results_eq(
  $$SELECT title, side, position, assignee_id, state
    FROM public.workspace_documents
    WHERE id = current_setting('test.duplicate_document_id')::uuid$$,
  $$VALUES ('Custom rebuttal copy'::text, 'con'::text, 4, NULL::uuid, 'active'::text)$$,
  'duplication does not copy assignment or lifecycle state'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM private.workspace_document_updates
    WHERE document_id = current_setting('test.duplicate_document_id')::uuid$$,
  ARRAY[0::bigint],
  'duplication does not copy live update history'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT document_id, revision FROM public.create_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'Custom rebuttal copy', 'con', current_setting('test.custom_document_id')::uuid, 18,
    'baaaaaaa-0000-4000-8000-000000000045'
  )$$,
  $$VALUES (current_setting('test.duplicate_document_id')::uuid, 19::bigint)$$,
  'an identical duplicate request replays the committed file'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_document(
    (SELECT id FROM public.workspaces WHERE initial_language = 'en'),
    'Foreign copy', 'pro', current_setting('test.foreign_document_id')::uuid, 19,
    'baaaaaaa-0000-4000-8000-000000000046'
  )$$,
  'P0001', 'workspace unavailable',
  'a cross-workspace duplicate source returns the uniform unavailable error'
);
SELECT results_eq(
  $$SELECT revision FROM public.workspaces WHERE initial_language = 'en'$$,
  ARRAY[19::bigint],
  'a rejected cross-workspace duplicate leaves the revision unchanged'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '54444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_document(
    current_setting('test.english_workspace_id')::uuid,
    'Outsider file', 'pro', NULL, 19,
    'baaaaaaa-0000-4000-8000-000000000047'
  )$$,
  'P0001', 'workspace unavailable',
  'an outsider cannot create a file in a foreign workspace'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$SELECT public.clear_current_user_data()$$,
  'personal data clearing remains available to a workspace owner'
);
SELECT results_eq(
  $$SELECT
      (SELECT count(*) FROM public.workspaces WHERE initial_language = 'en')::bigint,
      (SELECT count(*) FROM public.workspace_members WHERE workspace_id = (SELECT id FROM public.workspaces WHERE initial_language = 'en'))::bigint,
      (SELECT count(*) FROM public.workspace_documents WHERE workspace_id = (SELECT id FROM public.workspaces WHERE initial_language = 'en'))::bigint,
      (SELECT count(*) FROM public.workspace_audit_events WHERE workspace_id = (SELECT id FROM public.workspaces WHERE initial_language = 'en'))::bigint$$,
  $$VALUES (1::bigint, 2::bigint, 10::bigint, 20::bigint)$$,
  'personal data clearing preserves shared workspace rows and audit history'
);

SELECT * FROM finish();
ROLLBACK;
