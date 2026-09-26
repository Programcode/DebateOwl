BEGIN;
SELECT plan(31);

INSERT INTO auth.users (id) VALUES
  ('d1111111-1111-4111-8111-111111111111'),
  ('d2222222-2222-4222-8222-222222222222');

SELECT ok(
  has_table_privilege('authenticated', 'public.debates', 'SELECT,INSERT,UPDATE,DELETE')
    AND has_table_privilege('authenticated', 'public.current_debates', 'SELECT,INSERT,UPDATE,DELETE')
    AND has_table_privilege('authenticated', 'public.crossfires', 'SELECT,INSERT,UPDATE,DELETE')
    AND has_function_privilege('authenticated', 'public.attach_to_debate(text, uuid, uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.attach_to_debate(text, uuid, uuid, text)', 'EXECUTE'),
  'signed-in clients can manage debates and attach work; anonymous callers cannot'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.purge_legacy_debate_material(timestamptz)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'private.purge_legacy_debate_material(timestamptz)', 'EXECUTE'),
  'the one-time legacy purge is not callable through the Data API'
);

-- Owner A: two debates, as a student preparing two different motions.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', true);
INSERT INTO public.debates (id, user_id, motion, last_activity_at) VALUES
  ('da000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'This House would ban homework', now() - interval '6 days'),
  ('da000000-0000-4000-8000-000000000002', 'd1111111-1111-4111-8111-111111111111', 'This House would abolish zoos', now() - interval '6 days');

SELECT lives_ok(
  $$INSERT INTO public.current_debates (user_id, debate_id)
    VALUES ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000001')$$,
  'a user can make their own debate current'
);
SELECT lives_ok(
  $$INSERT INTO public.current_debates (user_id, debate_id)
    VALUES ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000002')
    ON CONFLICT (user_id) DO UPDATE SET debate_id = EXCLUDED.debate_id, updated_at = now()$$,
  'switching replaces the single current debate'
);
SELECT is(
  (SELECT debate_id FROM public.current_debates),
  'da000000-0000-4000-8000-000000000002'::uuid,
  'exactly one current debate follows the user after switching'
);

SELECT throws_ok(
  $$INSERT INTO public.sources (user_id, title, content, type)
    VALUES ('d1111111-1111-4111-8111-111111111111', 'Loose', 'No debate', 'text')$$,
  '23514',
  'a source must belong to a debate',
  'new sources cannot be created outside a debate'
);

INSERT INTO public.sources (user_id, debate_id, title, content, type) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000001', 'Homework study', 'Homework evidence', 'text'),
  ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000002', 'Zoo study', 'Zoo evidence', 'text');
SELECT is(
  (SELECT array_agg(title) FROM public.sources WHERE debate_id = 'da000000-0000-4000-8000-000000000001'),
  ARRAY['Homework study'],
  'each debate sees only its own sources'
);
SELECT throws_ok(
  $$UPDATE public.sources SET debate_id = NULL WHERE title = 'Homework study'$$,
  '23514',
  'a source must belong to a debate',
  'an attached source cannot be detached into a global library'
);
SELECT ok(
  (SELECT last_activity_at > now() - interval '1 minute' FROM public.debates WHERE id = 'da000000-0000-4000-8000-000000000001'),
  'adding a source counts as meaningful work'
);

INSERT INTO public.cases (user_id, debate_id, side, title, input, output) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000002', 'con', 'Zoo case', '{}', '{}');
SELECT ok(
  (SELECT last_activity_at > now() - interval '1 minute' FROM public.debates WHERE id = 'da000000-0000-4000-8000-000000000002'),
  'saving a result counts as meaningful work'
);
SELECT throws_ok(
  $$INSERT INTO public.cases (user_id, debate_id, side, title, input, output)
    VALUES ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000002', 'sideways', 'Bad', '{}', '{}')$$,
  '23514',
  NULL,
  'results record only A favor, En contra, both, or neutral'
);

-- Owner B cannot see, reuse, or point at A's debates.
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222222', true);
SELECT is((SELECT count(*) FROM public.debates), 0::bigint, 'debates are private to their owner');
SELECT is((SELECT count(*) FROM public.sources), 0::bigint, 'sources in another user''s debate stay private');
SELECT throws_ok(
  $$INSERT INTO public.current_debates (user_id, debate_id)
    VALUES ('d2222222-2222-4222-8222-222222222222', 'da000000-0000-4000-8000-000000000001')$$,
  '23503',
  NULL,
  'another user''s debate cannot become current'
);
SELECT throws_ok(
  $$INSERT INTO public.sources (user_id, debate_id, title, content, type)
    VALUES ('d2222222-2222-4222-8222-222222222222', 'da000000-0000-4000-8000-000000000001', 'Forged', 'x', 'text')$$,
  '23503',
  NULL,
  'a source cannot be filed into another user''s debate'
);
SELECT throws_ok(
  $$INSERT INTO public.cases (user_id, debate_id, title, input, output)
    VALUES ('d2222222-2222-4222-8222-222222222222', 'da000000-0000-4000-8000-000000000001', 'Forged', '{}', '{}')$$,
  '23503',
  NULL,
  'a result cannot be filed into another user''s debate'
);

INSERT INTO public.cases (id, user_id, title, input, output) VALUES
  ('dc000000-0000-4000-8000-000000000009', 'd2222222-2222-4222-8222-222222222222', 'B one-off', '{}', '{}');
SELECT throws_ok(
  $$SELECT public.attach_to_debate('case', 'dc000000-0000-4000-8000-000000000009', 'da000000-0000-4000-8000-000000000001')$$,
  'P0002',
  'debate not found',
  'one-off work cannot be attached to another user''s debate'
);

-- Back to A: attach one-off and legacy work only after explicit confirmation.
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', true);
INSERT INTO public.attacks (id, user_id, title, input, output) VALUES
  ('dc000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'One-off attack', '{}', '{}');
SELECT lives_ok(
  $$SELECT public.attach_to_debate('attack', 'dc000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'pro')$$,
  'one-off work can be attached to one of the owner''s debates'
);
SELECT is(
  (SELECT debate_id::text || ':' || side FROM public.attacks WHERE id = 'dc000000-0000-4000-8000-000000000001'),
  'da000000-0000-4000-8000-000000000001:pro',
  'attachment records the debate and side'
);
SELECT throws_ok(
  $$SELECT public.attach_to_debate('attack', 'dc000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000002')$$,
  'P0002',
  'item not found or already in a debate',
  'attached work cannot be silently moved into another debate'
);
SELECT throws_ok(
  $$SELECT public.attach_to_debate('case', 'dc000000-0000-4000-8000-000000000009', 'da000000-0000-4000-8000-000000000001')$$,
  'P0002',
  'item not found or already in a debate',
  'another user''s one-off work cannot be pulled into a debate'
);

RESET ROLE;
INSERT INTO public.sparring_sessions (id, user_id, motion, user_side, persona, status) VALUES
  ('dc000000-0000-4000-8000-000000000002', 'd1111111-1111-4111-8111-111111111111', 'This House would ban homework', 'con', 'coach', 'complete');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', true);
SELECT lives_ok(
  $$SELECT public.attach_to_debate('sparring', 'dc000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000001', 'con')$$,
  'server-written sparring rounds attach through the RPC'
);

DELETE FROM public.debates WHERE id = 'da000000-0000-4000-8000-000000000002';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.sources WHERE title = 'Zoo study')
    AND NOT EXISTS (SELECT 1 FROM public.cases WHERE title = 'Zoo case')
    AND NOT EXISTS (SELECT 1 FROM public.current_debates),
  'deleting a debate removes its sources, results, and current pointer'
);
SELECT is(
  (SELECT count(*) FROM public.sources WHERE debate_id = 'da000000-0000-4000-8000-000000000001'),
  1::bigint,
  'deleting one debate leaves the other debate intact'
);
RESET ROLE;

-- The one-time cleanup. Pretend Current Debate shipped 60 days ago, so legacy
-- work is anything created before that and quiet since 90 days ago.
SELECT is(
  (SELECT count(*) FROM private.current_debate_rollout),
  1::bigint,
  'the schema migration records exactly one rollout time'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'private.current_debate_rollout', 'SELECT,UPDATE,DELETE'),
  'clients cannot read or move the rollout time'
);

