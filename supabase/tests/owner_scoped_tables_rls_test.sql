BEGIN;
SELECT plan(19);

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

INSERT INTO auth.users (id) VALUES
  ('e1111111-1111-4111-8111-111111111111'),
  ('e2222222-2222-4222-8222-222222222222');
INSERT INTO public.api_keys (id, user_id, provider, key_ciphertext, key_last4) VALUES
  ('e1a00000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'openai', 'ciphertext-one', '1111'),
  ('e2a00000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'openai', 'ciphertext-two', '2222');
INSERT INTO public.debates (id, user_id, motion) VALUES
  ('e1d00000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'This House would ban homework'),
  ('e2d00000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'This House would abolish zoos');
INSERT INTO public.sources (id, user_id, debate_id, title, content, type) VALUES
  ('e1500000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'e1d00000-0000-4000-8000-000000000001', 'One', 'Body', 'text'),
  ('e2500000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'e2d00000-0000-4000-8000-000000000002', 'Two', 'Body', 'text');
INSERT INTO public.source_files (id, user_id, source_id, filename, storage_key) VALUES
  ('e1f00000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'e1500000-0000-4000-8000-000000000001', 'one.pdf', 'one/key'),
  ('e2f00000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'e2500000-0000-4000-8000-000000000002', 'two.pdf', 'two/key');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- api_keys: each user manages only their own encrypted provider keys.
SELECT results_eq(
  $$SELECT id FROM public.api_keys$$,
  $$VALUES ('e1a00000-0000-4000-8000-000000000001'::uuid)$$,
  'a user reads only their own API keys'
);
SELECT lives_ok(
  $$INSERT INTO public.api_keys (user_id, provider, key_ciphertext)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'anthropic', 'ciphertext-three')$$,
  'a user can store their own API key'
);
SELECT throws_ok(
  $$INSERT INTO public.api_keys (user_id, provider, key_ciphertext)
    VALUES ('e2222222-2222-4222-8222-222222222222', 'anthropic', 'planted')$$,
  '42501',
  NULL,
  'a user cannot store an API key on another account'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.api_keys SET key_ciphertext = 'replaced'
    WHERE id = 'e2a00000-0000-4000-8000-000000000002'$$),
  0::bigint,
  'a user cannot replace another user''s API key'
);
SELECT throws_ok(
  $$UPDATE public.api_keys SET user_id = 'e2222222-2222-4222-8222-222222222222'
    WHERE id = 'e1a00000-0000-4000-8000-000000000001'$$,
  '42501',
  NULL,
  'a user cannot move their API key onto another account'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.api_keys WHERE id = 'e2a00000-0000-4000-8000-000000000002'$$),
  0::bigint,
  'a user cannot delete another user''s API key'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.api_keys WHERE id = 'e1a00000-0000-4000-8000-000000000001'$$),
  1::bigint,
  'a user can delete their own API key'
);

-- source_files: each user manages only their own uploaded file records.
SELECT results_eq(
  $$SELECT id FROM public.source_files$$,
  $$VALUES ('e1f00000-0000-4000-8000-000000000001'::uuid)$$,
  'a user reads only their own source files'
);
SELECT lives_ok(
  $$INSERT INTO public.source_files (user_id, source_id, filename, storage_key)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'e1500000-0000-4000-8000-000000000001', 'three.pdf', 'three/key')$$,
  'a user can record their own source file'
);
SELECT throws_ok(
  $$INSERT INTO public.source_files (user_id, source_id, filename, storage_key)
    VALUES ('e2222222-2222-4222-8222-222222222222', 'e2500000-0000-4000-8000-000000000002', 'planted.pdf', 'planted/key')$$,
  '42501',
  NULL,
  'a user cannot record a source file on another account'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.source_files SET storage_key = 'redirected/key'
    WHERE id = 'e2f00000-0000-4000-8000-000000000002'$$),
  0::bigint,
  'a user cannot redirect another user''s stored file'
);
SELECT throws_ok(
  $$UPDATE public.source_files SET user_id = 'e2222222-2222-4222-8222-222222222222'
    WHERE id = 'e1f00000-0000-4000-8000-000000000001'$$,
  '42501',
  NULL,
  'a user cannot move their source file onto another account'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.source_files WHERE id = 'e2f00000-0000-4000-8000-000000000002'$$),
  0::bigint,
  'a user cannot delete another user''s source file'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.source_files SET filename = 'renamed.pdf'
    WHERE id = 'e1f00000-0000-4000-8000-000000000001'$$),
  1::bigint,
  'a user can update their own source file'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT is_empty(
  $$SELECT 1 FROM public.api_keys$$,
  'anonymous callers see no API keys'
);
SELECT is_empty(
  $$SELECT 1 FROM public.source_files$$,
  'anonymous callers see no source files'
);
SELECT throws_ok(
  $$INSERT INTO public.api_keys (user_id, provider, key_ciphertext)
    VALUES ('e2222222-2222-4222-8222-222222222222', 'anthropic', 'planted')$$,
  '42501',
  NULL,
  'anonymous callers cannot store API keys'
);
SELECT throws_ok(
  $$INSERT INTO public.source_files (user_id, source_id, filename, storage_key)
    VALUES ('e2222222-2222-4222-8222-222222222222', 'e2500000-0000-4000-8000-000000000002', 'planted.pdf', 'planted/key')$$,
  '42501',
  NULL,
  'anonymous callers cannot record source files'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT a.key_ciphertext, f.storage_key
    FROM public.api_keys a, public.source_files f
    WHERE a.user_id = 'e2222222-2222-4222-8222-222222222222'
      AND f.user_id = 'e2222222-2222-4222-8222-222222222222'$$,
  $$VALUES ('ciphertext-two'::text, 'two/key'::text)$$,
  'the other user''s key and file are untouched'
);

SELECT * FROM finish();
ROLLBACK;
