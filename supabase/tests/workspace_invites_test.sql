BEGIN;
SELECT plan(48);

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES
  ('61111111-1111-4111-8111-111111111111', 'owner@example.com', now()),
  ('62222222-2222-4222-8222-222222222222', 'member@example.com', now()),
  ('63333333-3333-4333-8333-333333333333', 'joiner@example.com', now()),
  ('64444444-4444-4444-8444-444444444444', 'other@example.com', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.create_workspace(
  'Invite test motion', 'Invite test workspace', 'en',
  '60000000-0000-4000-8000-000000000001'
);

RESET ROLE;
SELECT set_config(
  'test.workspace_id',
  (SELECT id::text FROM public.workspaces WHERE owner_id = '61111111-1111-4111-8111-111111111111'),
  true
);
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES (current_setting('test.workspace_id')::uuid, '62222222-2222-4222-8222-222222222222');

SELECT has_table('private', 'workspace_invites', 'private workspace invites exist');
SELECT has_table('private', 'workspace_invite_attempts', 'private redemption attempts exist');
SELECT ok(
  NOT has_table_privilege('anon', 'private.workspace_invites', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'private.workspace_invites', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'private.workspace_invite_attempts', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'private.workspace_invite_attempts', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser roles have no direct invite or attempt access'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.create_workspace_invite(uuid,uuid,text,bytea,text,bytea,integer,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated', 'public.redeem_workspace_invite(uuid,bytea,bytea,bytea,uuid)', 'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.create_workspace_invite(uuid,uuid,text,bytea,text,bytea,integer,uuid,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role', 'public.redeem_workspace_invite(uuid,bytea,bytea,bytea,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated', 'public.revoke_workspace_invite(uuid,uuid,uuid,uuid)', 'EXECUTE'
    )
    AND has_function_privilege(
      'service_role', 'public.revoke_workspace_invite(uuid,uuid,uuid,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon', 'public.mark_workspace_invite_email_delivered(uuid,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated', 'public.mark_workspace_invite_email_delivered(uuid,uuid)', 'EXECUTE'
    )
    AND has_function_privilege(
      'service_role', 'public.mark_workspace_invite_email_delivered(uuid,uuid)', 'EXECUTE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_proc p,
        LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.mark_workspace_invite_email_delivered(uuid,uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
  'only service_role can execute all four invite RPCs'
);

SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('01', 32), 'hex'), NULL, NULL, 2,
    '60000000-0000-4000-8000-000000000002', NULL
  )$$,
  '42501', 'service role required',
  'the privileged create RPC independently rejects a missing service-role claim'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('02', 32), 'hex'), NULL, NULL, 2,
    '60000000-0000-4000-8000-000000000003', NULL
  )$$,
  'any current member can create a shareable code'
);
RESET ROLE;
SELECT set_config(
  'test.code_invite_id',
  (SELECT id::text FROM private.workspace_invites WHERE secret_digest = decode(repeat('02', 32), 'hex')),
  true
);
SELECT results_eq(
  $$SELECT expires_at > now() + interval '47 hours 59 minutes'
      AND expires_at <= now() + interval '48 hours 1 minute'
      AND max_uses = 2
    FROM private.workspace_invites
    WHERE id = current_setting('test.code_invite_id')::uuid$$,
  ARRAY[true],
  'shareable codes expire in 48 hours and keep their bounded use count'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT invite_id FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('02', 32), 'hex'), NULL, NULL, 2,
    '60000000-0000-4000-8000-000000000003', NULL
  )$$,
  ARRAY[current_setting('test.code_invite_id')::uuid],
  'an identical create replay returns the original invite'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('03', 32), 'hex'), NULL, NULL, 2,
    '60000000-0000-4000-8000-000000000003', NULL
  )$$,
  'P0001', 'operation ID conflict',
  'conflicting request-ID reuse is rejected'
);

SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('09', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000019', NULL
  )$$,
  'a member can create the code used by the revoke contract'
);
RESET ROLE;
SELECT set_config(
  'test.revoke_invite_id',
  (SELECT id::text FROM private.workspace_invites WHERE secret_digest = decode(repeat('09', 32), 'hex')),
  true
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT revoked FROM public.revoke_workspace_invite(
    '62222222-2222-4222-8222-222222222222', current_setting('test.workspace_id')::uuid,
    current_setting('test.revoke_invite_id')::uuid,
    '60000000-0000-4000-8000-000000000020'
  )$$,
  ARRAY[true],
  'any current member can revoke a shareable code through the service RPC'
);
SELECT throws_ok(
  $$SELECT * FROM public.revoke_workspace_invite(
    '64444444-4444-4444-8444-444444444444', current_setting('test.workspace_id')::uuid,
    current_setting('test.revoke_invite_id')::uuid,
    '60000000-0000-4000-8000-000000000021'
  )$$,
  'P0001', 'workspace unavailable',
  'the service RPC cannot revoke on behalf of a non-member'
);

