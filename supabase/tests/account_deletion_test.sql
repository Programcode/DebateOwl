BEGIN;
SELECT plan(29);

-- The leaver deletes their account; the stayer shares workspaces, announcements,
-- and grants with them and must keep everything of their own.
INSERT INTO auth.users (id, email) VALUES
  ('ac000000-0000-4000-8000-00000000000a', 'leaver@example.test'),
  ('ac000000-0000-4000-8000-00000000000b', 'stayer@example.test');

-- Table names whose foreign keys into auth.users find no row for the user.
CREATE FUNCTION pg_temp.owned_tables_without_rows(p_user_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_table record;
  v_found boolean;
BEGIN
  FOR v_table IN
    SELECT owner.oid::regclass AS relation, owner.relname AS name,
      string_agg(format('%I = $1', reference.attname), ' OR ') AS predicate
    FROM pg_constraint AS fk
    JOIN pg_class AS owner ON owner.oid = fk.conrelid
    JOIN pg_namespace AS schema ON schema.oid = owner.relnamespace
    JOIN pg_attribute AS reference ON reference.attrelid = fk.conrelid AND reference.attnum = fk.conkey[1]
    WHERE fk.contype = 'f' AND fk.confrelid = 'auth.users'::regclass AND schema.nspname = 'public'
    GROUP BY owner.oid, owner.relname
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %s)', v_table.relation, v_table.predicate)
      INTO v_found USING p_user_id;
    IF NOT v_found THEN RETURN NEXT v_table.name; END IF;
  END LOOP;
END;
$$;

-- Every public and private table with any row whose text contains the id,
-- whichever column, array, or JSON value holds it.
CREATE FUNCTION pg_temp.tables_mentioning(p_user_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_table record;
  v_found boolean;
BEGIN
  FOR v_table IN
    SELECT format('%I.%I', schemaname, tablename) AS name
    FROM pg_tables WHERE schemaname IN ('public', 'private')
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s AS t WHERE t::text LIKE $1)', v_table.name)
      INTO v_found USING '%' || p_user_id::text || '%';
    IF v_found THEN RETURN NEXT v_table.name; END IF;
  END LOOP;
END;
$$;

SELECT ok(
  has_function_privilege('service_role', 'public.export_account_data(uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.account_deletion_plan(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.account_deletion_plan(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.export_account_data(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.account_deletion_plan(uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.prepare_account_deletion(uuid)', 'EXECUTE'),
  'only the service role can export, plan, or prepare an account deletion, so a user cannot name another user'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.clear_deleted_user_announcements()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'private.clear_deleted_user_announcements()', 'EXECUTE'),
  'the deletion trigger is not callable through the Data API'
);

-- Debate work, saved results, and usage for both users.
INSERT INTO public.debates (id, user_id, motion) VALUES
  ('ac100000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000a', 'This House would leave'),
  ('ac100000-0000-4000-8000-00000000000b', 'ac000000-0000-4000-8000-00000000000b', 'This House would stay');
INSERT INTO public.current_debates (user_id, debate_id) VALUES
  ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a'),
  ('ac000000-0000-4000-8000-00000000000b', 'ac100000-0000-4000-8000-00000000000b');
INSERT INTO public.sources (id, user_id, debate_id, title, content, type) VALUES
  ('ac200000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Leaver study', 'LEAVER-PRIVATE evidence', 'text'),
  ('ac200000-0000-4000-8000-00000000000b', 'ac000000-0000-4000-8000-00000000000b', 'ac100000-0000-4000-8000-00000000000b', 'Stayer study', 'STAYER-PRIVATE evidence', 'text');
-- source_files is user-writable, so this key names the stayer's object to try to get it deleted.
INSERT INTO public.source_files (user_id, source_id, filename, storage_key) VALUES
  ('ac000000-0000-4000-8000-00000000000a', 'ac200000-0000-4000-8000-00000000000a', 'notes.txt', 'stayer/notes.txt');
