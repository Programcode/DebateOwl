BEGIN;
SELECT plan(73);

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

-- tier/daily_limit/can_access_pro_models/source, at p_at.
CREATE FUNCTION pg_temp.plan_of(p_user_id uuid, p_at timestamptz DEFAULT now())
RETURNS text LANGUAGE sql AS $$
  SELECT format('%s/%s/%s/%s', e.tier, e.daily_limit, e.can_access_pro_models::text, coalesce(e.source, '-'))
  FROM public.effective_entitlement(p_user_id, p_at) AS e
$$;

-- Sets the user_settings fields the plan reads.
CREATE FUNCTION pg_temp.settings(p_user_id uuid, p_tier text, p_trial_ends timestamptz, p_grace_ends timestamptz, p_override integer DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.user_settings SET subscription_tier = p_tier, trial_ends_at = p_trial_ends,
    grace_period_ends_at = p_grace_ends, daily_limit_override = p_override
  WHERE user_id = p_user_id
$$;

CREATE FUNCTION pg_temp.stripe(p_user_id uuid, p_status subscription_status, p_period_end timestamptz)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
  VALUES (p_user_id, 'cus_' || p_user_id, 'sub_' || gen_random_uuid(), p_status, now() - interval '1 day', p_period_end)
$$;

CREATE FUNCTION pg_temp.store(
  p_user_id uuid, p_tier text, p_expires timestamptz,
  p_grace timestamptz DEFAULT NULL, p_revoked timestamptz DEFAULT NULL, p_family boolean DEFAULT false
)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.app_store_subscriptions (original_transaction_id, user_id, product_id, transaction_id, environment,
    purchased_at, expires_at, revoked_at, family_shared, transaction_signed_at, grace_period_expires_at, renewal_signed_at)
  VALUES (gen_random_uuid()::text, p_user_id, 'com.adam.debatelab.' || p_tier || '.monthly', gen_random_uuid()::text, 'Production',
    now() - interval '1 day', p_expires, p_revoked, p_family, now() - interval '1 day', p_grace, now() - interval '1 day')
$$;

-- A camelCase transaction as the Edge Functions pass it.
CREATE FUNCTION pg_temp.tx(p_original text, p_transaction text, p_tier text, p_expires timestamptz, p_signed timestamptz, p_revoked timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'originalTransactionId', p_original, 'transactionId', p_transaction,
    'productId', 'com.adam.debatelab.' || p_tier || '.monthly', 'environment', 'Production',
    'purchaseDate', p_expires - interval '30 days', 'expiresDate', p_expires, 'signedDate', p_signed,
    'revocationDate', p_revoked, 'revocationReason', CASE WHEN p_revoked IS NULL THEN NULL ELSE 1 END,
    'familyShared', false
  ))
$$;

INSERT INTO auth.users (id) SELECT ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid FROM generate_series(1, 40) AS n;

-- ============================================================
-- Privileges
-- ============================================================

SELECT ok(
  has_function_privilege('authenticated', 'public.effective_entitlement(uuid, timestamptz)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.effective_entitlement(uuid, timestamptz)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.effective_entitlement(uuid, timestamptz)', 'EXECUTE'),
  'signed-in users and the service role read plans; anonymous callers cannot'
);
SELECT ok(
  has_function_privilege('service_role', 'public.apply_app_store_transaction(uuid, jsonb, jsonb, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.apply_app_store_transaction(uuid, jsonb, jsonb, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.apply_app_store_transaction(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'only the service role applies App Store transactions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.app_store_subscriptions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.app_store_subscriptions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.app_store_subscriptions', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.app_store_products', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.app_store_products', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.app_store_products', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.app_store_subscriptions', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.app_store_products', 'SELECT'),
  'clients cannot write App Store entitlements or products, and anonymous callers cannot read them'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.app_store_notifications', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.app_store_notifications', 'SELECT')
    AND has_table_privilege('service_role', 'public.app_store_notifications', 'INSERT'),
  'notification records belong to the service role'
);
SELECT results_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE oid IN (
    'public.app_store_products'::regclass, 'public.app_store_subscriptions'::regclass, 'public.app_store_notifications'::regclass)$$,
  ARRAY[true, true, true],
  'every App Store table enables RLS'
);

-- ============================================================
-- Stripe, promo, trial and legacy access: the rules _shared/entitlements.ts
-- applied before this migration, each with no App Store row.
-- ============================================================