SELECT results_eq(
  $$SELECT status, already_member FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('02', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000004'
  )$$,
  $$VALUES ('accepted'::text, false)$$,
  'a valid code creates membership'
);
SELECT results_eq(
  $$SELECT status, already_member FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('02', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000004'
  )$$,
  $$VALUES ('accepted'::text, false)$$,
  'an identical redemption replay returns its original membership outcome'
);
SELECT throws_ok(
  $$SELECT * FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('03', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000004'
  )$$,
  'P0001', 'operation ID conflict',
  'a redemption request ID cannot be reused with another secret'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT count(*)::bigint FROM public.workspace_members
    WHERE workspace_id = current_setting('test.workspace_id')::uuid
      AND user_id = '63333333-3333-4333-8333-333333333333'$$,
  ARRAY[1::bigint],
  'code redemption creates exactly one membership row'
);
SELECT results_eq(
  $$SELECT status, already_member FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('02', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000005'
  )$$,
  $$VALUES ('accepted'::text, true)$$,
  'accepting while already a member returns the same membership outcome'
);
SELECT results_eq(
  $$SELECT use_count FROM private.workspace_invites
    WHERE id = current_setting('test.code_invite_id')::uuid$$,
  ARRAY[1],
  'already-member acceptance does not consume another use'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('04', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000006', current_setting('test.code_invite_id')::uuid
  )$$,
  'a member can rotate a shareable code'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT revoked_at IS NOT NULL FROM private.workspace_invites
    WHERE id = current_setting('test.code_invite_id')::uuid$$,
  ARRAY[true],
  'rotation revokes the prior code'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '64444444-4444-4444-8444-444444444444', decode(repeat('02', 32), 'hex'),
    decode(repeat('14', 32), 'hex'), decode(repeat('24', 32), 'hex'),
    '60000000-0000-4000-8000-000000000007'
  )$$,
  ARRAY['unavailable'::text],
  'a rotated code cannot be redeemed'
);

SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'email', decode(repeat('05', 32), 'hex'), 'ciphertext-only', decode(repeat('15', 32), 'hex'), 1,
    '60000000-0000-4000-8000-000000000008', NULL
  )$$,
  'a member can create a single-use email invitation'
);
RESET ROLE;
SELECT set_config(
  'test.email_invite_id',
  (SELECT id::text FROM private.workspace_invites WHERE secret_digest = decode(repeat('05', 32), 'hex')),
  true
);
SELECT results_eq(
  $$SELECT expires_at > now() + interval '6 days 23 hours 59 minutes'
      AND expires_at <= now() + interval '7 days 1 minute'
      AND max_uses = 1
      AND email_delivered_at IS NULL
    FROM private.workspace_invites WHERE secret_digest = decode(repeat('05', 32), 'hex')$$,
  ARRAY[true],
  'email invitations begin pending, are single-use, and expire in seven days'
);
UPDATE private.workspace_invites
SET expires_at = now() - interval '1 second'
WHERE id = current_setting('test.email_invite_id')::uuid;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT public.mark_workspace_invite_email_delivered(
    '61111111-1111-4111-8111-111111111111', current_setting('test.email_invite_id')::uuid
  )$$,
  'P0001', 'workspace unavailable',
  'the delivery marker rejects an expired pending invitation'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT email_delivered_at IS NULL FROM private.workspace_invites
    WHERE id = current_setting('test.email_invite_id')::uuid$$,
  ARRAY[true],
  'expired delivery rejection keeps the invitation pending'
);
UPDATE private.workspace_invites
SET expires_at = now() + interval '7 days'
WHERE id = current_setting('test.email_invite_id')::uuid;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT public.mark_workspace_invite_email_delivered(
    '61111111-1111-4111-8111-111111111111', current_setting('test.email_invite_id')::uuid
  )$$,
  '42501', 'service role required',
  'the delivery marker independently rejects a missing service-role claim'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT public.mark_workspace_invite_email_delivered(
    '62222222-2222-4222-8222-222222222222', current_setting('test.email_invite_id')::uuid
  )$$,
  'P0001', 'workspace unavailable',
  'the delivery marker rejects an actor who did not issue the invitation'
);
SELECT throws_ok(
  $$SELECT public.mark_workspace_invite_email_delivered(
    '61111111-1111-4111-8111-111111111111', 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  )$$,
  'P0001', 'workspace unavailable',
  'the delivery marker rejects an unknown invitation'
);
SELECT results_eq(
  $$SELECT public.mark_workspace_invite_email_delivered(
    '61111111-1111-4111-8111-111111111111', current_setting('test.email_invite_id')::uuid
  )$$,
  ARRAY[true],
  'the service role marks the issuing actor email invitation delivered'
);
RESET ROLE;
SELECT set_config(
  'test.email_delivered_at',
  (SELECT email_delivered_at::text FROM private.workspace_invites
    WHERE id = current_setting('test.email_invite_id')::uuid),
  true
);
SELECT ok(
  current_setting('test.email_delivered_at') <> '',
  'accepted relay delivery persists a delivered timestamp'
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT public.mark_workspace_invite_email_delivered(
      '61111111-1111-4111-8111-111111111111', current_setting('test.email_invite_id')::uuid
    ),
    (SELECT email_delivered_at::text = current_setting('test.email_delivered_at')
      FROM private.workspace_invites
      WHERE id = current_setting('test.email_invite_id')::uuid)$$,
  $$VALUES (true, true)$$,
  'delivered marking is idempotent and keeps the original timestamp'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '64444444-4444-4444-8444-444444444444', decode(repeat('05', 32), 'hex'),
    decode(repeat('99', 32), 'hex'), decode(repeat('24', 32), 'hex'),
    '60000000-0000-4000-8000-000000000009'
  )$$,
  ARRAY['unavailable'::text],
  'email redemption rejects the wrong verified Auth email hash'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT use_count FROM private.workspace_invites
    WHERE secret_digest = decode(repeat('05', 32), 'hex')$$,
  ARRAY[0],
  'wrong-email redemption consumes no invite use'
);

UPDATE private.workspace_invites
SET expires_at = now() - interval '1 second'
WHERE secret_digest = decode(repeat('04', 32), 'hex');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '64444444-4444-4444-8444-444444444444', decode(repeat('04', 32), 'hex'),
    decode(repeat('14', 32), 'hex'), decode(repeat('24', 32), 'hex'),
    '60000000-0000-4000-8000-000000000010'
  )$$,
  ARRAY['unavailable'::text],
  'an expired code cannot be redeemed'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'email', decode(repeat('0c', 32), 'hex'), 'removed-member-ciphertext',
    decode(repeat('13', 32), 'hex'), 1,
    '60000000-0000-4000-8000-000000000026', NULL
  )$$,
  'a live email invitation can target the member before removal'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.change_workspace_access(
  current_setting('test.workspace_id')::uuid, 'remove',
  '63333333-3333-4333-8333-333333333333', 0,
  '60000000-0000-4000-8000-000000000011'
);

RESET ROLE;
SELECT results_eq(
  $$SELECT count(*)::bigint FROM private.workspace_invites
    WHERE workspace_id = current_setting('test.workspace_id')::uuid
      AND revoked_at IS NULL$$,
  ARRAY[0::bigint],
  'member removal revokes every live invitation'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('04', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000012'
  )$$,
  ARRAY['unavailable'::text],
  'a removed user cannot rejoin with an old code'
);

SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('0c', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000027'
  )$$,
  ARRAY['unavailable'::text],
  'a removed user cannot rejoin with an old email invitation'
);

SELECT lives_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('06', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000013', NULL
  )$$,
  'a newly created invite can restore removed membership'
);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '63333333-3333-4333-8333-333333333333', decode(repeat('06', 32), 'hex'),
    decode(repeat('13', 32), 'hex'), decode(repeat('23', 32), 'hex'),
    '60000000-0000-4000-8000-000000000014'
  )$$,
  ARRAY['accepted'::text],
  'the explicit new invite restores membership'
);

