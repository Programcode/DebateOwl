-- Discount promo codes are claimed like every other promo (security audit
-- 2026-10-24, finding 1).
--
-- The discount branch returned before user_promos was written and
-- redemptions_count was incremented, so max_redemptions and single use never
-- applied, and create-checkout then opened Stripe's own promotion-code field
-- (allow_promotion_codes), which accepts any code on the Stripe account.
--
-- Now a discount row must carry the Stripe promotion-code id it stands for in
-- config.stripe_promotion_code (promo_...). Claiming it records the user and
-- counts against the cap, and the answer returns that id so create-checkout
-- can apply exactly that discount. Asking again for a code the user already
-- holds returns the same id without counting again; that is how Checkout gets
-- the id after the pricing dialog has claimed it. A discount row without a
-- valid id answers like an unknown code.
--
-- p_discount_only is for create-checkout: it refuses every other promo type
-- instead of granting it, so a code typed into the Checkout path never
-- changes an entitlement. The parameter changes the signature, so the old
-- one-argument function is dropped first; leaving it would make PostgREST
-- refuse every call as ambiguous. Both run in this migration's transaction.
--
-- Existing discount rows have no stripe_promotion_code and stop working until
-- an admin sets one:
--   UPDATE public.promo_codes
--   SET config = config || '{"stripe_promotion_code": "promo_..."}'
--   WHERE code = '...' AND type = 'discount';

-- The new function takes p_code as before and defaults the new argument, so
-- callers sending only p_code (redeem-promo) keep working.
-- squawk-ignore ban-drop-function
DROP FUNCTION public.redeem_promo_code_atomic(text);

