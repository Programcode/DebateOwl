BEGIN;
SELECT plan(6);

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

-- SC-08: only the service role and SECURITY DEFINER functions write these tables.
SELECT is_empty(
  $$SELECT t || ':' || r || ':' || p
    FROM unnest(ARRAY['public.user_roles', 'public.subscriptions', 'public.user_promos',
      'public.admin_grants', 'public.promo_codes', 'public.daily_usage_counters']) AS t,
      unnest(ARRAY['anon', 'authenticated']) AS r,
      unnest(ARRAY['INSERT', 'UPDATE']) AS p
    WHERE has_any_column_privilege(r, t, p)
    UNION ALL
    SELECT t || ':' || r || ':DELETE'
    FROM unnest(ARRAY['public.user_roles', 'public.subscriptions', 'public.user_promos',
      'public.admin_grants', 'public.promo_codes', 'public.daily_usage_counters']) AS t,
      unnest(ARRAY['anon', 'authenticated']) AS r
    WHERE has_table_privilege(r, t, 'DELETE')$$,
  'clients cannot write roles, subscriptions, promos, admin grants or usage counters, even one column'
);
SELECT is_empty(
  $$SELECT t || ':' || r
    FROM unnest(ARRAY['public.user_roles', 'public.subscriptions', 'public.user_promos',
      'public.admin_grants', 'public.promo_codes', 'public.daily_usage_counters',
      'public.ai_requests']) AS t,
      unnest(ARRAY['anon']) AS r
    WHERE has_any_column_privilege(r, t, 'SELECT')
    UNION ALL
    SELECT t FROM unnest(ARRAY['public.promo_codes', 'public.daily_usage_counters']) AS t
    WHERE has_any_column_privilege('authenticated', t, 'SELECT')$$,
  'anon reads none of them (nor AI request history), and signed-in users cannot read promo codes or usage counters directly'
);
SELECT ok(
  (SELECT bool_and(has_table_privilege('service_role', t, p))
    FROM unnest(ARRAY['public.user_roles', 'public.subscriptions', 'public.user_promos',
      'public.admin_grants', 'public.promo_codes', 'public.daily_usage_counters']) AS t,
      unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p),
  'the service role keeps every privilege on them'
);

INSERT INTO auth.users (id) VALUES ('e3333333-3333-4333-8333-333333333333');
INSERT INTO public.user_roles (user_id, role) VALUES ('e3333333-3333-4333-8333-333333333333', 'user')
ON CONFLICT (user_id) DO UPDATE SET role = 'user';
-- Hosted projects carry permissive policies that no migration created (DB-03).
-- Without write grants, even a policy like this one must not let a user write.
CREATE POLICY pgtap_legacy_user_roles_all ON public.user_roles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT is(
  (SELECT role::text FROM public.user_roles),
  'user',
  'a signed-in user still reads their own role'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.user_roles SET role = 'admin'
    WHERE user_id = 'e3333333-3333-4333-8333-333333333333'$$),
  0::bigint,
  'a signed-in user cannot make themselves an admin'
);
RESET ROLE;
SELECT is(
  (SELECT role::text FROM public.user_roles WHERE user_id = 'e3333333-3333-4333-8333-333333333333'),
  'user',
  'the role is unchanged'
);

SELECT * FROM finish();
ROLLBACK;
