-- App Store subscriptions next to Stripe, and one function that computes the
-- plan every quota and model check reads.
--
-- Sources of access:
--   user_settings          trial, promo and admin grants, legacy access, and the
--                          'pro' flag the Stripe webhook sets (unchanged)
--   subscriptions          Stripe periods, counted only while that flag is 'pro'
--                          (unchanged)
--   app_store_subscriptions App Store auto-renewable subscriptions, written only by
--                          the app-store-notifications and app-store-purchase
--                          functions after verifying Apple's signature
--
-- effective_entitlement() returns the highest active tier across them. For a
-- user with no App Store row it returns what _shared/entitlements.ts and
-- src/hooks/use-subscription.ts computed before this migration.

-- ============================================================
-- PRODUCTS
-- ============================================================

-- Product ids map to tiers here so a renamed or added product needs no code
-- change. The rows below are PLACEHOLDERS: the real ids exist only once the
-- subscriptions are created in App Store Connect. Until a real id is listed,
-- purchases of it are refused and grant nothing.
CREATE TABLE public.app_store_products (
  product_id text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('basic', 'pro')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_store_products (product_id, tier) VALUES
  ('com.adam.debatelab.basic.monthly', 'basic'),
  ('com.adam.debatelab.pro.monthly', 'pro');

ALTER TABLE public.app_store_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_store_products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_store_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_store_products TO service_role;

-- The catalog is not secret, and effective_entitlement() runs with the caller's
-- privileges, so signed-in users read it.
CREATE POLICY "app_store_products_select" ON public.app_store_products
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

-- One row per subscription (original transaction). Every value comes from a
-- JWS transaction or renewal info that Apple signed. The row is linked to a
-- user once, through the transaction's appAccountToken, which the app sets to
-- the Supabase user id at purchase; later transactions only update it.
CREATE TABLE public.app_store_subscriptions (
  original_transaction_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.app_store_products(product_id),
  transaction_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('Production', 'Sandbox')),
  purchased_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason integer,
  family_shared boolean NOT NULL DEFAULT false,
  -- Apple's isUpgraded: the customer upgraded within the subscription group,
  -- and a newer transaction replaces this one. Like StoreKit's
  -- currentEntitlements, the plan ignores it until that one arrives.
  upgraded boolean NOT NULL DEFAULT false,
  -- signedDate of the transaction above, which orders updates to it.
  transaction_signed_at timestamptz NOT NULL,
  auto_renew boolean,
  -- Set while Apple's Billing Grace Period runs after a failed renewal.
  grace_period_expires_at timestamptz,
  -- signedDate of the renewal info the two columns above came from.
  renewal_signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_store_subscriptions_user_id_idx ON public.app_store_subscriptions (user_id);

ALTER TABLE public.app_store_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_store_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_store_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_store_subscriptions TO service_role;

CREATE POLICY "app_store_subscriptions_select_own" ON public.app_store_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

-- One row per App Store Server Notification processed, keyed by its
-- notificationUUID, so Apple's retries apply nothing twice. It holds no user id.
CREATE TABLE public.app_store_notifications (
  notification_uuid uuid PRIMARY KEY,
  notification_type text NOT NULL,
  subtype text,
  environment text NOT NULL,
  original_transaction_id text,
  signed_at timestamptz NOT NULL,
  result text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_store_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_store_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_store_notifications TO service_role;

-- ============================================================
-- EFFECTIVE ENTITLEMENT
-- ============================================================

-- The plan for one user at p_at. Runs with the caller's privileges: the service
-- role reads any user, a signed-in user reads only their own rows through RLS,
-- so asking about someone else returns the fail-closed 'expired' row.
--
-- Tiers rank pro > legacy_free > basic > trial > expired; the highest active
-- one wins, and on a tie the later expiry. Daily limits: pro and legacy_free
-- 50, basic 20, trial 5, expired 0, always replaced by daily_limit_override.
-- A missing user_settings row is untrusted (the auth trigger provisions one for
-- every account), so it fails closed whatever else the user holds.
CREATE FUNCTION public.effective_entitlement(p_user_id uuid, p_at timestamptz DEFAULT now())
RETURNS TABLE (
  tier text,
  daily_limit integer,
  can_access_pro_models boolean,
  source text,
  expires_at timestamptz,
  trial_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  has_stripe_billing boolean,
  has_app_store_subscription boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_settings record;
  v_raw_tier text;
  v_gift_trial boolean;
  v_stripe_end timestamptz;
  v_store_tier text;
  v_store_end timestamptz;
BEGIN
  has_stripe_billing := EXISTS (
    SELECT 1 FROM public.subscriptions AS stripe
    WHERE stripe.user_id = p_user_id AND stripe.stripe_customer_id IS NOT NULL
  );

  SELECT product.tier, greatest(store.expires_at, coalesce(store.grace_period_expires_at, store.expires_at))
  INTO v_store_tier, v_store_end
  FROM public.app_store_subscriptions AS store
  JOIN public.app_store_products AS product ON product.product_id = store.product_id
  WHERE store.user_id = p_user_id
    AND store.revoked_at IS NULL
    AND NOT store.upgraded
    AND greatest(store.expires_at, coalesce(store.grace_period_expires_at, store.expires_at)) > p_at
  ORDER BY product.tier = 'pro' DESC,
    greatest(store.expires_at, coalesce(store.grace_period_expires_at, store.expires_at)) DESC
  LIMIT 1;
  has_app_store_subscription := v_store_tier IS NOT NULL;

  SELECT settings.subscription_tier, settings.daily_limit_override, settings.trial_ends_at, settings.grace_period_ends_at
  INTO v_settings
  FROM public.user_settings AS settings
  WHERE settings.user_id = p_user_id;

  IF NOT FOUND THEN
    tier := 'expired';
    daily_limit := 0;
    can_access_pro_models := false;
    RETURN NEXT;
    RETURN;
  END IF;

  trial_ends_at := v_settings.trial_ends_at;
  grace_period_ends_at := v_settings.grace_period_ends_at;
  v_raw_tier := coalesce(nullif(v_settings.subscription_tier, ''), 'trial');
  v_gift_trial := v_settings.trial_ends_at > p_at;

  -- The rules _shared/entitlements.ts applied to user_settings and Stripe.
  IF v_raw_tier = 'legacy_free' AND v_settings.grace_period_ends_at > p_at THEN
    tier := 'legacy_free'; source := 'legacy'; expires_at := v_settings.grace_period_ends_at;
  ELSIF v_raw_tier = 'pro' AND v_settings.grace_period_ends_at > p_at THEN
    tier := 'pro'; source := 'promo'; expires_at := v_settings.grace_period_ends_at;
  ELSE
    IF v_raw_tier = 'pro' THEN
      SELECT max(stripe.current_period_end) INTO v_stripe_end
      FROM public.subscriptions AS stripe
      WHERE stripe.user_id = p_user_id
        AND stripe.status IN ('active', 'trialing')
        AND stripe.current_period_end > p_at;
    END IF;

    IF v_stripe_end IS NOT NULL THEN
      tier := 'pro'; source := 'stripe'; expires_at := v_stripe_end;
    ELSIF v_gift_trial THEN
      tier := 'trial'; source := 'trial'; expires_at := v_settings.trial_ends_at;
    ELSE
      tier := 'expired';
    END IF;
  END IF;

  IF v_store_tier IS NOT NULL AND (
    (CASE v_store_tier WHEN 'pro' THEN 4 ELSE 2 END) >
      (CASE tier WHEN 'pro' THEN 4 WHEN 'legacy_free' THEN 3 WHEN 'trial' THEN 1 ELSE 0 END)
    OR (v_store_tier = tier AND v_store_end > expires_at)
  ) THEN
    tier := v_store_tier; source := 'app_store'; expires_at := v_store_end;
  END IF;

  daily_limit := coalesce(
    v_settings.daily_limit_override,
    CASE tier WHEN 'pro' THEN 50 WHEN 'legacy_free' THEN 50 WHEN 'basic' THEN 20 WHEN 'trial' THEN 5 ELSE 0 END
  );
  can_access_pro_models := tier IN ('pro', 'legacy_free');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.effective_entitlement(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_entitlement(uuid, timestamptz) TO authenticated, service_role;

-- ============================================================
-- APPLYING SIGNED APP STORE DATA
-- ============================================================

-- Applies one verified transaction, with optional renewal info and the
-- notification it came in. The caller (an Edge Function with the service role)
-- has already verified every JWS, the bundle id and the environment, and
-- passes the decoded fields as camelCase JSON with ISO timestamps.
--
-- p_user_id is the transaction's appAccountToken, or null. It links a new row
-- to a user and must match an existing row's user; data for a linked row may
-- come without it.
--
-- Ordering: a transaction replaces the stored one when Apple charged it later
-- (purchaseDate: a renewal, upgrade, downgrade or resubscription), or when it
-- is the same transaction signed later (a refund, revocation, its reversal or
-- a renewal-date extension). Expiry cannot order them: an upgrade from a
-- yearly to a monthly plan expires sooner. A refund of an older period
-- therefore leaves the current period alone, and an exact replay changes
-- nothing. Renewal info replaces the stored renewal info when it was
-- signed later.
--
-- Returns applied, stale (nothing newer), duplicate (notification seen),
-- ignored (no transaction), unknown_product, unlinked (no such user to link
-- to) or user_mismatch (the token names another user than the row's).
CREATE FUNCTION public.apply_app_store_transaction(
  p_user_id uuid,
  p_transaction jsonb,
  p_renewal jsonb DEFAULT NULL,
  p_notification jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_original_id text := p_transaction->>'originalTransactionId';
  v_purchased timestamptz := (p_transaction->>'purchaseDate')::timestamptz;
  v_expires timestamptz := (p_transaction->>'expiresDate')::timestamptz;
  v_signed timestamptz := (p_transaction->>'signedDate')::timestamptz;
  v_renewal_signed timestamptz := (p_renewal->>'signedDate')::timestamptz;
  v_row public.app_store_subscriptions%ROWTYPE;
  v_result text;
  v_changed boolean := false;
BEGIN
  IF p_notification IS NOT NULL THEN
    INSERT INTO public.app_store_notifications
      (notification_uuid, notification_type, subtype, environment, original_transaction_id, signed_at)
    VALUES (
      (p_notification->>'notificationUUID')::uuid,
      p_notification->>'notificationType',
      p_notification->>'subtype',
      p_notification->>'environment',
      v_original_id,
      (p_notification->>'signedDate')::timestamptz
    )
    ON CONFLICT (notification_uuid) DO NOTHING;
    IF NOT FOUND THEN
      RETURN 'duplicate';
    END IF;
  END IF;

  IF p_transaction IS NULL THEN
    v_result := 'ignored';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.app_store_products AS product WHERE product.product_id = p_transaction->>'productId'
  ) THEN
    v_result := 'unknown_product';
  ELSE
    SELECT * INTO v_row FROM public.app_store_subscriptions
    WHERE original_transaction_id = v_original_id
    FOR UPDATE;

    IF NOT FOUND THEN
      IF p_user_id IS NULL THEN
        v_result := 'unlinked';
      ELSE
        BEGIN
          INSERT INTO public.app_store_subscriptions (
            original_transaction_id, user_id, product_id, transaction_id, environment,
            purchased_at, expires_at, revoked_at, revocation_reason, family_shared, upgraded,
            transaction_signed_at, auto_renew, grace_period_expires_at, renewal_signed_at
          ) VALUES (
            v_original_id,
            p_user_id,
            p_transaction->>'productId',
            p_transaction->>'transactionId',
            p_transaction->>'environment',
            v_purchased,
            v_expires,
            (p_transaction->>'revocationDate')::timestamptz,
            (p_transaction->>'revocationReason')::integer,
            coalesce((p_transaction->>'familyShared')::boolean, false),
            coalesce((p_transaction->>'isUpgraded')::boolean, false),
            v_signed,
            (p_renewal->>'autoRenew')::boolean,
            (p_renewal->>'gracePeriodExpiresDate')::timestamptz,
            v_renewal_signed
          )
          ON CONFLICT (original_transaction_id) DO NOTHING;
          IF FOUND THEN
            v_result := 'applied';
          ELSE
            -- Another request inserted it first; update that row below.
            SELECT * INTO v_row FROM public.app_store_subscriptions
            WHERE original_transaction_id = v_original_id
            FOR UPDATE;
          END IF;
        EXCEPTION WHEN foreign_key_violation THEN
          v_result := 'unlinked';
        END;
      END IF;
    END IF;

    IF v_result IS NULL THEN
      IF p_user_id IS NOT NULL AND p_user_id <> v_row.user_id THEN
        v_result := 'user_mismatch';
      ELSE
        UPDATE public.app_store_subscriptions SET
          product_id = p_transaction->>'productId',
          transaction_id = p_transaction->>'transactionId',
          environment = p_transaction->>'environment',
          purchased_at = v_purchased,
          expires_at = v_expires,
          revoked_at = (p_transaction->>'revocationDate')::timestamptz,
          revocation_reason = (p_transaction->>'revocationReason')::integer,
          family_shared = coalesce((p_transaction->>'familyShared')::boolean, false),
          upgraded = coalesce((p_transaction->>'isUpgraded')::boolean, false),
          transaction_signed_at = v_signed,
          updated_at = now()
        WHERE original_transaction_id = v_original_id
          AND (
            v_purchased > v_row.purchased_at
            OR (p_transaction->>'transactionId' = v_row.transaction_id AND v_signed > v_row.transaction_signed_at)
          );
        v_changed := FOUND;

        IF p_renewal IS NOT NULL THEN
          UPDATE public.app_store_subscriptions SET
            auto_renew = (p_renewal->>'autoRenew')::boolean,
            grace_period_expires_at = (p_renewal->>'gracePeriodExpiresDate')::timestamptz,
            renewal_signed_at = v_renewal_signed,
            updated_at = now()
          WHERE original_transaction_id = v_original_id
            AND (v_row.renewal_signed_at IS NULL OR v_renewal_signed > v_row.renewal_signed_at);
          v_changed := v_changed OR FOUND;
        END IF;

        v_result := CASE WHEN v_changed THEN 'applied' ELSE 'stale' END;
      END IF;
    END IF;
  END IF;

  IF p_notification IS NOT NULL THEN
    UPDATE public.app_store_notifications SET result = v_result
    WHERE notification_uuid = (p_notification->>'notificationUUID')::uuid;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_app_store_transaction(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_app_store_transaction(uuid, jsonb, jsonb, jsonb) TO service_role;

-- ============================================================
-- ACCOUNT DELETION
-- ============================================================

-- The server cannot cancel an App Store subscription; only the customer can,
-- in Apple's subscription settings. The plan now also says whether Apple may
-- still bill the user: a subscription that is not revoked, has not turned off
-- auto-renew, and ended less than 60 days ago (Apple's longest billing retry)
-- or not at all. The account function passes that on so the app can send the
-- user to Apple's settings. The rest of the plan is unchanged from
-- 20261001100000_account_deletion_and_export.sql, and CREATE OR REPLACE keeps
-- its service-role-only grants.
CREATE OR REPLACE FUNCTION public.account_deletion_plan(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'stripe_customer_ids', (
      SELECT coalesce(jsonb_agg(DISTINCT customer.id ORDER BY customer.id), '[]'::jsonb)
      FROM (
        SELECT subscription.stripe_customer_id AS id
        FROM public.subscriptions AS subscription
        WHERE subscription.user_id = p_user_id AND subscription.stripe_customer_id IS NOT NULL
        UNION
        SELECT recorded.customer_id FROM public.stripe_customers AS recorded WHERE recorded.user_id = p_user_id
      ) AS customer
    ),
    'storage_objects', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('bucket_id', object.bucket_id, 'name', object.name)), '[]'::jsonb)
      FROM storage.objects AS object
      -- Storage sets the owner from the uploader's session. source_files.storage_key
      -- is user-writable, so it must never select objects for deletion.
      WHERE object.owner = p_user_id OR object.owner_id = p_user_id::text
    ),
    'app_store_subscription_active', EXISTS (
      SELECT 1 FROM public.app_store_subscriptions AS store
      WHERE store.user_id = p_user_id
        AND store.revoked_at IS NULL
        AND store.auto_renew IS DISTINCT FROM false
        AND greatest(store.expires_at, coalesce(store.grace_period_expires_at, store.expires_at)) > now() - interval '60 days'
    )
  );
$$;
