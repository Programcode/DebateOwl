BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id) VALUES
  ('e1111111-1111-4111-8111-111111111111'),
  ('e2222222-2222-4222-8222-222222222222');

SELECT ok(
  has_table_privilege('authenticated', 'public.debate_context_pins', 'SELECT')
    AND has_table_privilege('authenticated', 'public.debate_context_pins', 'INSERT')
    AND has_table_privilege('authenticated', 'public.debate_context_pins', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.debate_context_pins', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.debate_context_pins', 'SELECT')
    AND has_table_privilege('service_role', 'public.debate_context_pins', 'SELECT')
    AND has_table_privilege('service_role', 'public.debate_context_pins', 'INSERT')
    AND has_table_privilege('service_role', 'public.debate_context_pins', 'UPDATE')
    AND has_table_privilege('service_role', 'public.debate_context_pins', 'DELETE'),
  'signed-in clients can read, add, and remove pins; anonymous callers cannot'
);

INSERT INTO public.debates (id, user_id, motion) VALUES
  ('ea000000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'This House would ban homework'),
  ('ea000000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'This House would abolish zoos');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', true);

SELECT lives_ok(
  $$INSERT INTO public.debate_context_pins (user_id, debate_id, item_kind, item_id)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'ea000000-0000-4000-8000-000000000001', 'case', 'eb000000-0000-4000-8000-000000000001')$$,
  'a student can pin a result in their own debate'
);
SELECT throws_ok(
  $$INSERT INTO public.debate_context_pins (user_id, debate_id, item_kind, item_id)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'ea000000-0000-4000-8000-000000000002', 'case', 'eb000000-0000-4000-8000-000000000002')$$,
  '23503',
  NULL,
  'a pin cannot point at another user''s debate'
);
SELECT throws_ok(
  $$INSERT INTO public.debate_context_pins (user_id, debate_id, item_kind, item_id)
    VALUES ('e2222222-2222-4222-8222-222222222222', 'ea000000-0000-4000-8000-000000000002', 'case', 'eb000000-0000-4000-8000-000000000003')$$,
  '42501',
  NULL,
  'a student cannot write pins for another user'
);
SELECT throws_ok(
  $$INSERT INTO public.debate_context_pins (user_id, debate_id, item_kind, item_id)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'ea000000-0000-4000-8000-000000000001', 'flowchart', 'eb000000-0000-4000-8000-000000000004')$$,
  '23514',
  NULL,
  'only results a request can read can be pinned'
);

SELECT set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
SELECT is(
  (SELECT count(*) FROM public.debate_context_pins)::integer,
  0,
  'another user sees none of the pins'
);
SELECT is_empty(
  $$DELETE FROM public.debate_context_pins RETURNING item_id$$,
  'another user cannot remove the pins'
);

SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', true);
SELECT is(
  (SELECT count(*) FROM public.debate_context_pins)::integer,
  1,
  'the owner still sees their pin'
);

DELETE FROM public.debates WHERE id = 'ea000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.debate_context_pins)::integer,
  0,
  'deleting a debate removes its pins'
);

SELECT * FROM finish();
ROLLBACK;
