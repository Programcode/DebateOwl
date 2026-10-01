BEGIN;
SELECT plan(14);

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

-- Shares are capabilities: the share Edge Function writes them with the service
-- role, and clients read one item at a time through get_shared_item(code).
SELECT ok(
  NOT has_table_privilege('anon', 'public.shared_items', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.shared_items', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'clients have no direct table access to shares'
);
-- A privilege list passed to has_table_privilege means "any of", so check each one.
SELECT ok(
  (SELECT bool_and(has_table_privilege('service_role', 'public.shared_items', privilege))
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege),
  'the share function can read and write shares with the service role'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.get_shared_item(text)'::regprocedure
      AND 'created_by' = ANY (proargnames)
  ),
  'the share lookup does not reveal who created a share'
);

INSERT INTO auth.users (id) VALUES
  ('d1111111-1111-4111-8111-111111111111'),
  ('d2222222-2222-4222-8222-222222222222');
INSERT INTO public.shared_items (share_code, item_type, item_data, title, created_by, expires_at) VALUES
  ('pgtap-share-live', 'case', '{"body": "live"}', 'Live share', 'd1111111-1111-4111-8111-111111111111', NULL),
  ('pgtap-share-expired', 'case', '{"body": "expired"}', 'Expired share', 'd1111111-1111-4111-8111-111111111111', now() - interval '1 hour'),
  ('pgtap-share-other', 'case', '{"body": "other"}', 'Other share', 'd2222222-2222-4222-8222-222222222222', now() + interval '1 day');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT throws_ok(
  $$SELECT * FROM public.shared_items$$,
  '42501',
  NULL,
  'anonymous callers cannot list shares'
);
SELECT results_eq(
  $$SELECT share_code, title, item_data, view_count FROM public.get_shared_item('pgtap-share-live')$$,
  $$VALUES ('pgtap-share-live'::text, 'Live share'::text, '{"body": "live"}'::jsonb, 1)$$,
  'anonymous callers read exactly the share whose code they hold'
);
SELECT is_empty(
  $$SELECT * FROM public.get_shared_item('pgtap-share-expired')$$,
  'expired shares are not returned'
);
SELECT is_empty(
  $$SELECT * FROM public.get_shared_item('pgtap-share-%')$$,
  'share codes are matched exactly, not as patterns'
);
SELECT throws_ok(
  $$INSERT INTO public.shared_items (share_code, item_type, item_data, title)
    VALUES ('pgtap-share-anon', 'case', '{}', 'Anonymous share')$$,
  '42501',
  NULL,
  'anonymous callers cannot create shares directly'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT * FROM public.shared_items WHERE created_by = 'd1111111-1111-4111-8111-111111111111'$$,
  '42501',
  NULL,
  'owners cannot list their shares directly'
);
SELECT results_eq(
  $$SELECT share_code, view_count FROM public.get_shared_item('pgtap-share-other')$$,
  $$VALUES ('pgtap-share-other'::text, 1)$$,
  'signed-in callers read another user''s share only by its code'
);
SELECT throws_ok(
  $$INSERT INTO public.shared_items (share_code, item_type, item_data, title, created_by)
    VALUES ('pgtap-share-direct', 'case', '{}', 'Direct share', 'd1111111-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'owners cannot create shares directly'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.shared_items SET expires_at = NULL, view_count = 0
    WHERE share_code = 'pgtap-share-expired'$$),
  0::bigint,
  'owners cannot revive or reset their shares directly'
);
SELECT is(
  pg_temp.rows_changed($$DELETE FROM public.shared_items WHERE share_code = 'pgtap-share-other'$$),
  0::bigint,
  'signed-in callers cannot delete shares directly'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT share_code, view_count, expires_at IS NULL FROM public.shared_items
    WHERE share_code LIKE 'pgtap-share-%' ORDER BY share_code$$,
  $$VALUES
    ('pgtap-share-expired'::text, 0, false),
    ('pgtap-share-live'::text, 1, true),
    ('pgtap-share-other'::text, 1, false)$$,
  'only code lookups changed shares, and only their view counts'
);

SELECT * FROM finish();
ROLLBACK;
