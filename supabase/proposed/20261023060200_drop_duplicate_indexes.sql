-- DB-05 (proposed, destructive): drop indexes that duplicate another index
-- on the same table and column.
--
--   subscriptions      idx_subscriptions_stripe_customer duplicates
--                      idx_subscriptions_stripe_customer_id (both plain
--                      btree on stripe_customer_id); the QA advisor finding.
--   subscriptions      idx_subscriptions_stripe_sub duplicates the unique
--                      constraint index subscriptions_stripe_subscription_id_key.
--   promo_codes        idx_promo_codes_code duplicates promo_codes_code_key.
--   global_prompts     idx_global_prompts_feature duplicates global_prompts_feature_key.
--   user_roles         idx_user_roles_user_id duplicates user_roles_user_id_key.
--   demo_access_codes  demo_access_codes_email_idx duplicates demo_access_codes_email_key.
--
-- Each drop runs only if the index that stays exists and covers exactly the
-- same columns, so a project whose indexes differ keeps both. Run it outside
-- peak hours: DROP INDEX briefly locks its table.

DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('idx_subscriptions_stripe_customer', 'idx_subscriptions_stripe_customer_id'),
      ('idx_subscriptions_stripe_sub', 'subscriptions_stripe_subscription_id_key'),
      ('idx_promo_codes_code', 'promo_codes_code_key'),
      ('idx_global_prompts_feature', 'global_prompts_feature_key'),
      ('idx_user_roles_user_id', 'user_roles_user_id_key'),
      ('demo_access_codes_email_idx', 'demo_access_codes_email_key')
    ) AS v(dropped, kept)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_index AS d
      JOIN pg_index AS k ON k.indrelid = d.indrelid
      WHERE d.indexrelid = to_regclass('public.' || pair.dropped)
        AND k.indexrelid = to_regclass('public.' || pair.kept)
        AND d.indkey::text = k.indkey::text
        AND d.indexprs IS NULL AND k.indexprs IS NULL
        AND d.indpred IS NULL AND k.indpred IS NULL
    ) THEN
      RAISE NOTICE 'dropping % (kept: %)', pair.dropped, pair.kept;
      EXECUTE format('DROP INDEX IF EXISTS public.%I', pair.dropped);
    ELSE
      RAISE NOTICE 'keeping %: % is missing or covers other columns', pair.dropped, pair.kept;
    END IF;
  END LOOP;
END;
$$;
