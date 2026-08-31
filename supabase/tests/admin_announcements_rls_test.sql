BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.admin_announcements (
  id,
  title,
  body,
  target_type,
  target_user_ids,
  starts_at,
  expires_at,
  created_by
)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Everyone', 'Visible to everyone.', 'all', NULL, now() - interval '1 hour', NULL, '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'For current user', 'Visible to the current user.', 'users', ARRAY['11111111-1111-4111-8111-111111111111']::uuid[], now() - interval '1 hour', NULL, '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'For another user', 'Not visible to the current user.', 'users', ARRAY['22222222-2222-4222-8222-222222222222']::uuid[], now() - interval '1 hour', NULL, '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'Future', 'Not active yet.', 'all', NULL, now() + interval '1 day', NULL, '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'Expired', 'No longer active.', 'all', NULL, now() - interval '2 days', now() - interval '1 day', '99999999-9999-4999-8999-999999999999');

SELECT throws_ok(
  $$INSERT INTO public.admin_announcements (title, body, target_type, target_user_ids, created_by)
    VALUES ('Missing recipients', 'This must fail.', 'users', NULL, '99999999-9999-4999-8999-999999999999')$$,
  '23514',
  NULL,
  'targeted announcements require a non-null recipient array'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.admin_announcements', 'title', 'SELECT'),
  'authenticated users can read public announcement fields'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.admin_announcements', 'target_user_ids', 'SELECT'),
  'authenticated users cannot read recipient UUID arrays'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.admin_announcements', 'SELECT'),
  'anonymous callers cannot read announcements'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT results_eq(
  $$SELECT title FROM public.admin_announcements ORDER BY title$$,
  ARRAY['Everyone', 'For current user'],
  'users only read active announcements addressed to them'
);
SELECT throws_ok(
  $$SELECT target_user_ids FROM public.admin_announcements$$,
  '42501',
  NULL,
  'recipient UUID arrays remain private'
);
SELECT lives_ok(
  $$INSERT INTO public.user_announcement_dismissals (announcement_id, user_id)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111')$$,
  'users can dismiss a visible announcement for themselves'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.user_announcement_dismissals$$,
  ARRAY[1::bigint],
  'users read their own persisted dismissal'
);
SELECT throws_ok(
  $$INSERT INTO public.user_announcement_dismissals (announcement_id, user_id)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'users cannot dismiss an announcement targeted to someone else'
);
SELECT throws_ok(
  $$INSERT INTO public.user_announcement_dismissals (announcement_id, user_id)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'users cannot dismiss an expired announcement'
);
SELECT throws_ok(
  $$INSERT INTO public.user_announcement_dismissals (announcement_id, user_id)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222')$$,
  '42501',
  NULL,
  'users cannot write a dismissal for another user'
);
SELECT throws_ok(
  $$UPDATE public.user_announcement_dismissals SET dismissed_at = now()$$,
  '42501',
  NULL,
  'users cannot update dismissals'
);
SELECT throws_ok(
  $$DELETE FROM public.user_announcement_dismissals$$,
  '42501',
  NULL,
  'users cannot delete dismissals'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT id FROM public.admin_announcements$$,
  '42501',
  NULL,
  'anonymous callers cannot select announcement rows'
);

SELECT * FROM finish();
ROLLBACK;
