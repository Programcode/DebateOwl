BEGIN;
SELECT plan(17);

INSERT INTO auth.users (id)
VALUES
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');

SELECT has_column('public', 'ai_requests', 'cap_cost_usd', 'ai_requests records the spend that counts toward the weekly cap');
SELECT col_is_null('public', 'ai_requests', 'cap_cost_usd', 'cap spend is nullable, so old rows need no backfill');
SELECT results_eq(
  $$SELECT count(*)::bigint FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'consume_daily_quota'$$,
  ARRAY[1::bigint],
  'consume_daily_quota is left in place with one overload'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_ai_quota(uuid, integer, integer, numeric, text)', 'EXECUTE'),
  'anonymous callers cannot reserve AI quota'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.consume_ai_quota(uuid, integer, integer, numeric, text)', 'EXECUTE'),
  'authenticated callers cannot reserve AI quota'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_ai_quota(uuid, integer, integer, numeric, text)', 'EXECUTE'),
  'service role can reserve AI quota'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 10, 6)$$,
  $$VALUES (true, 6, NULL::text)$$,
  'a weighted request reserves all of its units'
);
SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 10, 5)$$,
  $$VALUES (false, 6, 'daily'::text)$$,
  'a weighted request that does not fit is refused and leaves the counter alone'
);
SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 10, 4)$$,
  $$VALUES (true, 10, NULL::text)$$,
  'a request that exactly fills the limit is allowed'
);
SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 3, 5, NULL, 'weighted_first')$$,
  $$VALUES (false, 0, 'daily'::text)$$,
  'a first request larger than the whole limit is refused'
);
SELECT throws_ok(
  $$SELECT * FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 10, 0)$$,
  'P0001',
  'quota reservation is restricted to trusted server code',
  'zero-unit reservations are rejected'
);
SELECT results_eq(
  $$SELECT allowed, current_count
    FROM public.consume_daily_quota('66666666-6666-4666-8666-666666666666', 20)$$,
  $$VALUES (true, 11)$$,
  'the old one-unit function still works on the same ai counter'
);

-- Weekly cap. Cap spend: 1.50 this week; BYOK provider charges (cost_usd only),
-- unknown cap spend, last week's spend and another user's spend do not count.
RESET ROLE;
INSERT INTO public.ai_requests (user_id, feature, provider, model, status, cost_usd, cap_cost_usd, created_at)
VALUES
  ('66666666-6666-4666-8666-666666666666', 'ask', 'openrouter', 'openai/gpt-6-luna', 'success', 1.50, 1.50, now()),
  ('66666666-6666-4666-8666-666666666666', 'ask', 'openrouter', 'anthropic/claude-opus-5.5', 'success', 40.00, 0, now()),
  ('66666666-6666-4666-8666-666666666666', 'ask', 'openrouter', 'anthropic/claude-opus-5.5', 'success', 30.00, NULL, now()),
  ('66666666-6666-4666-8666-666666666666', 'ask', 'openrouter', 'openai/gpt-6-luna', 'success', 9.00, 9.00,
    date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 second'),
  ('77777777-7777-4777-8777-777777777777', 'ask', 'openrouter', 'openai/gpt-6-luna', 'success', 5.00, 5.00, now());
SET LOCAL ROLE service_role;

SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 100, 1, 2.00)$$,
  $$VALUES (true, 12, NULL::text)$$,
  'BYOK charges, unknown spend, last week and other users do not count toward the cap'
);

RESET ROLE;
INSERT INTO public.ai_requests (user_id, feature, provider, model, status, cost_usd, cap_cost_usd)
VALUES ('66666666-6666-4666-8666-666666666666', 'voice', 'elevenlabs', 'eleven_v4', 'success', 0.50, 0.50);
SET LOCAL ROLE service_role;

SELECT results_eq(
  $$SELECT allowed, current_count, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 100, 1, 2.00)$$,
  $$VALUES (false, 12, 'weekly'::text)$$,
  'reaching the weekly cap refuses the request without consuming daily quota'
);
SELECT results_eq(
  $$SELECT allowed, denied_by
    FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 100, 1, NULL)$$,
  $$VALUES (true, NULL::text)$$,
  'a NULL cap turns the weekly check off'
);

-- Rewriting old rows' cost_usd (the BYOK cost backfill) leaves the cap alone.
RESET ROLE;
UPDATE public.ai_requests SET cost_usd = cost_usd + 100
WHERE user_id = '77777777-7777-4777-8777-777777777777';
INSERT INTO public.ai_requests (user_id, feature, provider, model, status, cost_usd, created_at)
VALUES ('77777777-7777-4777-8777-777777777777', 'ask', 'openrouter', 'anthropic/claude-opus-5.5', 'success', 50.00, now());
SET LOCAL ROLE service_role;
SELECT results_eq(
  $$SELECT allowed, denied_by
    FROM public.consume_ai_quota('77777777-7777-4777-8777-777777777777', 100, 1, 6.00)$$,
  $$VALUES (true, NULL::text)$$,
  'cost_usd alone, including backfilled rows, never counts toward the cap'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT * FROM public.consume_ai_quota('66666666-6666-4666-8666-666666666666', 3)$$,
  '42501',
  NULL,
  'unauthorized callers cannot execute the AI quota RPC'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