INSERT INTO public.cases (user_id, title, input, output, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old', '{}', '{}', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge recent', '{}', '{}', now() - interval '70 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge after rollout', '{}', '{}', now() - interval '40 days');
INSERT INTO public.attacks (user_id, title, input, output, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old', '{}', '{}', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge recent', '{}', '{}', now() - interval '70 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge after rollout', '{}', '{}', now() - interval '40 days');
INSERT INTO public.brainstorms (user_id, title, input, output, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old', '{}', '{}', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge recent', '{}', '{}', now() - interval '70 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge after rollout', '{}', '{}', now() - interval '40 days');
INSERT INTO public.factoids (user_id, title, input, output, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old', '{}', '{}', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge recent', '{}', '{}', now() - interval '70 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge after rollout', '{}', '{}', now() - interval '40 days');
INSERT INTO public.cases (user_id, debate_id, title, input, output, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'da000000-0000-4000-8000-000000000001', 'Purge debate work', '{}', '{}', now() - interval '200 days');
ALTER TABLE public.sources DISABLE TRIGGER sources_require_debate;
INSERT INTO public.sources (user_id, title, content, type, created_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old source', 'x', 'text', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge recent source', 'x', 'text', now() - interval '70 days');
ALTER TABLE public.sources ENABLE TRIGGER sources_require_debate;
INSERT INTO public.flowcharts (user_id, title, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old flow', now() - interval '100 days', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge edited flow', now() - interval '100 days', now() - interval '5 days');
INSERT INTO public.sparring_sessions (user_id, motion, user_side, persona, status, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'Purge old round', 'pro', 'coach', 'complete', now() - interval '100 days', now() - interval '100 days'),
  ('d1111111-1111-4111-8111-111111111111', 'Purge resumed round', 'pro', 'coach', 'complete', now() - interval '100 days', now() - interval '80 days');
