BEGIN;
SELECT plan(6);

SELECT ok(
  has_table_privilege('authenticated', 'public.flowcharts', 'SELECT')
    AND has_table_privilege('authenticated', 'public.flowcharts', 'INSERT')
    AND has_table_privilege('authenticated', 'public.flowcharts', 'UPDATE')
    AND has_table_privilege('authenticated', 'public.flowcharts', 'DELETE')
    AND has_table_privilege('authenticated', 'public.source_folders', 'SELECT')
    AND has_table_privilege('authenticated', 'public.source_folders', 'INSERT'),
  'client-owned legacy tables remain writable after a fresh migration replay'
);
SELECT ok(
  has_table_privilege('service_role', 'public.promo_codes', 'SELECT')
    AND has_table_privilege('service_role', 'public.promo_codes', 'INSERT')
    AND has_table_privilege('service_role', 'public.promo_codes', 'UPDATE')
    AND has_table_privilege('service_role', 'public.daily_usage_counters', 'INSERT')
    AND has_table_privilege('service_role', 'public.daily_usage_counters', 'UPDATE'),
  'server-owned legacy tables remain reachable to the service role'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.user_settings', 'SELECT')
    AND has_column_privilege('authenticated', 'public.user_settings', 'language', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.user_settings', 'INSERT,UPDATE,DELETE'),
  'settings keep their column-limited client permissions'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.subscriptions', 'SELECT')
    AND has_table_privilege('authenticated', 'public.user_promos', 'SELECT')
    AND has_table_privilege('authenticated', 'public.ai_requests', 'SELECT'),
  'subscription status, redeemed promos, and usage remain client-readable'
);
SELECT ok(
  has_sequence_privilege('anon', 'public.keepalive_events_id_seq', 'USAGE'),
  'anonymous keepalive inserts can generate an event id'
);

INSERT INTO auth.users (id) VALUES
  ('f1111111-1111-4111-8111-111111111111'),
  ('f2222222-2222-4222-8222-222222222222');
INSERT INTO public.ai_requests (user_id, feature, provider, model) VALUES
  ('f1111111-1111-4111-8111-111111111111', 'ask', 'test', 'test'),
  ('f2222222-2222-4222-8222-222222222222', 'ask', 'test', 'test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
SELECT is(
  (SELECT count(*) FROM public.ai_requests),
  1::bigint,
  'signed-in usage reads see only their own requests'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
