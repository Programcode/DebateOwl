BEGIN;
SELECT plan(7);

SELECT ok(
  NOT has_table_privilege('anon', 'public.keepalive_events', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'public.keepalive_heartbeat', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.keepalive_events', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.keepalive_heartbeat', 'SELECT,INSERT,UPDATE,DELETE'),
  'clients hold no privilege on the keepalive tables'
);
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('keepalive_events', 'keepalive_heartbeat')),
  0::bigint,
  'no policy opens the keepalive tables to a client role'
);

INSERT INTO public.keepalive_heartbeat (id, source) VALUES ('external-keepalive', 'external-keepalive-monitor');
INSERT INTO public.keepalive_events (source) VALUES ('external-keepalive-monitor');

-- The publishable key: what the audit showed it could do.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT throws_ok(
  $$INSERT INTO public.keepalive_events (source, details) VALUES ('external-keepalive-monitor', '{}')$$,
  '42501', NULL, 'the publishable key cannot insert keepalive events'
);
SELECT throws_ok(
  $$SELECT 1 FROM public.keepalive_events$$,
  '42501', NULL, 'the publishable key cannot read keepalive events'
);
SELECT throws_ok(
  $$UPDATE public.keepalive_heartbeat SET touched_at = now() WHERE id = 'external-keepalive'$$,
  '42501', NULL, 'the publishable key cannot overwrite the heartbeat'
);
RESET ROLE;

-- The monitor's own path: REST upsert of the heartbeat and an event insert.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$INSERT INTO public.keepalive_heartbeat (id, touched_at, source)
    VALUES ('external-keepalive', now(), 'external-keepalive-monitor')
    ON CONFLICT (id) DO UPDATE SET touched_at = excluded.touched_at, source = excluded.source$$,
  'the service role can still upsert the heartbeat'
);
SELECT lives_ok(
  $$INSERT INTO public.keepalive_events (source) VALUES ('external-keepalive-monitor')$$,
  'the service role can still record a keepalive event'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