RESET ROLE;
INSERT INTO private.workspace_invite_attempts (actor_id, ip_hash, success, created_at)
SELECT '64444444-4444-4444-8444-444444444444', decode(repeat('24', 32), 'hex'), false, now()
FROM generate_series(1, 10);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT results_eq(
  $$SELECT status FROM public.redeem_workspace_invite(
    '64444444-4444-4444-8444-444444444444', decode(repeat('ff', 32), 'hex'),
    decode(repeat('14', 32), 'hex'), decode(repeat('24', 32), 'hex'),
    '60000000-0000-4000-8000-000000000015'
  )$$,
  ARRAY['rate_limited'::text],
  'ten actor or trusted-proxy failures block redemption for fifteen minutes'
);

RESET ROLE;
ALTER TABLE private.workspace_invite_attempts RENAME TO workspace_invite_attempts_unavailable;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.redeem_workspace_invite(
    '62222222-2222-4222-8222-222222222222', decode(repeat('ff', 32), 'hex'),
    decode(repeat('12', 32), 'hex'), decode(repeat('22', 32), 'hex'),
    '60000000-0000-4000-8000-000000000016'
  )$$,
  '42P01', NULL,
  'redemption fails closed when its attempt store is unavailable'
);
RESET ROLE;
ALTER TABLE private.workspace_invite_attempts_unavailable RENAME TO workspace_invite_attempts;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('07', 32), 'hex'), NULL, NULL, 30,
    '60000000-0000-4000-8000-000000000017', NULL
  )$$,
  'P0001', 'invite capacity exceeded',
  'a code cannot exceed remaining workspace capacity'
);

RESET ROLE;
INSERT INTO private.workspace_invites (
  workspace_id, kind, secret_digest, issued_by, expires_at, max_uses
)
SELECT current_setting('test.workspace_id')::uuid, 'code', digest(i::text, 'sha256'),
  '61111111-1111-4111-8111-111111111111', now() + interval '48 hours', 1
FROM generate_series(1, 19) AS i;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '61111111-1111-4111-8111-111111111111', current_setting('test.workspace_id')::uuid,
    'code', decode(repeat('08', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000018', NULL
  )$$,
  'P0001', 'invite rate limited',
  'a member cannot create more than twenty invitations per hour'
);

RESET ROLE;
INSERT INTO public.workspaces (
  id, owner_id, motion, initial_language, create_request_id
) VALUES (
  '65555555-5555-4555-8555-555555555555',
  '61111111-1111-4111-8111-111111111111',
  'Daily invite limit', 'en', '60000000-0000-4000-8000-000000000022'
);
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES ('65555555-5555-4555-8555-555555555555', '62222222-2222-4222-8222-222222222222');
INSERT INTO private.workspace_invites (
  workspace_id, kind, secret_digest, expires_at, max_uses
)
SELECT '65555555-5555-4555-8555-555555555555', 'code',
  digest('daily-' || i::text, 'sha256'), now() + interval '48 hours', 1
FROM generate_series(1, 50) AS i;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', '65555555-5555-4555-8555-555555555555',
    'code', decode(repeat('0a', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000023', NULL
  )$$,
  'P0001', 'invite rate limited',
  'a workspace cannot create more than fifty invitations per day'
);

RESET ROLE;
INSERT INTO public.workspaces (
  id, owner_id, motion, initial_language, create_request_id
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '61111111-1111-4111-8111-111111111111',
  'Full workspace', 'en', '60000000-0000-4000-8000-000000000024'
);
INSERT INTO auth.users (id)
SELECT md5('workspace-cap-' || i::text)::uuid FROM generate_series(1, 28) AS i;
INSERT INTO public.workspace_members (workspace_id, user_id)
VALUES
  ('66666666-6666-4666-8666-666666666666', '61111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-666666666666', '62222222-2222-4222-8222-222222222222');
INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT '66666666-6666-4666-8666-666666666666', md5('workspace-cap-' || i::text)::uuid
FROM generate_series(1, 28) AS i;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.create_workspace_invite(
    '62222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666',
    'code', decode(repeat('0b', 32), 'hex'), NULL, NULL, 1,
    '60000000-0000-4000-8000-000000000025', NULL
  )$$,
  'P0001', 'invite capacity exceeded',
  'a workspace already at thirty members rejects new invitations'
);

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.workspace_audit_events
    WHERE action LIKE 'invite_%'
      AND row_to_json(workspace_audit_events)::text ~* '(owner@example|member@example|ciphertext-only|02020202|198\\.51)'
  ),
  'member-visible invite audit events contain no token, email, IP, or ciphertext'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('teams', 'workspace_teams')$$,
  ARRAY[0::bigint],
  'invitations add workspace membership without a Team entity'
);

SELECT * FROM finish();
ROLLBACK;
