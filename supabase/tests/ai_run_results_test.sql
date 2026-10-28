BEGIN;
SELECT plan(6);

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

INSERT INTO auth.users (id)
VALUES
  ('a7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002');

SELECT ok(
  NOT has_table_privilege('anon', 'public.ai_run_results', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.ai_run_results', 'INSERT,UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('service_role', 'public.ai_run_results', 'SELECT')
    AND has_table_privilege('service_role', 'public.ai_run_results', 'INSERT')
    AND has_table_privilege('service_role', 'public.ai_run_results', 'UPDATE')
    AND has_table_privilege('service_role', 'public.ai_run_results', 'DELETE'),
  'only the service role writes AI run results; anon cannot read them'
);

INSERT INTO public.ai_run_results (user_id, feature, result_key, status, body, finished_at)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'generate', 'req_1_own', 200, '{"output":{"case":"own"}}', now()),
  ('a7000000-0000-4000-8000-000000000002', 'generate', 'req_1_other', 200, '{"output":{"case":"other"}}', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT is(
  (SELECT array_agg(result_key) FROM public.ai_run_results),
  ARRAY['req_1_own'],
  'a signed-in user reads only their own run result'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.ai_run_results SET status = 500
    WHERE user_id = 'a7000000-0000-4000-8000-000000000001'$$),
  0::bigint,
  'a signed-in user cannot rewrite their run result'
);
SELECT is(
  pg_temp.rows_changed($$INSERT INTO public.ai_run_results (user_id, feature, result_key, status, body)
    VALUES ('a7000000-0000-4000-8000-000000000001', 'attack', 'req_forged', 200, '{}')$$),
  0::bigint,
  'a signed-in user cannot plant a run result'
);
SELECT lives_ok(
  $$SELECT public.clear_current_user_data()$$,
  'clearing data runs with the new table'
);
RESET ROLE;
SELECT is(
  (SELECT array_agg(result_key) FROM public.ai_run_results),
  ARRAY['req_1_other'],
  'clearing data removes the user''s run results and no one else''s'
);

SELECT * FROM finish();
ROLLBACK;
