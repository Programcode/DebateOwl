BEGIN;
SELECT plan(12);

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

-- An Opus request (5 units) and a Haiku request (1 unit) under a limit of 7.
SELECT results_eq(
  $$SELECT current_count FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 7, 5)$$,
  ARRAY[5],
  'setup reserves an Opus request'
);
SELECT results_eq(
  $$SELECT current_count FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 7, 1)$$,
  ARRAY[6],
  'setup reserves a Haiku request'
);
SELECT results_eq(
  $$SELECT allowed, denied_by FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 7, 5)$$,
  $$VALUES (false, 'daily'::text)$$,
  'a second Opus request does not fit'
);
SELECT is(
  public.refund_daily_quota('66666666-6666-4666-8666-666666666666', 5),
  1,
  'refunding the failed Opus request gives back its 5 units'
);
SELECT results_eq(
  $$SELECT allowed, current_count FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 7, 5)$$,
  $$VALUES (true, 6)$$,
  'the refunded units fit another Opus request'
);
SELECT throws_ok(
  $$SELECT public.refund_daily_quota('66666666-6666-4666-8666-666666666666', 0)$$,
  'P0001',
  NULL,
  'a refund must give back at least one unit'
);
SELECT is(
  public.refund_daily_quota('77777777-7777-4777-8777-777777777777', 5),
  0,
  'a refund without a reservation today creates nothing'
);

-- The failed request's row is logged with cap_cost_usd 0 when it is refunded,
-- so even a costly failure leaves the weekly cap alone.
RESET ROLE;
INSERT INTO public.ai_requests (user_id, feature, provider, model, status, error_code, cost_usd, cap_cost_usd)
VALUES ('77777777-7777-4777-8777-777777777777', 'ask', 'openrouter', 'anthropic/claude-opus-5.5', 'error', 'claude_unavailable', 3.00, 0);
INSERT INTO public.daily_usage_counters (user_id, usage_date, request_count)
VALUES
  ('77777777-7777-4777-8777-777777777777', CURRENT_DATE, 2),
  ('77777777-7777-4777-8777-777777777777', CURRENT_DATE - 1, 5);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT allowed, denied_by FROM public.consume_ai_quota('77777777-7777-4777-8777-777777777777', 50, 1, 2)$$,
  $$VALUES (true, NULL::text)$$,
  'a refunded failure does not count toward the weekly cap'
);
SELECT public.refund_daily_quota('77777777-7777-4777-8777-777777777777', 5);
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
