-- Harden promo redemption against races by doing all writes in one transaction.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_stripe_customer_id_key;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON public.subscriptions(stripe_customer_id);

CREATE OR REPLACE FUNCTION public.redeem_promo_code_atomic(
  p_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_config jsonb;
  v_days integer;
  v_limit integer;
BEGIN
  SELECT *
  INTO v_promo
  FROM public.promo_codes
  WHERE code = upper(trim(p_code))
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired promo code');
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'message', 'This promo code has expired');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_promos
    WHERE user_id = p_user_id
      AND promo_code_id = v_promo.id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'You''ve already redeemed this code');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL
    AND COALESCE(v_promo.redemptions_count, 0) >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('success', false, 'message', 'This promo code has reached its usage limit');
  END IF;

  v_config := COALESCE(v_promo.config, '{}'::jsonb);

  CASE v_promo.type::text
    WHEN 'extended_trial' THEN
      v_days := COALESCE((v_config->>'days')::integer, 30);
      INSERT INTO public.user_settings (user_id, trial_ends_at, subscription_tier, updated_at)
      VALUES (p_user_id, now() + make_interval(days => v_days), 'trial', now())
      ON CONFLICT (user_id) DO UPDATE SET
        trial_ends_at = EXCLUDED.trial_ends_at,
        subscription_tier = EXCLUDED.subscription_tier,
        updated_at = EXCLUDED.updated_at;

    WHEN 'extra_limit' THEN
      v_limit := COALESCE((v_config->>'limit')::integer, 15);
      INSERT INTO public.user_settings (user_id, daily_limit_override, updated_at)
      VALUES (p_user_id, v_limit, now())
      ON CONFLICT (user_id) DO UPDATE SET
        daily_limit_override = EXCLUDED.daily_limit_override,
        updated_at = EXCLUDED.updated_at;

    WHEN 'free_month' THEN
      v_days := COALESCE((v_config->>'days')::integer, 30);
      INSERT INTO public.user_settings (user_id, subscription_tier, grace_period_ends_at, updated_at)
      VALUES (p_user_id, 'pro', now() + make_interval(days => v_days), now())
      ON CONFLICT (user_id) DO UPDATE SET
        subscription_tier = EXCLUDED.subscription_tier,
        grace_period_ends_at = EXCLUDED.grace_period_ends_at,
        updated_at = EXCLUDED.updated_at;

    WHEN 'lifetime_pro' THEN
      v_limit := COALESCE((v_config->>'limit')::integer, 50);
      INSERT INTO public.user_settings (user_id, subscription_tier, daily_limit_override, grace_period_ends_at, updated_at)
      VALUES (p_user_id, 'pro', v_limit, '9999-12-31T23:59:59.999Z'::timestamptz, now())
      ON CONFLICT (user_id) DO UPDATE SET
        subscription_tier = EXCLUDED.subscription_tier,
        daily_limit_override = EXCLUDED.daily_limit_override,
        grace_period_ends_at = EXCLUDED.grace_period_ends_at,
        updated_at = EXCLUDED.updated_at;

    WHEN 'discount' THEN
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Discount code noted! Apply it at checkout for a discount.',
        'promoCodeId', v_promo.id,
        'promoType', v_promo.type::text
      );

    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Unsupported promo code type');
  END CASE;

  INSERT INTO public.user_promos (user_id, promo_code_id)
  VALUES (p_user_id, v_promo.id)
  ON CONFLICT (user_id, promo_code_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'You''ve already redeemed this code');
  END IF;

  UPDATE public.promo_codes
  SET redemptions_count = COALESCE(redemptions_count, 0) + 1
  WHERE id = v_promo.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE v_promo.type::text
      WHEN 'extended_trial' THEN 'Trial extended by ' || COALESCE((v_config->>'days')::integer, 30) || ' days!'
      WHEN 'extra_limit' THEN 'Daily limit upgraded to ' || COALESCE((v_config->>'limit')::integer, 15) || ' requests!'
      WHEN 'free_month' THEN 'Enjoy ' || COALESCE((v_config->>'days')::integer, 30) || ' days of free Pro access!'
      WHEN 'lifetime_pro' THEN 'Lifetime Pro access unlocked!'
      ELSE 'Promo code applied!'
    END,
    'promoCodeId', v_promo.id,
    'promoType', v_promo.type::text
  );
END;
$$;