DELETE FROM public.user_settings WHERE user_id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000001', 'pro', now() + interval '30 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000001'), 'expired/0/false/-',
  'a missing settings row fails closed instead of granting a trial, even with an App Store subscription');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000002', 'pro', NULL, NULL);
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000002', 'active', now() + interval '30 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000002'), 'pro/50/true/stripe',
  'Stripe alone: an active subscription with the pro flag grants Pro');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000002', now() + interval '31 days'), 'expired/0/false/-',
  'Stripe alone: Pro ends with the paid period');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000003', 'pro', NULL, NULL);
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000003', 'past_due', now() + interval '30 days');
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000003', 'canceled', now() + interval '30 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000003'), 'expired/0/false/-',
  'Stripe alone: past-due and canceled subscriptions grant nothing');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000004', 'expired', NULL, NULL);
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000004', 'active', now() + interval '30 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000004'), 'expired/0/false/-',
  'Stripe alone: an active subscription counts only while the webhook flag says pro');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000005', 'pro', now() + interval '1 day', now() - interval '1 day');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000005'), 'trial/5/false/trial',
  'a lapsed pro subscription falls back to an active gift trial');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000006', 'pro', NULL, now() + interval '1 day');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000006'), 'pro/50/true/promo',
  'a promo grace period grants pro model access');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000007', 'legacy_free', NULL, now() + interval '1 day');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000007'), 'legacy_free/50/true/legacy',
  'legacy free users in their grace period get pro-level access');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000008', 'legacy_free', now() + interval '1 day', now() - interval '1 day');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000008'), 'trial/5/false/trial',
  'an ended legacy grace period falls back to an active gift trial');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000009', 'trial', now() + interval '1 day', NULL);
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000009'), 'trial/5/false/trial', 'an active trial grants five requests a day');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000009', now() + interval '2 days'), 'expired/0/false/-', 'an ended trial grants nothing');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000010', 'trial', now() + interval '1 day', NULL, 3);
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000010'), 'trial/3/false/trial', 'daily_limit_override wins over the tier default');


SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000012', 'expired', NULL, NULL, 15);
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000012'), 'expired/15/false/-',
  'an override still applies to expired access, as the extra-limit promo needs');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000013', NULL, now() + interval '1 day', NULL);
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000013'), 'trial/5/false/trial', 'a null tier reads as a trial');

-- ============================================================
-- App Store access, alone and with the other sources
-- ============================================================

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000014', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000014', 'basic', now() + interval '10 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000014'), 'basic/20/false/app_store',
  'App Store alone: Basic grants twenty requests a day without Pro models');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000015', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000015', 'pro', now() + interval '10 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000015'), 'pro/50/true/app_store', 'App Store alone: Pro grants Pro');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000015', now() + interval '11 days'), 'expired/0/false/-',
  'App Store alone: access ends at expiresDate');
SELECT is(
  (SELECT e.expires_at FROM public.effective_entitlement('e0000000-0000-4000-8000-000000000015') AS e),
  (SELECT s.expires_at FROM public.app_store_subscriptions AS s WHERE s.user_id = 'e0000000-0000-4000-8000-000000000015'),
  'the plan reports the winning source''s expiry'
);

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000016', 'pro', NULL, NULL);
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000016', 'active', now() + interval '30 days');
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000016', 'pro', now() + interval '60 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000016'), 'pro/50/true/app_store',
  'both at once: two Pro subscriptions report the one that lasts longer');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000016', now() + interval '45 days'), 'pro/50/true/app_store',
  'both at once: Pro continues on the App Store after Stripe ends');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000017', 'pro', NULL, NULL);
SELECT pg_temp.stripe('e0000000-0000-4000-8000-000000000017', 'active', now() + interval '30 days');
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000017', 'basic', now() + interval '60 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000017'), 'pro/50/true/stripe',
  'both at once: Stripe Pro outranks App Store Basic');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000017', now() + interval '45 days'), 'basic/20/false/app_store',
  'both at once: Basic remains after Stripe Pro ends');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000018', 'trial', now() + interval '1 day', NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000018', 'basic', now() + interval '10 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000018'), 'basic/20/false/app_store', 'Basic outranks a trial');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000019', 'legacy_free', NULL, now() + interval '5 days');
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000019', 'basic', now() + interval '10 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000019'), 'legacy_free/50/true/legacy',
  'legacy Pro-level access outranks Basic');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000020', 'trial', now() + interval '1 day', NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000020', 'pro', now() - interval '1 hour');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000020'), 'trial/5/false/trial',
  'an expired App Store subscription falls back to the other sources');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000021', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000021', 'pro', now() - interval '1 hour', now() + interval '6 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000021'), 'pro/50/true/app_store',
  'grace period: access continues while Apple retries billing');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000021', now() + interval '7 days'), 'expired/0/false/-',
  'grace period: access ends when the grace period expires');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000022', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000022', 'pro', now() + interval '10 days', NULL, now() - interval '1 hour');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000022'), 'expired/0/false/-', 'a revoked or refunded subscription grants nothing');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000023', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000023', 'basic', now() + interval '10 days', NULL, NULL, true);
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000023'), 'basic/20/false/app_store', 'a family-shared subscription grants its tier');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000024', 'expired', NULL, NULL, 7);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000024', 'pro', now() + interval '10 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000024'), 'pro/7/true/app_store', 'daily_limit_override also replaces the App Store default');

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000025', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000025', 'basic', now() + interval '10 days');
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000025', 'pro', now() + interval '5 days');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000025'), 'pro/50/true/app_store', 'of two App Store subscriptions the higher tier wins');