INSERT INTO public.source_folders (user_id, name) VALUES ('ac000000-0000-4000-8000-00000000000a', 'Folder');
INSERT INTO public.cases (user_id, debate_id, side, title, input, output)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'pro', 'Case', '{}', '{}');
INSERT INTO public.attacks (user_id, debate_id, title, input, output)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Attack', '{}', '{}');
INSERT INTO public.brainstorms (user_id, debate_id, title, input, output)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Brainstorm', '{}', '{}');
INSERT INTO public.factoids (user_id, debate_id, title, input, output)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Factoids', '{}', '{}');
INSERT INTO public.crossfires (user_id, debate_id, title, input, output)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Crossfire', '{}', '{}');
INSERT INTO public.chats (id, user_id, debate_id, title)
  VALUES ('ac300000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Chat');
INSERT INTO public.messages (chat_id, role, content)
  VALUES ('ac300000-0000-4000-8000-00000000000a', 'user', 'LEAVER-MESSAGE');
INSERT INTO public.flowcharts (user_id, title) VALUES ('ac000000-0000-4000-8000-00000000000a', 'Flow');
INSERT INTO public.evidence_cards (user_id, claim, quote)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'Claim', 'Quote');
INSERT INTO public.sparring_sessions (user_id, debate_id, motion, user_side, persona)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'Motion', 'pro', 'coach');
INSERT INTO public.debate_context_pins (user_id, debate_id, item_kind, item_id)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac100000-0000-4000-8000-00000000000a', 'chat', 'ac300000-0000-4000-8000-00000000000a');
INSERT INTO public.ai_requests (user_id, feature, provider, model)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'brainstorm', 'openrouter', 'model');
INSERT INTO public.daily_usage_counters (user_id, usage_date) VALUES ('ac000000-0000-4000-8000-00000000000a', current_date);
INSERT INTO public.rate_limits (user_id, limit_type, limit_value) VALUES ('ac000000-0000-4000-8000-00000000000a', 'daily', 5);
INSERT INTO public.api_keys (user_id, provider, key_ciphertext) VALUES ('ac000000-0000-4000-8000-00000000000a', 'openai', 'LEAVER-CIPHERTEXT');
INSERT INTO public.user_roles (user_id, role) VALUES ('ac000000-0000-4000-8000-00000000000a', 'admin');
INSERT INTO public.user_data_clear_markers (user_id, cleared_at) VALUES ('ac000000-0000-4000-8000-00000000000a', now());
INSERT INTO public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
  VALUES ('ac000000-0000-4000-8000-00000000000a', 'cus_leaver', 'sub_leaver', 'active', now(), now() + interval '30 days');
-- A checkout customer whose subscription the webhook has not recorded yet.
INSERT INTO public.stripe_customers (user_id, customer_id) VALUES ('ac000000-0000-4000-8000-00000000000a', 'cus_leaver_checkout');

-- Admin-authored rows: the leaver is an admin whose catalog work must survive.
INSERT INTO public.promo_codes (id, code, type, created_by)
  VALUES ('ac400000-0000-4000-8000-00000000000a', 'LEAVERPROMO', 'free_month', 'ac000000-0000-4000-8000-00000000000a');
INSERT INTO public.user_promos (user_id, promo_code_id) VALUES ('ac000000-0000-4000-8000-00000000000a', 'ac400000-0000-4000-8000-00000000000a');
INSERT INTO public.curated_sources (title, content, created_by) VALUES ('Curated', 'Curated content', 'ac000000-0000-4000-8000-00000000000a');
INSERT INTO public.global_prompts (feature, prompt_text, created_by) VALUES ('brainstorm', 'Prompt', 'ac000000-0000-4000-8000-00000000000a');
INSERT INTO public.demo_access_codes (code_hash, label, email, created_by)
  VALUES ('leaver-hash', 'Leaver code', 'demo@example.test', 'ac000000-0000-4000-8000-00000000000a');
INSERT INTO public.admin_grants (admin_user_id, target_user_id, grant_type, starts_at, ends_at, notes) VALUES
  ('ac000000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000b', 'pro', now(), now() + interval '1 day', 'NOTE-BY-LEAVER'),
  ('ac000000-0000-4000-8000-00000000000b', 'ac000000-0000-4000-8000-00000000000a', 'pro', now(), now() + interval '1 day', 'ADMIN-ONLY-NOTE');
INSERT INTO public.shared_items (share_code, item_type, item_data, title, created_by)
  VALUES ('LEAVERSHARE', 'case', '{}', 'Shared case', 'ac000000-0000-4000-8000-00000000000a');