INSERT INTO public.chats (id, user_id, title, created_at) VALUES
  ('dc000000-0000-4000-8000-000000000003', 'd1111111-1111-4111-8111-111111111111', 'Purge old chat', now() - interval '100 days'),
  ('dc000000-0000-4000-8000-000000000004', 'd1111111-1111-4111-8111-111111111111', 'Purge active chat', now() - interval '100 days');
INSERT INTO public.messages (chat_id, role, content, created_at) VALUES
  ('dc000000-0000-4000-8000-000000000003', 'user', 'old message', now() - interval '95 days'),
  ('dc000000-0000-4000-8000-000000000004', 'user', 'first message', now() - interval '100 days'),
  ('dc000000-0000-4000-8000-000000000004', 'user', 'recent message', now() - interval '1 day');

SELECT private.purge_legacy_debate_material(now() - interval '60 days');

SELECT is(
  (SELECT array_agg(kind || ': ' || title ORDER BY kind, title) FROM (
    SELECT 'attacks' AS kind, title FROM public.attacks WHERE title LIKE 'Purge %'
    UNION ALL SELECT 'brainstorms', title FROM public.brainstorms WHERE title LIKE 'Purge %'
    UNION ALL SELECT 'cases', title FROM public.cases WHERE title LIKE 'Purge %'
    UNION ALL SELECT 'factoids', title FROM public.factoids WHERE title LIKE 'Purge %'
  ) AS survivors),
  ARRAY[
    'attacks: Purge after rollout', 'attacks: Purge recent',
    'brainstorms: Purge after rollout', 'brainstorms: Purge recent',
    'cases: Purge after rollout', 'cases: Purge debate work', 'cases: Purge recent',
    'factoids: Purge after rollout', 'factoids: Purge recent'
  ],
  'only legacy results quiet for 30 days before rollout go; recent, later one-off, and debate work stay'
);
SELECT is(
  (SELECT array_agg(title ORDER BY title) FROM public.sources WHERE title LIKE 'Purge %'),
  ARRAY['Purge recent source'],
  'recent unsorted sources remain for the user to confirm'
);
SELECT is(
  (SELECT array_agg(title ORDER BY title) FROM public.flowcharts WHERE title LIKE 'Purge %'),
  ARRAY['Purge edited flow'],
  'an old flowchart edited recently is kept'
);
SELECT is(
  (SELECT array_agg(motion ORDER BY motion) FROM public.sparring_sessions WHERE motion LIKE 'Purge %'),
  ARRAY['Purge resumed round'],
  'an old sparring round with recent activity is kept'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.chats WHERE id = 'dc000000-0000-4000-8000-000000000003')
    AND NOT EXISTS (SELECT 1 FROM public.messages WHERE chat_id = 'dc000000-0000-4000-8000-000000000003')
    AND (SELECT count(*) FROM public.messages WHERE chat_id = 'dc000000-0000-4000-8000-000000000004') = 2,
  'quiet old chats go with their messages; an old chat with a recent message stays whole'
);

SELECT * FROM finish();
ROLLBACK;
