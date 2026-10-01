BEGIN;
SELECT plan(12);

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

-- Returns how many rows a query exposes; a privilege rejection exposes none.
CREATE FUNCTION pg_temp.visible_rows(query text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE visible bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) AS rows', query) INTO visible;
  RETURN visible;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END;
$$;

-- Stripe webhook idempotency records and clear-data markers belong to backend
-- code only: the service role and SECURITY DEFINER functions.
SELECT ok(
  NOT has_table_privilege('anon', 'public.webhook_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.webhook_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('anon', 'public.user_data_clear_markers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.user_data_clear_markers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'clients hold no table privileges on server-only tables'
);
SELECT ok(
  has_table_privilege('service_role', 'public.webhook_events', 'SELECT,INSERT,UPDATE,DELETE')
    AND has_table_privilege('service_role', 'public.user_data_clear_markers', 'SELECT,INSERT,UPDATE,DELETE'),
  'the service role keeps access to server-only tables'
);

INSERT INTO auth.users (id) VALUES ('a1111111-1111-4111-8111-111111111111');
INSERT INTO public.webhook_events (id, event_type) VALUES ('evt_pgtap', 'checkout.session.completed');
INSERT INTO public.user_data_clear_markers (user_id, cleared_at)
VALUES ('a1111111-1111-4111-8111-111111111111', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT is(
  pg_temp.visible_rows($$SELECT 1 FROM public.webhook_events$$),
  0::bigint,
  'signed-in callers see no webhook events'
);
SELECT is(
  pg_temp.visible_rows($$SELECT 1 FROM public.user_data_clear_markers$$),
  0::bigint,
  'signed-in callers see no clear markers, including their own'
);
SELECT throws_ok(
  $$INSERT INTO public.webhook_events (id, event_type) VALUES ('evt_pgtap_replay', 'checkout.session.completed')$$,
  '42501',
  NULL,
  'signed-in callers cannot pre-claim a webhook event'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.webhook_events WHERE id = 'evt_pgtap'$$),
  0::bigint,
  'signed-in callers cannot erase a processed webhook event'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.user_data_clear_markers SET cleared_at = now() - interval '1 year'$$),
  0::bigint,
  'signed-in callers cannot backdate their clear marker'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.user_data_clear_markers$$),
  0::bigint,
  'signed-in callers cannot delete their clear marker'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT is(
  pg_temp.visible_rows($$SELECT 1 FROM public.webhook_events$$)
    + pg_temp.visible_rows($$SELECT 1 FROM public.user_data_clear_markers$$),
  0::bigint,
  'anonymous callers see no server-only rows'
);
SELECT throws_ok(
  $$INSERT INTO public.webhook_events (id, event_type) VALUES ('evt_pgtap_anon', 'checkout.session.completed')$$,
  '42501',
  NULL,
  'anonymous callers cannot write webhook events'
);
SELECT throws_ok(
  $$INSERT INTO public.user_data_clear_markers (user_id, cleared_at)
    VALUES ('a1111111-1111-4111-8111-111111111111', now())$$,
  '42501',
  NULL,
  'anonymous callers cannot write clear markers'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT
      (SELECT count(*) FROM public.webhook_events WHERE id LIKE 'evt_pgtap%'),
      (SELECT count(*) FROM public.user_data_clear_markers
        WHERE user_id = 'a1111111-1111-4111-8111-111111111111' AND cleared_at > now() - interval '1 day')$$,
  $$VALUES (1::bigint, 1::bigint)$$,
  'server-only rows are unchanged after every client attempt'
);

SELECT * FROM finish();
ROLLBACK;