INSERT INTO public.admin_announcements (id, title, body, target_type, target_user_ids, created_by) VALUES
  ('ac500000-0000-4000-8000-000000000001', 'By leaver', 'Body', 'users', ARRAY['ac000000-0000-4000-8000-00000000000b']::uuid[], 'ac000000-0000-4000-8000-00000000000a'),
  ('ac500000-0000-4000-8000-000000000002', 'Only leaver', 'Body', 'users', ARRAY['ac000000-0000-4000-8000-00000000000a']::uuid[], 'ac000000-0000-4000-8000-00000000000b'),
  ('ac500000-0000-4000-8000-000000000003', 'Both', 'Body', 'users', ARRAY['ac000000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000b']::uuid[], 'ac000000-0000-4000-8000-00000000000b');
INSERT INTO public.admin_announcements (id, title, body, target_type, target_user_ids, created_by, starts_at) VALUES
  ('ac500000-0000-4000-8000-000000000004', 'SCHEDULED-ANNOUNCEMENT', 'Body', 'users', ARRAY['ac000000-0000-4000-8000-00000000000a', 'ac000000-0000-4000-8000-00000000000b']::uuid[], 'ac000000-0000-4000-8000-00000000000b', now() + interval '1 day');
INSERT INTO public.user_announcement_dismissals (announcement_id, user_id)
  VALUES ('ac500000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-00000000000a');

-- Workspaces: one the leaver owns with the stayer as a member, and one the
-- stayer owns where the leaver contributed.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000a', true);
SELECT public.create_workspace('Leaver motion', 'Leaver workspace', 'en', 'ac600000-0000-4000-8000-00000000000a');
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000b', true);
SELECT public.create_workspace('Stayer motion', 'Stayer workspace', 'en', 'ac600000-0000-4000-8000-00000000000b');
RESET ROLE;
SELECT set_config('test.leaver_workspace', (SELECT id::text FROM public.workspaces WHERE owner_id = 'ac000000-0000-4000-8000-00000000000a'), true);
SELECT set_config('test.stayer_workspace', (SELECT id::text FROM public.workspaces WHERE owner_id = 'ac000000-0000-4000-8000-00000000000b'), true);
SELECT set_config('test.stayer_document', (SELECT id::text FROM public.workspace_documents WHERE workspace_id = current_setting('test.stayer_workspace')::uuid ORDER BY side, position LIMIT 1), true);
INSERT INTO public.workspace_members (workspace_id, user_id) VALUES
  (current_setting('test.leaver_workspace')::uuid, 'ac000000-0000-4000-8000-00000000000b'),
  (current_setting('test.stayer_workspace')::uuid, 'ac000000-0000-4000-8000-00000000000a');
UPDATE public.workspace_documents SET assignee_id = 'ac000000-0000-4000-8000-00000000000a'
  WHERE id = current_setting('test.stayer_document')::uuid;
-- Invite redemption attempts name the actor without a foreign key.
INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success, failure_reason)
  VALUES ('ac000000-0000-4000-8000-00000000000a', decode(repeat('ac', 32), 'hex'), false, 'unavailable');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000a', true);
