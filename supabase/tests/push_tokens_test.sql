BEGIN;
SELECT plan(29);

INSERT INTO auth.users (id) VALUES
  ('f1111111-1111-4111-8111-111111111111'),
  ('f2222222-2222-4222-8222-222222222222');

SELECT ok(
  has_table_privilege('authenticated', 'public.push_tokens', 'SELECT')
    AND has_table_privilege('authenticated', 'public.push_tokens', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.push_tokens', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.push_tokens', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.push_tokens', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.push_tokens', 'DELETE')
    AND has_table_privilege('service_role', 'public.push_tokens', 'SELECT')
    AND has_table_privilege('service_role', 'public.push_tokens', 'UPDATE'),
  'signed-in clients can read and remove tokens but only write them through registration'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.push_tickets', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.push_tickets', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.push_tickets', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.push_tickets', 'SELECT')
    AND has_table_privilege('service_role', 'public.push_tickets', 'SELECT')
    AND has_table_privilege('service_role', 'public.push_tickets', 'INSERT')
    AND has_table_privilege('service_role', 'public.push_tickets', 'DELETE'),
  'push tickets belong to the server only'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.push_withdrawn_registrations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.push_withdrawn_registrations', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.push_withdrawn_registrations', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.push_withdrawn_registrations', 'SELECT'),
  'clients withdraw registrations only by releasing them'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.register_push_token(text, text, text, uuid, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.register_push_token(text, text, text, uuid, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.register_push_token(text, text, text, uuid, uuid)', 'EXECUTE'),
  'only a signed-in user can register a token, and only for themselves'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.release_push_token(text, uuid, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.release_push_token(text, uuid, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.release_push_token(text, uuid, uuid)', 'EXECUTE'),
  'only a signed-in user can release a token'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);

SELECT lives_ok(
  $$SELECT public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios', 'hu', 'fa000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001')$$,
  'a user registers their phone'
);
SELECT results_eq(
  $$SELECT user_id, locale, enabled FROM public.push_tokens$$,
  $$VALUES ('f1111111-1111-4111-8111-111111111111'::uuid, 'hu'::text, true)$$,
  'the token is stored for the caller with their language'
);
SELECT throws_ok(
  $$INSERT INTO public.push_tokens (token, user_id, platform)
    VALUES ('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'f2222222-2222-4222-8222-222222222222', 'ios')$$,
  '42501',
  NULL,
  'a client cannot write a token row directly, so it cannot file one under another user'
);
SELECT throws_ok(
  $$SELECT public.register_push_token('not a token', 'ios', 'en', NULL, 'ab000000-0000-4000-8000-000000000009')$$,
  '23514',
  NULL,
  'only Expo push tokens are accepted'
);
SELECT throws_ok(
  $$SELECT public.register_push_token('ExponentPushToken[cccccccccccccccccccccc]', 'ios', 'en', NULL, NULL)$$,
  '22004',
  NULL,
  'every registration carries the ID a release can withdraw'
);
SELECT throws_ok(
  $$SELECT public.register_push_token('ExponentPushToken[cccccccccccccccccccccc]', 'ios', 'fr', NULL, 'ab000000-0000-4000-8000-000000000009')$$,
  '23514',
  NULL,
  'only the app languages are accepted'
);

SELECT set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
SELECT is(
  (SELECT count(*) FROM public.push_tokens)::integer,
  0,
  'another user sees none of the tokens'
);
SELECT is_empty(
  $$DELETE FROM public.push_tokens RETURNING token$$,
  'another user cannot remove the tokens'
);

-- The second account signs in on the same phone.
SELECT lives_ok(
  $$SELECT public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002')$$,
  'the second account registers the same phone'
);
SELECT results_eq(
  $$SELECT token, user_id, locale FROM public.push_tokens$$,
  $$VALUES ('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'::text, 'f2222222-2222-4222-8222-222222222222'::uuid, 'en'::text)$$,
  'the token moved to the second account with its language'
);

SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
SELECT is(
  (SELECT count(*) FROM public.push_tokens)::integer,
  0,
  'the first account no longer holds the phone''s token'
);

RESET ROLE;
UPDATE public.push_tokens SET enabled = false, last_seen_at = now() - interval '1 day';
INSERT INTO public.push_tickets (id, token) VALUES ('ticket-1', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
SELECT public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002');
SELECT ok(
  (SELECT enabled AND last_seen_at > now() - interval '1 minute' FROM public.push_tokens),
  'registering again turns a disabled token back on'
);

-- The install's token changed, so the old one must stop receiving.
SELECT public.register_push_token('ExponentPushToken[dddddddddddddddddddddd]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002');
SELECT results_eq(
  $$SELECT token FROM public.push_tokens$$,
  $$VALUES ('ExponentPushToken[dddddddddddddddddddddd]'::text)$$,
  'a new token from the same install replaces the old one'
);

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.push_tickets)::integer,
  0,
  'a replaced token takes its tickets with it'
);

INSERT INTO public.push_tokens (token, user_id, platform, last_seen_at)
SELECT format('ExponentPushToken[old%s]', lpad(n::text, 17, '0')), 'f2222222-2222-4222-8222-222222222222', 'ios', now() - n * interval '1 hour'
FROM generate_series(1, 12) AS n;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
SELECT public.register_push_token('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003');
SELECT ok(
  (SELECT count(*) = 10 AND bool_or(token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]') FROM public.push_tokens),
  'an account keeps its ten most recently seen tokens'
);

-- READ COMMITTED would let two registrations at once each count only their
-- own row, so registration holds a per-account lock until it commits.
RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks AS held
    CROSS JOIN LATERAL (SELECT hashtextextended('push-tokens:f2222222-2222-4222-8222-222222222222', 0) AS key) AS lock
    WHERE held.locktype = 'advisory'
      AND held.pid = pg_backend_pid()
      AND held.mode = 'ExclusiveLock'
      AND held.objsubid = 1
      AND held.classid = ((lock.key >> 32) & 4294967295)::text::oid
      AND held.objid = (lock.key & 4294967295)::text::oid
  ),
  'registration holds the account''s lock until the transaction ends'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks AS held
    CROSS JOIN LATERAL (SELECT hashtextextended('push-registration:ab000000-0000-4000-8000-000000000003', 0) AS key) AS lock
    WHERE held.locktype = 'advisory'
      AND held.pid = pg_backend_pid()
      AND held.mode = 'ExclusiveLock'
      AND held.objsubid = 1
      AND held.classid = ((lock.key >> 32) & 4294967295)::text::oid
      AND held.objid = (lock.key & 4294967295)::text::oid
  ),
  'registration holds its ID''s lock until the transaction ends, so a release of it waits for the row'
);
SET LOCAL ROLE authenticated;

-- The account that registered the phone signed out without removing its row;
-- the next account on the phone releases it.
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
SELECT public.release_push_token('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', NULL, NULL);
RESET ROLE;
SELECT ok(
  (SELECT count(*) = 9 AND NOT bool_or(token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]') FROM public.push_tokens),
  'the next account on the phone releases a token another account holds, and only that token'
);
SET LOCAL ROLE authenticated;

-- The app gave up on a registration that is still running, and the phone's
-- registration was released: it must not land afterwards.
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
SELECT public.register_push_token('ExponentPushToken[gggggggggggggggggggggg]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000004');
SELECT set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
SELECT public.release_push_token(NULL, 'fa000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT ok(
  (SELECT count(*) = 9 AND NOT bool_or(token = 'ExponentPushToken[gggggggggggggggggggggg]') FROM public.push_tokens),
  'releasing a registration deletes the row it wrote, whichever account holds it, and nothing else'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
SELECT throws_ok(
  $$SELECT public.register_push_token('ExponentPushToken[gggggggggggggggggggggg]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000004')$$,
  '55000',
  NULL,
  'a released registration that arrives late is refused'
);
SELECT lives_ok(
  $$SELECT public.register_push_token('ExponentPushToken[gggggggggggggggggggggg]', 'ios', 'en', 'fa000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000005')$$,
  'the phone can register again with a new registration ID'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$SELECT public.register_push_token('ExponentPushToken[ffffffffffffffffffffff]', 'ios', 'en', NULL, 'ab000000-0000-4000-8000-000000000009')$$,
  '42501',
  NULL,
  'a token cannot be registered without a signed-in user'
);
SELECT throws_ok(
  $$SELECT public.release_push_token('ExponentPushToken[dddddddddddddddddddddd]', NULL, NULL)$$,
  '42501',
  NULL,
  'a token cannot be released without a signed-in user'
);

RESET ROLE;
DELETE FROM auth.users WHERE id = 'f2222222-2222-4222-8222-222222222222';
SELECT results_eq(
  $$SELECT token FROM public.push_tokens$$,
  $$VALUES ('ExponentPushToken[gggggggggggggggggggggg]'::text)$$,
  'deleting an account removes its tokens and leaves other accounts'' tokens'
);

SELECT * FROM finish();
ROLLBACK;
