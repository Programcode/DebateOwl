BEGIN;
SELECT plan(9);

-- get_shared_item counts each viewer once per share per UTC day (SC-04).
INSERT INTO auth.users (id) VALUES
  ('e1111111-1111-4111-8111-111111111111'),
  ('e2222222-2222-4222-8222-222222222222');
INSERT INTO public.shared_items (share_code, item_type, item_data, title, created_by) VALUES
  ('pgtap-views-a', 'case', '{}', 'Share A', 'e1111111-1111-4111-8111-111111111111'),
  ('pgtap-views-b', 'case', '{}', 'Share B', 'e1111111-1111-4111-8111-111111111111');

CREATE FUNCTION pg_temp.views(p_code text) RETURNS integer LANGUAGE sql AS $$
  SELECT view_count FROM public.shared_items WHERE share_code = p_code
$$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', true);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-a')),
  1,
  'the first anonymous view counts'
);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-a')),
  1,
  'reloading from the same address does not count again, and still returns the share'
);
SELECT set_config('request.headers', '{"x-forwarded-for": "198.51.100.4"}', true);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-a')),
  2,
  'a viewer from another address counts'
);
-- The edge sets cf-connecting-ip; a client cannot dodge it by varying x-forwarded-for.
SELECT set_config('request.headers', '{"cf-connecting-ip": "192.0.2.9", "x-forwarded-for": "1.1.1.1"}', true);
SELECT public.get_shared_item('pgtap-views-a');
SELECT set_config('request.headers', '{"cf-connecting-ip": "192.0.2.9", "x-forwarded-for": "2.2.2.2"}', true);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-a')),
  3,
  'cf-connecting-ip identifies the viewer ahead of x-forwarded-for'
);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-b')),
  1,
  'a viewer already counted on one share still counts on another'
);
SELECT throws_ok(
  $$SELECT * FROM public.share_views$$,
  '42501',
  NULL,
  'anonymous callers cannot read view records'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.headers', '{"x-forwarded-for": "203.0.113.50"}', true);
SELECT public.get_shared_item('pgtap-views-a');
SELECT set_config('request.headers', '{"x-forwarded-for": "203.0.113.51"}', true);
SELECT is(
  (SELECT view_count FROM public.get_shared_item('pgtap-views-a')),
  4,
  'a signed-in viewer counts once, whatever address they reload from'
);
SELECT throws_ok(
  $$INSERT INTO public.share_views (share_id, viewed_on, viewer_key)
    SELECT id, current_date, '\x00' FROM public.get_shared_item('pgtap-views-b')$$,
  '42501',
  NULL,
  'signed-in callers cannot write view records'
);
RESET ROLE;

-- Without request headers (direct SQL callers) the lookup still works.
SELECT set_config('request.headers', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT title FROM public.get_shared_item('pgtap-views-b')),
  'Share B',
  'a caller without request headers still reads the share'
);

SELECT * FROM finish();
ROLLBACK;
