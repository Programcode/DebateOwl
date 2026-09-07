BEGIN;
SELECT plan(11);

SELECT ok(
  NOT has_table_privilege('anon', 'public.demo_access_codes', 'SELECT'),
  'anonymous callers cannot read demo codes'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.demo_access_codes', 'SELECT'),
  'authenticated callers cannot read demo codes directly'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.demo_access_codes', 'UPDATE'),
  'authenticated callers cannot mutate demo codes directly'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.demo_access_attempts', 'SELECT'),
  'anonymous callers cannot read demo login attempts'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.demo_access_attempts', 'INSERT'),
  'authenticated callers cannot write demo login attempts'
);
SELECT ok(
  has_table_privilege('service_role', 'public.demo_access_codes', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role owns demo-code access'
);
SELECT ok(
  has_function_privilege('anon', 'public.consume_demo_access_code(uuid)', 'EXECUTE') = false,
  'anonymous callers cannot reserve a demo code'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.consume_demo_access_code(uuid)', 'EXECUTE') = false,
  'authenticated callers cannot reserve a demo code'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_demo_access_code(uuid)', 'EXECUTE'),
  'service role can reserve a demo code'
);

INSERT INTO auth.users (id, email)
VALUES ('33333333-3333-4333-8333-333333333333', 'demo-rls-test@example.com');
INSERT INTO public.demo_access_codes (code_hash, label, email, max_uses, created_by)
VALUES ('demo-rls-test-hash', 'RLS test', 'demo-rls-test@example.com', 1, '33333333-3333-4333-8333-333333333333');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT reserved FROM public.consume_demo_access_code(
    (SELECT id FROM public.demo_access_codes WHERE code_hash = 'demo-rls-test-hash')
  )$$,
  ARRAY[true],
  'the first reservation succeeds'
);
SELECT results_eq(
  $$SELECT reserved FROM public.consume_demo_access_code(
    (SELECT id FROM public.demo_access_codes WHERE code_hash = 'demo-rls-test-hash')
  )$$,
  ARRAY[false],
  'the max-use reservation is atomic'
);

SELECT * FROM finish();
ROLLBACK;