SELECT public.save_workspace_source(
  current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000001',
  'Leaver evidence', 'Shared evidence', 'text', '{}', '{}'
);
SELECT public.create_workspace_thread(current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000002', 'Leaver thread');
SELECT public.save_workspace_thread_message(
  current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000002',
  'ac700000-0000-4000-8000-000000000003', 'ac700000-0000-4000-8000-000000000004', 'user', 'Question', 'complete'
);
SELECT public.save_workspace_artifact(
  current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000005',
  'ac700000-0000-4000-8000-000000000006', current_setting('test.stayer_document')::uuid, 0,
  'attack', 'complete', '{}', '{}', '{}'
);
SELECT public.create_workspace_proposal(
  current_setting('test.stayer_workspace')::uuid, current_setting('test.stayer_document')::uuid,
  'ac700000-0000-4000-8000-000000000007', 0, 0,
  jsonb_build_object(
    'id', 'ac700000-0000-4000-8000-000000000007',
    'authorId', 'ac000000-0000-4000-8000-00000000000a',
    'documentEpoch', 0,
    'baseStateVector', jsonb_build_array(),
    'hunks', jsonb_build_array(jsonb_build_object('id', 'hunk-1'))
  )
);
SELECT public.create_workspace_comment(
  current_setting('test.stayer_workspace')::uuid, current_setting('test.stayer_document')::uuid,
  'ac700000-0000-4000-8000-000000000008',
  jsonb_build_object('id', 'ac700000-0000-4000-8000-000000000008', 'documentEpoch', 0,
    'from', jsonb_build_array(1), 'to', jsonb_build_array(2), 'quote', 'claim'),
  'Leaver comment', ARRAY['ac000000-0000-4000-8000-00000000000b']::uuid[]
);
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000b', true);
SELECT public.create_workspace_comment(
  current_setting('test.stayer_workspace')::uuid, current_setting('test.stayer_document')::uuid,
  'ac700000-0000-4000-8000-000000000009',
  jsonb_build_object('id', 'ac700000-0000-4000-8000-000000000009', 'documentEpoch', 0,
    'from', jsonb_build_array(1), 'to', jsonb_build_array(2), 'quote', 'claim'),
  'Stayer comment', ARRAY['ac000000-0000-4000-8000-00000000000a']::uuid[]
);
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000a', true);
SELECT public.reply_workspace_comment(
  current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000009',
  'ac700000-0000-4000-8000-00000000000a', 'Leaver reply'
);
SELECT public.resolve_workspace_comment(current_setting('test.stayer_workspace')::uuid, 'ac700000-0000-4000-8000-000000000009', true);
SELECT public.create_workspace_version(
  current_setting('test.stayer_workspace')::uuid, current_setting('test.stayer_document')::uuid,
  'Leaver version', 0, 'ac700000-0000-4000-8000-00000000000b'
);
RESET ROLE;

-- A workspace the leaver contributed to and was then removed from.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000b', true);
SELECT public.create_workspace('Former motion', 'Former workspace', 'en', 'ac600000-0000-4000-8000-00000000000c');
RESET ROLE;
SELECT set_config('test.former_workspace', (SELECT id::text FROM public.workspaces WHERE create_request_id = 'ac600000-0000-4000-8000-00000000000c'), true);
INSERT INTO public.workspace_members (workspace_id, user_id)
  VALUES (current_setting('test.former_workspace')::uuid, 'ac000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-00000000000a', true);
SELECT public.save_workspace_source(
  current_setting('test.former_workspace')::uuid, 'ac700000-0000-4000-8000-00000000000c',
  'FORMER-MEMBER-SOURCE', 'Shared evidence', 'text', '{}', '{}'
);
RESET ROLE;
DELETE FROM public.workspace_members
  WHERE workspace_id = current_setting('test.former_workspace')::uuid
    AND user_id = 'ac000000-0000-4000-8000-00000000000a';

-- Something outside Postgres for the plan to report.
INSERT INTO storage.buckets (id, name) VALUES ('account-test', 'account-test');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('account-test', 'leaver/notes.txt', 'ac000000-0000-4000-8000-00000000000a'),
  ('account-test', 'stayer/notes.txt', 'ac000000-0000-4000-8000-00000000000b');

SELECT is_empty(
  $$SELECT * FROM pg_temp.owned_tables_without_rows('ac000000-0000-4000-8000-00000000000a')$$,
  'the fixture gives the leaver a row in every table with a foreign key to auth.users'
);

-- Export, as the account Edge Function calls it.
SET LOCAL ROLE service_role;
SELECT set_config('test.export', public.export_account_data('ac000000-0000-4000-8000-00000000000a')::text, true);
SELECT throws_ok(
  $$SELECT public.export_account_data('ac000000-0000-4000-8000-0000000000ff')$$,
  'P0002', 'account not found',
  'exporting a missing account fails instead of returning an empty document'
);
SELECT is(
  public.account_deletion_plan('ac000000-0000-4000-8000-00000000000a'),
  jsonb_build_object(
    'stripe_customer_ids', jsonb_build_array('cus_leaver', 'cus_leaver_checkout'),
    'storage_objects', jsonb_build_array(
      jsonb_build_object('bucket_id', 'account-test', 'name', 'leaver/notes.txt')
    )
  ),
  'the plan lists every Stripe customer and only Storage objects the leaver uploaded, not one a source_files key names'
);
RESET ROLE;

SELECT is(
  current_setting('test.export')::jsonb #>> '{account,email}',
  'leaver@example.test',
  'the export describes the signed-in account'
);
SELECT is_empty(
  $$SELECT name FROM pg_temp.owned_tables_without_rows('ac000000-0000-4000-8000-00000000000a') AS owned(name)
    UNION ALL
    SELECT fk_table FROM (
      SELECT DISTINCT owner.relname::text AS fk_table
      FROM pg_constraint AS fk
      JOIN pg_class AS owner ON owner.oid = fk.conrelid
      JOIN pg_namespace AS schema ON schema.oid = owner.relnamespace
      JOIN pg_attribute AS reference ON reference.attrelid = fk.conrelid AND reference.attnum = fk.conkey[1]
      WHERE fk.contype = 'f' AND fk.confrelid = 'auth.users'::regclass AND schema.nspname = 'public'
        AND reference.attname IN ('user_id', 'owner_id', 'author_id', 'created_by', 'recipient_id')
    ) AS tables
    WHERE NOT (current_setting('test.export')::jsonb -> 'data') ? fk_table
      AND fk_table NOT IN ('admin_grants', 'curated_sources', 'demo_access_codes', 'global_prompts', 'promo_codes')$$,
  'the export has a section for every table the user owns rows in, apart from admin catalog work and grants'
);
SELECT ok(
  current_setting('test.export')::jsonb #> '{data,workspace_comments}' @> '[{"body": "Leaver comment"}]'
    AND NOT current_setting('test.export')::jsonb #> '{data,workspace_comments}' @> '[{"body": "Stayer comment"}]'
    AND NOT (current_setting('test.export')::jsonb -> 'data') ? 'workspace_audit_events'
    AND current_setting('test.export') NOT LIKE '%SCHEDULED-ANNOUNCEMENT%'
    AND current_setting('test.export') LIKE '%Leaver evidence%'
    AND current_setting('test.export') NOT LIKE '%FORMER-MEMBER-SOURCE%',
  'the export leaves out a comment the user only resolved, audit events naming them, scheduled announcements, and work in a workspace they left'
);
SELECT ok(
  (current_setting('test.export')::jsonb -> 'data') ?& ARRAY['messages', 'announcements_received', 'admin_announcements'],
  'the export includes chat messages, announcements addressed to the user, and announcements they wrote'
);
SELECT ok(
  current_setting('test.export') LIKE '%LEAVER-PRIVATE%'
    AND current_setting('test.export') LIKE '%LEAVER-MESSAGE%'
    AND current_setting('test.export') NOT LIKE '%STAYER-PRIVATE%',
  'the export contains the user''s own content and none of another user''s'
);
SELECT ok(
  current_setting('test.export') NOT LIKE '%cus_leaver%'
    AND current_setting('test.export') NOT LIKE '%stripe_customer_id%'
    AND current_setting('test.export') NOT LIKE '%daily_limit_override%'
    AND current_setting('test.export') NOT LIKE '%gifted_trial%'
    AND current_setting('test.export') NOT LIKE '%pricing_snapshot_id%'
    AND current_setting('test.export') NOT LIKE '%raw_usage%',
  'Stripe customer ids, gifted-trial markers, limit overrides, and upstream cost fields stay out of the export'
);
SELECT ok(
  current_setting('test.export') NOT LIKE '%LEAVER-CIPHERTEXT%'
    AND current_setting('test.export')::jsonb #> '{data,api_keys,0}' ? 'key_last4'
    AND NOT current_setting('test.export')::jsonb #> '{data,api_keys,0}' ? 'key_ciphertext'
    AND NOT current_setting('test.export')::jsonb #> '{data,sparring_sessions,0}' ? 'claim_token',
  'credentials and integrity tokens are left out of the export'
);
SELECT ok(
  current_setting('test.export')::jsonb #> '{data,access_grants}' = jsonb_build_array(jsonb_build_object(
    'grant_type', 'pro',
    'starts_at', (SELECT starts_at FROM public.admin_grants WHERE target_user_id = 'ac000000-0000-4000-8000-00000000000a'),
    'ends_at', (SELECT ends_at FROM public.admin_grants WHERE target_user_id = 'ac000000-0000-4000-8000-00000000000a'),
    'created_at', (SELECT created_at FROM public.admin_grants WHERE target_user_id = 'ac000000-0000-4000-8000-00000000000a')
  ))
    AND current_setting('test.export') NOT LIKE '%ADMIN-ONLY-NOTE%'
    AND current_setting('test.export') NOT LIKE '%NOTE-BY-LEAVER%'
    AND current_setting('test.export') NOT LIKE '%LEAVERPROMO%'
    AND NOT (current_setting('test.export')::jsonb -> 'data') ?| ARRAY['admin_grants', 'promo_codes', 'demo_access_codes'],
  'the export lists access granted to the user but no admin notes, grants they made, or admin catalog rows'
);
SELECT is(
  jsonb_array_length(current_setting('test.export')::jsonb #> '{data,announcements_received}'),
  2,
  'the export lists both announcements addressed to the user'
);
SELECT ok(
  NOT (current_setting('test.export')::jsonb #> '{data,announcements_received}' @? '$[*].target_user_ids')
    AND NOT (current_setting('test.export')::jsonb #> '{data,announcements_received}' @? '$[*].created_by'),
  'received announcements do not reveal other recipients or the author'
);

SELECT isnt_empty(
  $$SELECT * FROM pg_temp.tables_mentioning('ac000000-0000-4000-8000-00000000000a')$$,
  'before deletion the leaver''s id appears across the database'
);

SELECT throws_ok(
  $$DELETE FROM auth.users WHERE id = 'ac000000-0000-4000-8000-00000000000a'$$,
  '23503', NULL,
  'a raw delete still cannot remove a workspace owner without the account deletion path'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.prepare_account_deletion('ac000000-0000-4000-8000-00000000000a')$$,
  'the account function clears the user''s workspaces before deleting the auth user'
);
RESET ROLE;

-- The Auth admin API deletes this row; the database does the rest.
SELECT lives_ok(
  $$DELETE FROM auth.users WHERE id = 'ac000000-0000-4000-8000-00000000000a'$$,
  'deleting the auth user is not blocked by any reference'
);

SELECT is_empty(
  $$SELECT * FROM pg_temp.tables_mentioning('ac000000-0000-4000-8000-00000000000a')$$,
  'after deletion no row in any public or private table contains the user id'
);
SELECT is(
  (SELECT count(*)::int FROM private.workspace_invite_attempts
    WHERE ip_hash = decode(repeat('ac', 32), 'hex') AND success = false),
  1,
  'failed invite attempts still count toward the IP limit after the account is gone'
);
SELECT is(
  (SELECT array_agg(title ORDER BY title) FROM public.sources),
  ARRAY['Stayer study'],
  'the stayer keeps their own sources'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = current_setting('test.leaver_workspace')::uuid)
    AND EXISTS (SELECT 1 FROM public.workspaces WHERE id = current_setting('test.stayer_workspace')::uuid),
  'a workspace the leaver owned is deleted; the stayer''s workspace remains'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspace_sources WHERE workspace_id = current_setting('test.stayer_workspace')::uuid),
  0,
  'the leaver''s contributions to another workspace are deleted'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspace_comments WHERE id = 'ac700000-0000-4000-8000-000000000009'),
  1,
  'the stayer''s own comment survives the leaver''s reply being deleted'
);
SELECT is(
  (SELECT array_agg(title ORDER BY title) FROM public.admin_announcements),
  ARRAY['Both', 'By leaver', 'SCHEDULED-ANNOUNCEMENT'],
  'an announcement for only the leaver is deleted; others lose the leaver as recipient or author'
);
SELECT is(
  (SELECT target_user_ids FROM public.admin_announcements WHERE title = 'Both'),
  ARRAY['ac000000-0000-4000-8000-00000000000b']::uuid[],
  'a shared announcement still reaches the stayer'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.promo_codes WHERE code = 'LEAVERPROMO' AND created_by IS NULL)
    AND EXISTS (SELECT 1 FROM public.curated_sources WHERE title = 'Curated' AND created_by IS NULL)
    AND EXISTS (SELECT 1 FROM public.admin_grants WHERE target_user_id = 'ac000000-0000-4000-8000-00000000000b' AND admin_user_id IS NULL),
  'admin-authored catalog rows and grants to others survive without the author'
);
SELECT is(
  (SELECT count(*)::int FROM public.shared_items WHERE share_code = 'LEAVERSHARE'),
  0,
  'share links to the leaver''s work stop working'
);

SELECT * FROM finish();
ROLLBACK;