SELECT results_eq(
  $$SELECT has_stripe_billing, has_app_store_subscription FROM public.effective_entitlement('e0000000-0000-4000-8000-000000000016')
    UNION ALL SELECT has_stripe_billing, has_app_store_subscription FROM public.effective_entitlement('e0000000-0000-4000-8000-000000000022')
    UNION ALL SELECT has_stripe_billing, has_app_store_subscription FROM public.effective_entitlement('e0000000-0000-4000-8000-000000000001')$$,
  $$VALUES (true, true), (false, false), (false, true)$$,
  'the plan reports Stripe billing and a live App Store subscription, which account deletion must send to Apple'
);

-- ============================================================
-- Applying signed transactions
-- ============================================================

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000030', 'expired', NULL, NULL);
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't1', 'pro', now() + interval '30 days', now() - interval '2 hours')),
  'applied', 'a linked first purchase is applied');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000030'), 'pro/50/true/app_store', 'the purchase grants Pro');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't1', 'pro', now() + interval '30 days', now() - interval '2 hours')),
  'stale', 'replaying the same signed transaction changes nothing');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't1', 'pro', now() + interval '30 days', now() - interval '3 hours', now() - interval '3 hours')),
  'stale', 'an older signature of the same transaction is ignored');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000030'), 'pro/50/true/app_store', 'so it cannot revoke access');

SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't2', 'pro', now() + interval '60 days', now() - interval '1 hour')),
  'applied', 'a renewal that expires later is applied');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't1', 'pro', now() + interval '30 days', now(), now())),
  'stale', 'a refund of an older period does not replace the current one');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000030'), 'pro/50/true/app_store', 'so the current period keeps Pro');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000030',
    pg_temp.tx('o1', 't2', 'pro', now() + interval '60 days', now(), now())),
  'applied', 'a refund of the current transaction is applied');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000030'), 'expired/0/false/-', 'and removes access');
SELECT is(
  public.apply_app_store_transaction(NULL,
    pg_temp.tx('o1', 't3', 'basic', now() + interval '90 days', now() + interval '1 minute')),
  'applied', 'a later transaction for a linked subscription applies without a token');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000030'), 'basic/20/false/app_store', 'and restores access at its new tier');

SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000031',
    pg_temp.tx('o1', 't4', 'pro', now() + interval '120 days', now() + interval '2 minutes')),
  'user_mismatch', 'a token naming another user cannot take over a subscription');
SELECT results_eq(
  $$SELECT user_id, transaction_id FROM public.app_store_subscriptions WHERE original_transaction_id = 'o1'$$,
  $$VALUES ('e0000000-0000-4000-8000-000000000030'::uuid, 't3'::text)$$,
  'and the subscription stays with its owner, unchanged'
);

SELECT is(public.apply_app_store_transaction(NULL, pg_temp.tx('o2', 't1', 'pro', now() + interval '30 days', now())),
  'unlinked', 'a new subscription without a token is not linked to anyone');
SELECT is(public.apply_app_store_transaction('e0000000-0000-4000-8000-0000000000ff', pg_temp.tx('o3', 't1', 'pro', now() + interval '30 days', now())),
  'unlinked', 'a token that names no account is not linked');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000031',
    pg_temp.tx('o4', 't1', 'pro', now() + interval '30 days', now()) || '{"productId": "com.example.unknown"}'),
  'unknown_product', 'an unknown product is refused');
SELECT is(
  (SELECT count(*) FROM public.app_store_subscriptions WHERE original_transaction_id IN ('o2', 'o3', 'o4')),
  0::bigint, 'and none of those write a subscription');

-- Notifications: idempotent on notificationUUID.
SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000032', 'expired', NULL, NULL);
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000032',
    pg_temp.tx('o5', 't1', 'pro', now() + interval '30 days', now() - interval '1 hour'), NULL,
    '{"notificationUUID": "e5000000-0000-4000-8000-000000000001", "notificationType": "SUBSCRIBED", "subtype": "INITIAL_BUY", "environment": "Production", "signedDate": "2026-10-14T00:00:00Z"}'),
  'applied', 'a notification applies its transaction');
