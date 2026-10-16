BEGIN;
SELECT plan(6);

SELECT is_empty(
  $$SELECT c.relname || ':' || r.role
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND has_table_privilege(r.role, c.oid, 'TRUNCATE')$$,
  'no client role can TRUNCATE a public table (RLS does not apply to TRUNCATE)'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.global_prompts', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.global_prompts', 'SELECT'),
  'operator system prompts are not readable through the Data API'
);

INSERT INTO auth.users (id) VALUES ('c1000000-0000-4000-8000-00000000000a');
INSERT INTO public.rate_limits (user_id, limit_type, limit_value) VALUES
  (NULL, 'daily_global', 500),
  ('c1000000-0000-4000-8000-00000000000a', 'daily_requests', 20);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-00000000000a', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT is(
  (SELECT array_agg(limit_type) FROM public.rate_limits),
  ARRAY['daily_requests'],
  'a signed-in user reads their own limit but not the global ones'
);
RESET ROLE;
SELECT ok(
  NOT has_table_privilege('anon', 'public.rate_limits', 'SELECT'),
  'anon cannot read rate limits'
);

SELECT set_eq(
  $$SELECT p.proname::text FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  ARRAY['get_shared_item'],
  'anon holds EXECUTE only on get_shared_item; admin RPCs rely on more than require_admin()'
);

-- A migration that forgets its grants must leave a new table closed. (A new
-- function is caught by the anon EXECUTE check above.)
CREATE TABLE public.pgtap_new_table (id serial);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pgtap_new_table', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.pgtap_new_table', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_sequence_privilege('anon', 'public.pgtap_new_table_id_seq', 'USAGE,UPDATE')
    AND NOT has_sequence_privilege('authenticated', 'public.pgtap_new_table_id_seq', 'USAGE,UPDATE'),
  'a table or sequence that postgres creates in public later grants clients nothing'
);

SELECT * FROM finish();
ROLLBACK;
