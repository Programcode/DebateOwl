BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id)
VALUES
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');

SELECT ok(
  NOT has_function_privilege('anon', 'public.refund_daily_quota(uuid, integer, text)', 'EXECUTE'),
  'anonymous callers cannot refund quota'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.refund_daily_quota(uuid, integer, text)', 'EXECUTE'),
  'authenticated callers cannot refund quota'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.refund_daily_quota('66666666-6666-4666-8666-666666666666')$$,
  '42501',
  NULL,
  'unauthorized callers still cannot execute the refund RPC'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT results_eq(
  $$SELECT current_count FROM public.consume_daily_quota('66666666-6666-4666-8666-666666666666', 3)
    UNION ALL SELECT current_count FROM public.consume_daily_quota('66666666-6666-4666-8666-666666666666', 3)
    UNION ALL SELECT current_count FROM public.consume_daily_quota('66666666-6666-4666-8666-666666666666', 1, 'import_source')$$,
  ARRAY[1, 2, 1],
  'setup reserves two ai requests and one import'
);
SELECT is(
  public.refund_daily_quota('66666666-6666-4666-8666-666666666666'),
  1,
  'a refund gives back one ai request'
);
SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('66666666-6666-4666-8666-666666666666', 2)$$,
  $$VALUES (true, 2)$$,
  'the refunded request can be used again under the same limit'
);
SELECT is(
  (SELECT request_count FROM public.daily_usage_counters
    WHERE user_id = '66666666-6666-4666-8666-666666666666' AND quota_key = 'import_source'),
  1,
  'an ai refund leaves the import counter alone'
);
SELECT is(
  public.refund_daily_quota('77777777-7777-4777-8777-777777777777'),
  0,
  'a refund without a reservation today creates nothing'
);
SELECT throws_ok(
  $$SELECT public.refund_daily_quota('66666666-6666-4666-8666-666666666666', 0)$$,
  'P0001',
  NULL,
  'a refund must give back at least one unit'
);
SELECT is(
  public.refund_daily_quota('66666666-6666-4666-8666-666666666666', 5),
  0,
  'a weighted refund gives back its units and stops at zero'
);

RESET ROLE;
INSERT INTO public.daily_usage_counters (user_id, usage_date, request_count)
VALUES
  ('77777777-7777-4777-8777-777777777777', CURRENT_DATE, 0),
  ('77777777-7777-4777-8777-777777777777', CURRENT_DATE - 1, 5);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.refund_daily_quota('77777777-7777-4777-8777-777777777777');
RESET ROLE;
SELECT results_eq(
  $$SELECT usage_date = CURRENT_DATE, request_count
    FROM public.daily_usage_counters
    WHERE user_id = '77777777-7777-4777-8777-777777777777'
    ORDER BY usage_date$$,
  $$VALUES (false, 5), (true, 0)$$,
  'refunds never go below zero or touch earlier days'
);

SELECT * FROM finish();
ROLLBACK;
