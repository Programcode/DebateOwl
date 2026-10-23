BEGIN;
SELECT plan(14);

-- Returns how many rows a statement changed; a privilege or RLS rejection changes none.
CREATE FUNCTION pg_temp.rows_changed(statement text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE changed bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END;
$$;

INSERT INTO auth.users (id) VALUES
  ('c1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333333'),
  ('c4444444-4444-4444-8444-444444444444');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'user'),
  ('c2222222-2222-4222-8222-222222222222', 'admin'),
  ('c4444444-4444-4444-8444-444444444444', 'banned');

-- A regular user.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$SELECT user_id, role FROM public.user_roles$$,
  $$VALUES ('c1111111-1111-4111-8111-111111111111'::uuid, 'user'::text)$$,
  'a user reads only their own role'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.user_roles SET role = 'admin'
    WHERE user_id = 'c1111111-1111-4111-8111-111111111111'$$),
  0::bigint,
  'a user cannot promote their own role to admin'
);
SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role)
    VALUES ('c1111111-1111-4111-8111-111111111111', 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin'$$,
  '42501',
  NULL,
  'a user cannot upsert themselves into admin'
);
SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role)
    VALUES ('c3333333-3333-4333-8333-333333333333', 'admin')$$,
  '42501',
  NULL,
  'a user cannot grant admin to another account'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.user_roles SET role = 'user'
    WHERE user_id = 'c2222222-2222-4222-8222-222222222222'$$),
  0::bigint,
  'a user cannot demote an administrator'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.user_roles
    WHERE user_id = 'c2222222-2222-4222-8222-222222222222'$$),
  0::bigint,
  'a user cannot delete an administrator role'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_active_rate_limits()$$,
  '42501',
  NULL,
  'admin-only RPCs still reject the user after the escalation attempts'
);

-- A user with no role row yet.
SELECT set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', true);
SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role)
    VALUES ('c3333333-3333-4333-8333-333333333333', 'admin')$$,
  '42501',
  NULL,
  'a user without a role row cannot create an admin role for themselves'
);

-- A banned user.
SELECT set_config('request.jwt.claim.sub', 'c4444444-4444-4444-8444-444444444444', true);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.user_roles
    WHERE user_id = 'c4444444-4444-4444-8444-444444444444'$$),
  0::bigint,
  'a banned user cannot delete their ban'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.user_roles SET role = 'user'
    WHERE user_id = 'c4444444-4444-4444-8444-444444444444'$$),
  0::bigint,
  'a banned user cannot lift their ban'
);

-- An administrator is still read-limited to their own row through the Data API.
SELECT set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', true);
SELECT results_eq(
  $$SELECT user_id FROM public.user_roles$$,
  $$VALUES ('c2222222-2222-4222-8222-222222222222'::uuid)$$,
  'an administrator reads other roles only through the admin function'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT throws_ok(
  $$SELECT 1 FROM public.user_roles$$,
  '42501',
  NULL,
  'anonymous callers see no roles'
);
SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role)
    VALUES ('c3333333-3333-4333-8333-333333333333', 'admin')$$,
  '42501',
  NULL,
  'anonymous callers cannot create roles'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT user_id, role FROM public.user_roles
    WHERE user_id IN (
      'c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222',
      'c3333333-3333-4333-8333-333333333333', 'c4444444-4444-4444-8444-444444444444'
    ) ORDER BY user_id$$,
  $$VALUES
    ('c1111111-1111-4111-8111-111111111111'::uuid, 'user'::text),
    ('c2222222-2222-4222-8222-222222222222'::uuid, 'admin'::text),
    ('c4444444-4444-4444-8444-444444444444'::uuid, 'banned'::text)$$,
  'no client attempt changed any role'
);

SELECT * FROM finish();
ROLLBACK;
