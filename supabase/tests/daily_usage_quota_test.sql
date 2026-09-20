BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id)
VALUES
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555');

SELECT has_column(
  'public',
  'daily_usage_counters',
  'quota_key',
  'daily usage counters identify the quota being consumed'
);
SELECT col_not_null(
  'public',
  'daily_usage_counters',
  'quota_key',
  'quota keys cannot be null'
);
SELECT col_default_is(
  'public',
  'daily_usage_counters',
  'quota_key',
  'ai',
  'existing and omitted quota keys default to ai'
);
SELECT results_eq(
  $$SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.daily_usage_counters'::regclass
      AND contype = 'p'$$,
  ARRAY['PRIMARY KEY (user_id, usage_date, quota_key)'],
  'the primary key scopes counters by quota key'
);
SELECT results_eq(
  $$SELECT count(*)::bigint
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'consume_daily_quota'$$,
  ARRAY[1::bigint],
  'the migration leaves one consume_daily_quota overload'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_daily_quota(uuid, integer, text)', 'EXECUTE'),
  'anonymous callers cannot reserve quota'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.consume_daily_quota(uuid, integer, text)', 'EXECUTE'),
  'authenticated callers cannot reserve quota'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_daily_quota(uuid, integer, text)', 'EXECUTE'),
  'service role can reserve quota'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT * FROM public.consume_daily_quota('44444444-4444-4444-8444-444444444444', 3)$$,
  '42501',
  NULL,
  'unauthorized callers still cannot execute the quota RPC'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('44444444-4444-4444-8444-444444444444', 3)$$,
  $$VALUES (true, 1)$$,
  'calls that omit the quota key reserve ai quota'
);
SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('44444444-4444-4444-8444-444444444444', 1, 'import_source')$$,
  $$VALUES (true, 1)$$,
  'import reservations increment the import_source counter'
);
SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('44444444-4444-4444-8444-444444444444', 1, 'import_source')$$,
  $$VALUES (false, 1)$$,
  'the import_source counter enforces its own limit'
);
SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('44444444-4444-4444-8444-444444444444', 3)$$,
  $$VALUES (true, 2)$$,
  'exhausting import quota does not exhaust ai quota'
);
SELECT results_eq(
  $$SELECT quota_key, request_count
    FROM public.daily_usage_counters
    WHERE user_id = '44444444-4444-4444-8444-444444444444'
    ORDER BY quota_key$$,
  $$VALUES ('ai'::text, 2), ('import_source'::text, 1)$$,
  'ai and import reservations update only their own counters'
);

RESET ROLE;
INSERT INTO public.daily_usage_counters (user_id, usage_date, request_count)
VALUES ('55555555-5555-4555-8555-555555555555', CURRENT_DATE - 1, 7);
SELECT results_eq(
  $$SELECT quota_key, request_count
    FROM public.daily_usage_counters
    WHERE user_id = '55555555-5555-4555-8555-555555555555'
      AND usage_date = CURRENT_DATE - 1$$,
  $$VALUES ('ai'::text, 7)$$,
  'rows without an explicit quota key retain their count under ai'
);

SELECT * FROM finish();
ROLLBACK;
