BEGIN;
SELECT plan(5);

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
    AND has_table_privilege('authenticated', 'public.user_promos', 'SELECT'),
  'subscription status and redeemed promos remain client-readable'
);
SELECT ok(
  has_sequence_privilege('anon', 'public.keepalive_events_id_seq', 'USAGE'),
  'anonymous keepalive inserts can generate an event id'
);

SELECT * FROM finish();
ROLLBACK;
