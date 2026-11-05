BEGIN;
SELECT plan(11);

SELECT ok(
  NOT has_table_privilege('anon', 'public.published_demo_rounds', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.published_demo_rounds', 'SELECT,INSERT,UPDATE,DELETE'),
  'clients hold no privilege on the published rounds table, so the delete token hash and session id stay server-side'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.publish_demo_round(text, uuid, text, text, jsonb, boolean, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.publish_demo_round(text, uuid, text, text, jsonb, boolean, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.unpublish_demo_round(text, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.unpublish_demo_round(text, text)', 'EXECUTE'),
  'only the service role can publish or unpublish a round'
);

CREATE TEMP TABLE results (label text, status text, indexable boolean);
INSERT INTO results SELECT 'first', * FROM public.publish_demo_round(
  'aaaaaaaaaaaa', 'a1000000-0000-4000-8000-000000000001', 'This House would ban homework', 'for',
  '[{"argument":"a","rebuttal":"b","judgeNote":"c"}]', true, repeat('1', 64));
INSERT INTO results SELECT 'same-session', * FROM public.publish_demo_round(
  'bbbbbbbbbbbb', 'a1000000-0000-4000-8000-000000000001', 'This House would ban homework', 'for',
  '[{"argument":"a","rebuttal":"b","judgeNote":"c"}]', true, repeat('2', 64));
INSERT INTO results SELECT 'same-motion', * FROM public.publish_demo_round(
  'cccccccccccc', 'a1000000-0000-4000-8000-000000000002', '  this house would BAN homework ', 'for',
  '[{"argument":"a","rebuttal":"b","judgeNote":"c"}]', true, repeat('3', 64));
INSERT INTO results SELECT 'other-side', * FROM public.publish_demo_round(
  'dddddddddddd', 'a1000000-0000-4000-8000-000000000003', 'This House would ban homework', 'against',
  '[{"argument":"a","rebuttal":"b","judgeNote":"c"}]', true, repeat('4', 64));
INSERT INTO results SELECT 'thin', * FROM public.publish_demo_round(
  'eeeeeeeeeeee', 'a1000000-0000-4000-8000-000000000004', 'This House would abolish exams', 'for',
  '[{"argument":"a","rebuttal":"b","judgeNote":"c"}]', false, repeat('5', 64));

SELECT results_eq(
  $$SELECT label, status, indexable FROM results ORDER BY label$$,
  $$VALUES ('first', 'ok', true), ('other-side', 'ok', true), ('same-motion', 'ok', false),
           ('same-session', 'already_published', NULL::boolean), ('thin', 'ok', false)$$,
  'one page per session, and only the first indexable round on a motion and side stays indexable'
);

SET LOCAL ROLE anon;
SELECT is(
  (SELECT motion FROM public.get_published_demo_round('eeeeeeeeeeee')),
  'This House would abolish exams',
  'anyone can read a published round, indexable or not'
);
SELECT is_empty(
  $$SELECT * FROM public.get_published_demo_round('zzzzzzzzzzzz')$$,
  'an unknown slug returns no row'
);
SELECT set_eq(
  $$SELECT slug FROM public.list_published_demo_rounds(50)$$,
  ARRAY['aaaaaaaaaaaa', 'dddddddddddd'],
  'the listing holds the indexable rounds only'
);
SELECT is(
  (SELECT count(*)::integer FROM public.list_published_demo_rounds(1)),
  1,
  'the listing honours its limit'
);
SELECT throws_ok(
  $$SELECT * FROM public.published_demo_rounds$$,
  '42501',
  NULL,
  'anon cannot select the table directly'
);
RESET ROLE;

SELECT ok(
  NOT public.unpublish_demo_round('aaaaaaaaaaaa', repeat('9', 64)),
  'a wrong delete token removes nothing'
);
SELECT ok(
  public.unpublish_demo_round('aaaaaaaaaaaa', repeat('1', 64)),
  'the matching delete token removes the round'
);
SELECT is_empty(
  $$SELECT 1 FROM public.published_demo_rounds WHERE slug = 'aaaaaaaaaaaa'$$,
  'and the row is gone'
);

SELECT * FROM finish();
ROLLBACK;
