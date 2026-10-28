BEGIN;
SELECT plan(22);

INSERT INTO auth.users (id)
VALUES
  ('88888888-8888-4888-8888-888888888888'),
  ('99999999-9999-4999-8999-999999999999');

SELECT ok(
  NOT has_table_privilege('anon', 'public.ai_quota_sessions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.ai_quota_sessions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'clients cannot read or write the session quota ledger'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.claim_ai_session_quota(uuid, text, text, integer, integer, numeric, integer, integer, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.refund_ai_session_quota(uuid, text, text, integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.peek_ai_quota(uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.claim_ai_session_quota(uuid, text, text, integer, integer, numeric, integer, integer, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.refund_ai_session_quota(uuid, text, text, integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.peek_ai_quota(uuid, text)', 'EXECUTE'),
  'clients cannot claim, refund, or peek session quota'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- A trial user (limit 5) on a 1-unit model. Crossfire allows 3 calls a session
-- here and lives an hour.
SELECT results_eq(
  $$SELECT allowed, charged, units, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, true, 1, 1)$$,
  'the opening call of a session reserves its units'
);
SELECT results_eq(
  $$SELECT allowed, charged, units, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, false, 0, 1)$$,
  'a later call in the same session is free'
);
SELECT results_eq(
  $$SELECT allowed, charged, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, false, 1)$$,
  'the third call still fits the per-session cap'
);
SELECT results_eq(
  $$SELECT allowed, charged, units, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, true, 1, 2)$$,
  'a session past its call cap pays for another use instead of running free'
);
SELECT results_eq(
  $$SELECT allowed, charged, units, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 2, NULL, 3, 3600)$$,
  $$VALUES (true, true, 2, 4)$$,
  'switching to a heavier model mid-session pays its weight'
);
SELECT results_eq(
  $$SELECT allowed, charged, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, false, 4)$$,
  'a lighter model rides on the heavier charge'
);
SELECT results_eq(
  $$SELECT allowed, charged, current_count FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'sparring', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, true, 5)$$,
  'the same key under another feature is a different session'
);
SELECT results_eq(
  $$SELECT allowed, charged, current_count, denied_by FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'crossfire', 'cf-2', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (false, false, 5, 'daily'::text)$$,
  'a new session is refused when the day is used up'
);
SELECT results_eq(
  $$SELECT allowed, charged FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'sparring', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (true, false)$$,
  'a session that already paid keeps running after the day is used up'
);

-- An expired session charges again.
RESET ROLE;
UPDATE public.ai_quota_sessions SET charged_at = now() - interval '2 hours'
WHERE user_id = '88888888-8888-4888-8888-888888888888' AND feature = 'sparring' AND session_key = 'cf-1';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT allowed, charged, denied_by FROM public.claim_ai_session_quota('88888888-8888-4888-8888-888888888888', 'sparring', 'cf-1', 5, 1, NULL, 3, 3600)$$,
  $$VALUES (false, false, 'daily'::text)$$,
  'a session older than its lifetime must pay again'
);

-- Refunds: the second user opens a session and the opening call fails.
SELECT results_eq(
  $$SELECT charged, current_count, charge_id FROM public.claim_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 5, 2, NULL, 10, 3600)$$,
  $$VALUES (true, 2, 1)$$,
  'setup: the opening call reserves two units as charge 1'
);
SELECT is(
  public.refund_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 1),
  2,
  'a failed opening call gives back what it reserved'
);
SELECT is(
  public.refund_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 1),
  0,
  'a second refund for the same charge gives nothing back'
);
SELECT results_eq(
  $$SELECT charged, current_count, charge_id FROM public.claim_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 5, 2, NULL, 10, 3600)$$,
  $$VALUES (true, 2, 2)$$,
  'the retry after a refund pays again, as a new charge'
);
SELECT is(
  public.refund_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 1),
  0,
  'a stale refund never gives back a later charge'
);
SELECT public.claim_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 5, 2, NULL, 10, 3600);
SELECT is(
  public.refund_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 2),
  0,
  'no refund once another call has run on the charge'
);

-- A refund after midnight UTC goes back to the day that paid.
RESET ROLE;
UPDATE public.daily_usage_counters SET usage_date = CURRENT_DATE - 1
WHERE user_id = '99999999-9999-4999-8999-999999999999';
UPDATE public.ai_quota_sessions SET usage_date = CURRENT_DATE - 1, calls_used = 1
WHERE user_id = '99999999-9999-4999-8999-999999999999';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.refund_ai_session_quota('99999999-9999-4999-8999-999999999999', 'sparring', 'sp-1', 2);
RESET ROLE;
SELECT results_eq(
  $$SELECT usage_date = CURRENT_DATE - 1, request_count FROM public.daily_usage_counters
    WHERE user_id = '99999999-9999-4999-8999-999999999999'$$,
  $$VALUES (true, 0)$$,
  'a refund lands on the day the session was charged'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT current_count FROM public.peek_ai_quota('88888888-8888-4888-8888-888888888888')$$,
  ARRAY[5],
  'peeking reads today''s count'
);

RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.ai_usage_today()', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.ai_usage_today()', 'EXECUTE'),
  'only signed-in users can read their own usage'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT is(
  public.ai_usage_today(),
  5,
  'a user reads today''s charged units, not one per logged call'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
