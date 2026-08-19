-- Security hardening: server-owned entitlements/usage, code-scoped sharing,
-- privileged RPC authorization, and atomic quota reservations.

-- Client-visible settings remain editable, but billing and entitlement fields do not.
DROP POLICY IF EXISTS "user_settings_delete" ON public.user_settings;
REVOKE INSERT, UPDATE, DELETE ON public.user_settings FROM anon, authenticated;
GRANT SELECT ON public.user_settings TO authenticated;
GRANT UPDATE (language, theme, feature_configs, custom_system_prompt, updated_at)
  ON public.user_settings TO authenticated;

-- The authenticated client may view its history but never write trusted usage.
DROP POLICY IF EXISTS "ai_requests_all" ON public.ai_requests;
CREATE POLICY "ai_requests_select_own" ON public.ai_requests
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.ai_requests FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.daily_usage_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, usage_date)
);
ALTER TABLE public.daily_usage_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_daily_quota(p_user_id uuid, p_limit integer)
RETURNS TABLE (allowed boolean, current_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'quota reservation is restricted to trusted server code';
  END IF;

  RETURN QUERY
  WITH reserved AS (
    INSERT INTO public.daily_usage_counters (user_id, usage_date, request_count)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET request_count = public.daily_usage_counters.request_count + 1
      WHERE public.daily_usage_counters.request_count < p_limit
    RETURNING request_count
  )
  SELECT true, request_count FROM reserved
  UNION ALL SELECT false, COALESCE((
    SELECT request_count FROM public.daily_usage_counters
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE
  ), 0)
  WHERE NOT EXISTS (SELECT 1 FROM reserved);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_daily_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_quota(uuid, integer) TO service_role;

-- Shares are capabilities: only the edge function writes them and the code-scoped
-- RPC exposes a single non-expired item while incrementing its counter atomically.
DROP POLICY IF EXISTS "shared_items_select_public" ON public.shared_items;
DROP POLICY IF EXISTS "shared_items_insert_own_or_anonymous" ON public.shared_items;
REVOKE ALL ON public.shared_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_item(p_share_code text)
RETURNS TABLE (id uuid, share_code text, item_type text, item_data jsonb, title text, created_at timestamptz, view_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.shared_items
  SET view_count = public.shared_items.view_count + 1
  WHERE public.shared_items.share_code = p_share_code
    AND (public.shared_items.expires_at IS NULL OR public.shared_items.expires_at > now())
  RETURNING shared_items.id, shared_items.share_code, shared_items.item_type,
    shared_items.item_data, shared_items.title, shared_items.created_at, shared_items.view_count;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shared_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_item(text) TO anon, authenticated;

-- Analytics and rate-limit RPCs must only be callable by administrators.
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'administrator access required'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_daily_usage(days_back integer DEFAULT 7)
RETURNS TABLE (date text, requests bigint, cost numeric, errors bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT to_char(created_at::date, 'Mon DD'), count(*)::bigint,
    COALESCE(sum(cost_usd), 0)::numeric, count(*) FILTER (WHERE status != 'success')::bigint
  FROM public.ai_requests WHERE created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
  GROUP BY created_at::date ORDER BY created_at::date DESC;
END; $$;
CREATE OR REPLACE FUNCTION public.get_usage_by_user(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE (user_id uuid, email text, requests bigint, cost numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT ai_requests.user_id, auth_users.email::text, count(*)::bigint,
    COALESCE(sum(cost_usd), 0)::numeric FROM public.ai_requests
  LEFT JOIN auth.users AS auth_users ON auth_users.id = ai_requests.user_id
  WHERE ai_requests.created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
  GROUP BY ai_requests.user_id, auth_users.email ORDER BY count(*) DESC LIMIT limit_count;
END; $$;
CREATE OR REPLACE FUNCTION public.get_active_rate_limits()
RETURNS TABLE (id uuid, user_id uuid, limit_type text, limit_value integer, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT DISTINCT ON (rl.user_id, rl.limit_type) rl.id, rl.user_id, rl.limit_type,
    rl.limit_value, rl.created_at FROM public.rate_limits rl ORDER BY rl.user_id, rl.limit_type, rl.updated_at DESC;
END; $$;

-- Promo redemption is bound to the JWT caller.  Edge code invokes this RPC with
-- the caller's access token, never a service-role credential.
DROP FUNCTION IF EXISTS public.redeem_promo_code_atomic(uuid, text);
CREATE OR REPLACE FUNCTION public.redeem_promo_code_atomic(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid := auth.uid(); v_promo public.promo_codes%ROWTYPE; v_config jsonb; v_days integer; v_limit integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_promo FROM public.promo_codes WHERE code = upper(trim(p_code)) AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired promo code'); END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN RETURN jsonb_build_object('success', false, 'message', 'This promo code has expired'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_promos WHERE user_id = v_user_id AND promo_code_id = v_promo.id) THEN RETURN jsonb_build_object('success', false, 'message', 'You''ve already redeemed this code'); END IF;
  IF v_promo.max_redemptions IS NOT NULL AND COALESCE(v_promo.redemptions_count, 0) >= v_promo.max_redemptions THEN RETURN jsonb_build_object('success', false, 'message', 'This promo code has reached its usage limit'); END IF;
  v_config := COALESCE(v_promo.config, '{}'::jsonb);
  CASE v_promo.type::text
    WHEN 'extended_trial' THEN v_days := COALESCE((v_config->>'days')::integer, 30); INSERT INTO public.user_settings (user_id, trial_ends_at, subscription_tier, updated_at) VALUES (v_user_id, now() + make_interval(days => v_days), 'trial', now()) ON CONFLICT (user_id) DO UPDATE SET trial_ends_at = EXCLUDED.trial_ends_at, subscription_tier = EXCLUDED.subscription_tier, updated_at = EXCLUDED.updated_at;
    WHEN 'extra_limit' THEN v_limit := COALESCE((v_config->>'limit')::integer, 15); INSERT INTO public.user_settings (user_id, daily_limit_override, updated_at) VALUES (v_user_id, v_limit, now()) ON CONFLICT (user_id) DO UPDATE SET daily_limit_override = EXCLUDED.daily_limit_override, updated_at = EXCLUDED.updated_at;
    WHEN 'free_month' THEN v_days := COALESCE((v_config->>'days')::integer, 30); INSERT INTO public.user_settings (user_id, subscription_tier, grace_period_ends_at, updated_at) VALUES (v_user_id, 'pro', now() + make_interval(days => v_days), now()) ON CONFLICT (user_id) DO UPDATE SET subscription_tier = EXCLUDED.subscription_tier, grace_period_ends_at = EXCLUDED.grace_period_ends_at, updated_at = EXCLUDED.updated_at;
    WHEN 'lifetime_pro' THEN v_limit := COALESCE((v_config->>'limit')::integer, 50); INSERT INTO public.user_settings (user_id, subscription_tier, daily_limit_override, grace_period_ends_at, updated_at) VALUES (v_user_id, 'pro', v_limit, '9999-12-31T23:59:59.999Z'::timestamptz, now()) ON CONFLICT (user_id) DO UPDATE SET subscription_tier = EXCLUDED.subscription_tier, daily_limit_override = EXCLUDED.daily_limit_override, grace_period_ends_at = EXCLUDED.grace_period_ends_at, updated_at = EXCLUDED.updated_at;
    WHEN 'discount' THEN RETURN jsonb_build_object('success', true, 'message', 'Discount code noted! Apply it at checkout for a discount.', 'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
    ELSE RETURN jsonb_build_object('success', false, 'message', 'Unsupported promo code type');
  END CASE;
  INSERT INTO public.user_promos (user_id, promo_code_id) VALUES (v_user_id, v_promo.id) ON CONFLICT (user_id, promo_code_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'You''ve already redeemed this code'); END IF;
  UPDATE public.promo_codes SET redemptions_count = COALESCE(redemptions_count, 0) + 1 WHERE id = v_promo.id;
  RETURN jsonb_build_object('success', true, 'message', 'Promo code applied!', 'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
END; $$;
REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(text) TO authenticated;