SELECT is(
  public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000032',
    pg_temp.tx('o5', 't1', 'pro', now() + interval '30 days', now(), now()), NULL,
    '{"notificationUUID": "e5000000-0000-4000-8000-000000000001", "notificationType": "SUBSCRIBED", "subtype": "INITIAL_BUY", "environment": "Production", "signedDate": "2026-10-14T00:00:00Z"}'),
  'duplicate', 'a notification delivered twice is applied once');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000032'), 'pro/50/true/app_store', 'so the replayed payload changes nothing');
SELECT results_eq(
  $$SELECT notification_type, result FROM public.app_store_notifications WHERE notification_uuid = 'e5000000-0000-4000-8000-000000000001'$$,
  $$VALUES ('SUBSCRIBED'::text, 'applied'::text)$$,
  'the notification is recorded once with its outcome'
);
SELECT is(
  public.apply_app_store_transaction(NULL, NULL, NULL,
    '{"notificationUUID": "e5000000-0000-4000-8000-000000000002", "notificationType": "TEST", "environment": "Sandbox", "signedDate": "2026-10-14T00:00:00Z"}'),
  'ignored', 'a notification without a transaction is recorded and ignored');

-- Renewal info: billing grace and its end.
SELECT is(
  public.apply_app_store_transaction(NULL,
    pg_temp.tx('o5', 't1', 'pro', now() - interval '1 hour', now() - interval '1 hour'),
    jsonb_build_object('signedDate', now(), 'autoRenew', true, 'gracePeriodExpiresDate', now() + interval '6 days')),
  'applied', 'renewal info with a grace period is applied');
SELECT is(
  public.apply_app_store_transaction(NULL,
    pg_temp.tx('o5', 't1', 'pro', now() - interval '1 hour', now() - interval '1 hour'),
    jsonb_build_object('signedDate', now() - interval '1 minute', 'autoRenew', false)),
  'stale', 'older renewal info is ignored');
SELECT results_eq(
  $$SELECT auto_renew, grace_period_expires_at > now() FROM public.app_store_subscriptions WHERE original_transaction_id = 'o5'$$,
  $$VALUES (true, true)$$,
  'so the grace period survives it'
);

-- ============================================================
-- Isolation: users read only their own entitlements
-- ============================================================

SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000035', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000035', 'basic', now() + interval '10 days');
SELECT pg_temp.settings('e0000000-0000-4000-8000-000000000036', 'expired', NULL, NULL);
SELECT pg_temp.store('e0000000-0000-4000-8000-000000000036', 'pro', now() + interval '10 days');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000035', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.app_store_subscriptions$$), 1::bigint,
  'a user sees only their own App Store subscription');
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000035'), 'basic/20/false/app_store',
  'a user reads their own plan through RLS');
SELECT results_eq(
  $$SELECT tier, has_app_store_subscription FROM public.effective_entitlement('e0000000-0000-4000-8000-000000000036')$$,
  $$VALUES ('expired'::text, false)$$,
  'asking for another user''s plan reveals nothing about it'
);
SELECT is(
  pg_temp.rows_changed($$UPDATE public.app_store_subscriptions SET expires_at = now() + interval '1 year'$$),
  0::bigint, 'a user cannot extend their own subscription');
SELECT is(
  pg_temp.rows_changed($$INSERT INTO public.app_store_subscriptions (original_transaction_id, user_id, product_id, transaction_id,
      environment, purchased_at, expires_at, transaction_signed_at)
    VALUES ('forged', 'e0000000-0000-4000-8000-000000000035', 'com.adam.debatelab.pro.monthly', 'forged', 'Production', now(), now() + interval '1 year', now())$$),
  0::bigint, 'a user cannot insert a subscription');
SELECT is(pg_temp.rows_changed($$DELETE FROM public.app_store_subscriptions$$), 0::bigint, 'a user cannot delete subscriptions');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.app_store_notifications$$), 0::bigint, 'a user sees no notification records');
SELECT throws_ok(
  $$SELECT public.apply_app_store_transaction('e0000000-0000-4000-8000-000000000035',
    pg_temp.tx('o9', 't1', 'pro', now() + interval '30 days', now()))$$,
  '42501', NULL, 'a user cannot apply a transaction');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.app_store_products$$) > 0, true, 'a user can read the product catalog');

RESET ROLE;
SELECT is(pg_temp.plan_of('e0000000-0000-4000-8000-000000000036'), 'pro/50/true/app_store',
  'the service path still reads the other user''s Pro plan');

SELECT * FROM finish();
ROLLBACK;