CREATE FUNCTION public.redeem_promo_code_atomic(p_code text, p_discount_only boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_promo public.promo_codes%ROWTYPE;
  v_config jsonb;
  v_days integer;
  v_limit integer;
  v_failure text;
  v_stripe_code text;
  v_max_failures constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_discount_message constant text := 'Discount code noted! Apply it at checkout for a discount.';
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- One redemption per user at a time, so parallel guesses cannot all slip
  -- under the failure limit before any of them is recorded.
  PERFORM pg_advisory_xact_lock(hashtextextended('redeem_promo:' || v_user_id::text, 0));

  DELETE FROM private.promo_redeem_failures
  WHERE user_id = v_user_id AND failed_at < now() - interval '1 day';

  IF (SELECT count(*) FROM private.promo_redeem_failures
      WHERE user_id = v_user_id AND failed_at > now() - v_window) >= v_max_failures THEN
    RETURN jsonb_build_object('success', false, 'code', 'too_many_attempts',
      'message', 'Too many promo code attempts. Try again in 15 minutes.');
  END IF;

  SELECT * INTO v_promo FROM public.promo_codes
  WHERE code = upper(trim(p_code)) AND is_active = true
  FOR UPDATE;

  v_config := COALESCE(v_promo.config, '{}'::jsonb);
  v_stripe_code := v_config->>'stripe_promotion_code';

  -- Unknown, expired, exhausted and unusable codes get the same answer, so
  -- guessing cannot tell a real code from a wrong one. A user who already
  -- holds a discount gets its id back even once the cap is reached; the claim
  -- was counted when they made it.
  IF v_promo.id IS NULL
     OR (v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now())
     OR (p_discount_only AND v_promo.type::text <> 'discount')
     OR (v_promo.type::text = 'discount'
         AND COALESCE(v_stripe_code, '') !~ '^promo_[A-Za-z0-9]+$') THEN
    v_failure := 'Invalid or expired promo code';
  ELSIF EXISTS (SELECT 1 FROM public.user_promos
                WHERE user_id = v_user_id AND promo_code_id = v_promo.id) THEN
    IF v_promo.type::text = 'discount' THEN
      RETURN jsonb_build_object('success', true, 'message', v_discount_message,
        'promoCodeId', v_promo.id, 'promoType', 'discount',
        'stripePromotionCode', v_stripe_code);
    END IF;
    v_failure := 'You''ve already redeemed this code';
  ELSIF v_promo.max_redemptions IS NOT NULL
        AND COALESCE(v_promo.redemptions_count, 0) >= v_promo.max_redemptions THEN
    v_failure := 'Invalid or expired promo code';
  END IF;

  IF v_failure IS NOT NULL THEN
    INSERT INTO private.promo_redeem_failures (user_id) VALUES (v_user_id);
    RETURN jsonb_build_object('success', false, 'message', v_failure);
  END IF;

  -- Each grant only ever raises what the user has: later end dates, higher
  -- daily limits, and a Pro or legacy tier is never replaced by a trial.
  CASE v_promo.type::text
    WHEN 'extended_trial' THEN
      v_days := COALESCE((v_config->>'days')::integer, 30);
      INSERT INTO public.user_settings AS s (user_id, trial_ends_at, subscription_tier, updated_at)
      VALUES (v_user_id, now() + make_interval(days => v_days), 'trial', now())
      ON CONFLICT (user_id) DO UPDATE SET
        trial_ends_at = GREATEST(s.trial_ends_at, EXCLUDED.trial_ends_at),
        subscription_tier = CASE WHEN s.subscription_tier IN ('pro', 'legacy_free')
                                 THEN s.subscription_tier ELSE EXCLUDED.subscription_tier END,
        updated_at = EXCLUDED.updated_at;
    WHEN 'extra_limit' THEN
      v_limit := COALESCE((v_config->>'limit')::integer, 15);
      INSERT INTO public.user_settings AS s (user_id, daily_limit_override, updated_at)
      VALUES (v_user_id, v_limit, now())
      ON CONFLICT (user_id) DO UPDATE SET
        daily_limit_override = GREATEST(s.daily_limit_override, EXCLUDED.daily_limit_override),
        updated_at = EXCLUDED.updated_at;
    WHEN 'free_month' THEN
      v_days := COALESCE((v_config->>'days')::integer, 30);
      INSERT INTO public.user_settings AS s (user_id, subscription_tier, grace_period_ends_at, updated_at)
      VALUES (v_user_id, 'pro', now() + make_interval(days => v_days), now())
      ON CONFLICT (user_id) DO UPDATE SET
        subscription_tier = EXCLUDED.subscription_tier,
        grace_period_ends_at = GREATEST(s.grace_period_ends_at, EXCLUDED.grace_period_ends_at),
        updated_at = EXCLUDED.updated_at;
    WHEN 'lifetime_pro' THEN
      v_limit := COALESCE((v_config->>'limit')::integer, 50);
      INSERT INTO public.user_settings AS s (user_id, subscription_tier, daily_limit_override, grace_period_ends_at, updated_at)
      VALUES (v_user_id, 'pro', v_limit, '9999-12-31T23:59:59.999Z'::timestamptz, now())
      ON CONFLICT (user_id) DO UPDATE SET
        subscription_tier = EXCLUDED.subscription_tier,
        daily_limit_override = GREATEST(s.daily_limit_override, EXCLUDED.daily_limit_override),
        grace_period_ends_at = EXCLUDED.grace_period_ends_at,
        updated_at = EXCLUDED.updated_at;
    WHEN 'discount' THEN
      -- No settings change: the claim below is the whole redemption.
      NULL;
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Unsupported promo code type');
  END CASE;

  INSERT INTO public.user_promos (user_id, promo_code_id) VALUES (v_user_id, v_promo.id)
  ON CONFLICT (user_id, promo_code_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'You''ve already redeemed this code');
  END IF;
  UPDATE public.promo_codes SET redemptions_count = COALESCE(redemptions_count, 0) + 1
  WHERE id = v_promo.id;

  IF v_promo.type::text = 'discount' THEN
    RETURN jsonb_build_object('success', true, 'message', v_discount_message,
      'promoCodeId', v_promo.id, 'promoType', 'discount',
      'stripePromotionCode', v_stripe_code);
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Promo code applied!',
    'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(text, boolean) TO authenticated;
