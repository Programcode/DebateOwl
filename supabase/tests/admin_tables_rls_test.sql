BEGIN;
SELECT plan(19);

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
  ('b1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222'),
  ('b3333333-3333-4333-8333-333333333333');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'user'),
  ('b2222222-2222-4222-8222-222222222222', 'admin');
INSERT INTO public.admin_grants (admin_user_id, target_user_id, grant_type, starts_at, ends_at, notes) VALUES
  ('b2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'pro', now(), now() + interval '30 days', 'pgtap grant');
INSERT INTO public.rate_limits (user_id, limit_type, limit_value) VALUES
  (NULL, 'pgtap_daily', 100),
  ('b1111111-1111-4111-8111-111111111111', 'pgtap_daily', 50),
  ('b3333333-3333-4333-8333-333333333333', 'pgtap_daily', 500);
INSERT INTO public.global_prompts (feature, prompt_text)
VALUES ('ask', 'pgtap prompt')
ON CONFLICT (feature) DO UPDATE SET prompt_text = EXCLUDED.prompt_text;

-- A regular user who is the target of an admin grant.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT is_empty(
  $$SELECT 1 FROM public.admin_grants$$,
  'a regular user cannot read the admin grant log, even grants made to them'
);
SELECT throws_ok(
  $$INSERT INTO public.admin_grants (target_user_id, grant_type, starts_at, ends_at)
    VALUES ('b1111111-1111-4111-8111-111111111111', 'pro', now(), now() + interval '1 year')$$,
  '42501',
  NULL,
  'a regular user cannot record a grant for themselves'
);
SELECT results_eq(
  $$SELECT user_id, limit_value FROM public.rate_limits
    WHERE limit_type = 'pgtap_daily' ORDER BY user_id NULLS FIRST$$,
  $$VALUES ('b1111111-1111-4111-8111-111111111111'::uuid, 50)$$,
  'a user reads their own limit, not the global one or other users'' limits'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.rate_limits SET limit_value = 1000000
    WHERE limit_type = 'pgtap_daily'$$),
  0::bigint,
  'a user cannot raise their own or the global rate limit'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.rate_limits WHERE limit_type = 'pgtap_daily'$$),
  0::bigint,
  'a user cannot delete rate limits'
);
SELECT throws_ok(
  $$INSERT INTO public.rate_limits (user_id, limit_type, limit_value)
    VALUES ('b1111111-1111-4111-8111-111111111111', 'pgtap_other', 1000000)$$,
  '42501',
  NULL,
  'a user cannot create a rate limit override'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_active_rate_limits()$$,
  '42501',
  NULL,
  'a regular user cannot list every user''s rate limits'
);
SELECT throws_ok(
  $$INSERT INTO public.global_prompts (feature, prompt_text) VALUES ('attack', 'injected')$$,
  '42501',
  NULL,
  'a regular user cannot add a global prompt'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.global_prompts SET prompt_text = 'injected' WHERE feature = 'ask'$$),
  0::bigint,
  'a regular user cannot rewrite a global prompt'
);

-- Administrators read the grant log, but every admin write goes through the
-- admin Edge Function with the service role.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SELECT results_eq(
  $$SELECT target_user_id, notes FROM public.admin_grants$$,
  $$VALUES ('b1111111-1111-4111-8111-111111111111'::uuid, 'pgtap grant'::text)$$,
  'an administrator reads the grant log'
);
SELECT throws_ok(
  $$INSERT INTO public.admin_grants (target_user_id, grant_type, starts_at, ends_at)
    VALUES ('b2222222-2222-4222-8222-222222222222', 'pro', now(), now() + interval '1 year')$$,
  '42501',
  NULL,
  'an administrator cannot write the grant log directly'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.admin_grants$$),
  0::bigint,
  'an administrator cannot erase the grant log directly'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.global_prompts SET prompt_text = 'direct' WHERE feature = 'ask'$$),
  0::bigint,
  'an administrator cannot rewrite a global prompt directly'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT is_empty(
  $$SELECT 1 FROM public.admin_grants$$,
  'anonymous callers cannot read the grant log'
);
SELECT throws_ok(
  $$SELECT 1 FROM public.rate_limits$$,
  '42501',
  NULL,
  'anonymous callers cannot read rate limits'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_active_rate_limits()$$,
  '42501',
  NULL,
  'anonymous callers cannot list rate limits through the admin RPC'
);
SELECT throws_ok(
  $$INSERT INTO public.rate_limits (user_id, limit_type, limit_value)
    VALUES (NULL, 'pgtap_other', 1000000)$$,
  '42501',
  NULL,
  'anonymous callers cannot create rate limits'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.global_prompts$$),
  0::bigint,
  'anonymous callers cannot delete global prompts'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT
      (SELECT count(*) FROM public.admin_grants WHERE notes = 'pgtap grant'),
      (SELECT string_agg(limit_value::text, ',' ORDER BY limit_value)
        FROM public.rate_limits WHERE limit_type = 'pgtap_daily'),
      (SELECT prompt_text FROM public.global_prompts WHERE feature = 'ask')$$,
  $$VALUES (1::bigint, '50,100,500'::text, 'pgtap prompt'::text)$$,
  'no client attempt changed grants, limits, or prompts'
);

SELECT * FROM finish();
ROLLBACK;
