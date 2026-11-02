BEGIN;
SELECT plan(12);

SELECT ok(
  NOT has_table_privilege('anon', 'public.demo_round_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'public.demo_round_days', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.demo_round_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.demo_round_days', 'SELECT,INSERT,UPDATE,DELETE'),
  'clients hold no privilege on the demo round tables'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_demo_round_turn(uuid, text, integer, integer, integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.claim_demo_round_turn(uuid, text, integer, integer, integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.claim_demo_round_turn(uuid, text, integer, integer, integer)', 'EXECUTE'),
  'only the service role can claim a demo turn'
);

-- The limits the function ships with: 3 sessions per IP a day, 2 turns each.
CREATE TEMP TABLE claims (label text, status text, session_id uuid);
INSERT INTO claims SELECT 'a1', * FROM public.claim_demo_round_turn(NULL, repeat('a', 64), 3, 2, 100);
SELECT is((SELECT status FROM claims WHERE label = 'a1'), 'ok', 'a first turn starts a session');

INSERT INTO claims SELECT 'a2', * FROM public.claim_demo_round_turn((SELECT session_id FROM claims WHERE label = 'a1'), repeat('a', 64), 3, 2, 100);
SELECT is((SELECT status FROM claims WHERE label = 'a2'), 'ok', 'the follow-up turn is allowed');

INSERT INTO claims SELECT 'a3', * FROM public.claim_demo_round_turn((SELECT session_id FROM claims WHERE label = 'a1'), repeat('a', 64), 3, 2, 100);
SELECT is((SELECT status FROM claims WHERE label = 'a3'), 'turn_limit', 'a third turn in one session is refused');

SELECT is(
  (SELECT status FROM public.claim_demo_round_turn((SELECT session_id FROM claims WHERE label = 'a1'), repeat('b', 64), 3, 2, 100)),
  'unknown_session',
  'a session cannot be continued from another IP'
);

INSERT INTO claims SELECT 'a4', * FROM public.claim_demo_round_turn(NULL, repeat('a', 64), 3, 2, 100);
INSERT INTO claims SELECT 'a5', * FROM public.claim_demo_round_turn(NULL, repeat('a', 64), 3, 2, 100);
SELECT is(
  (SELECT array_agg(status ORDER BY label) FROM claims WHERE label IN ('a4', 'a5')),
  ARRAY['ok', 'ok'],
  'the second and third sessions of the day from one IP start'
);
SELECT is(
  (SELECT status FROM public.claim_demo_round_turn(NULL, repeat('a', 64), 3, 2, 100)),
  'ip_limit',
  'a fourth session from the same IP that day is refused'
);
SELECT is(
  (SELECT status FROM public.claim_demo_round_turn(NULL, repeat('b', 64), 3, 2, 100)),
  'ok',
  'another IP still gets its own sessions'
);

-- 5 model calls so far today. A cap of 5 stops the next, and writes nothing.
SELECT is(
  (SELECT status FROM public.claim_demo_round_turn(NULL, repeat('c', 64), 3, 2, 5)),
  'daily_limit',
  'the global daily cap refuses a call once it is reached'
);
SELECT is(
  (SELECT model_calls FROM public.demo_round_days WHERE usage_date = (now() AT TIME ZONE 'utc')::date),
  5,
  'a refused call does not count against the cap'
);

UPDATE public.demo_round_sessions SET usage_date = usage_date - 2 WHERE ip_hash = repeat('b', 64);
SELECT public.claim_demo_round_turn(NULL, repeat('d', 64), 3, 2, 100);
SELECT is(
  (SELECT count(*) FROM public.demo_round_sessions WHERE ip_hash = repeat('b', 64)),
  0::bigint,
  'sessions older than yesterday are deleted'
);

SELECT * FROM finish();
ROLLBACK;
