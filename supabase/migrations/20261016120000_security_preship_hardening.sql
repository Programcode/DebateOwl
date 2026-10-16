-- Pre-ship security pass, database fixes (plans/2026-10-16-security-preship-pass.md).
--
-- 1. Promo redemption: lock a user out after 5 failed codes in 15 minutes,
--    answer every unknown, expired or exhausted code the same way, and never
--    lower an entitlement the user already has.
-- 2. Client grants: no TRUNCATE, TRIGGER, REFERENCES or MAINTAIN on public
--    tables (RLS does not apply to TRUNCATE); operator prompts and global
--    rate limits are server-only; admin reporting RPCs are service-role only;
--    objects that later migrations create start with no client privileges.
-- 3. Account deletion removes the user's demo code and the IP addresses and
--    fingerprints recorded against it.
-- 4. Stripe webhook claims record completion, so a claim left by a worker
--    that died mid-handler can be taken over by Stripe's retry.

-- 1. Promo redemption ---------------------------------------------------------

CREATE TABLE private.promo_redeem_failures (
  user_id uuid NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redeem_failures_user_idx
  ON private.promo_redeem_failures (user_id, failed_at DESC);
ALTER TABLE private.promo_redeem_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.promo_redeem_failures FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_promo_code_atomic(p_code text)
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
  v_max_failures constant integer := 5;
  v_window constant interval := interval '15 minutes';
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

  -- Unknown, expired and exhausted codes get the same answer, so guessing
  -- cannot tell a real code from a wrong one.
  IF NOT FOUND
     OR (v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now())
     OR (v_promo.max_redemptions IS NOT NULL
         AND COALESCE(v_promo.redemptions_count, 0) >= v_promo.max_redemptions) THEN
    v_failure := 'Invalid or expired promo code';
  ELSIF EXISTS (SELECT 1 FROM public.user_promos
                WHERE user_id = v_user_id AND promo_code_id = v_promo.id) THEN
    v_failure := 'You''ve already redeemed this code';
  END IF;

  IF v_failure IS NOT NULL THEN
    INSERT INTO private.promo_redeem_failures (user_id) VALUES (v_user_id);
    RETURN jsonb_build_object('success', false, 'message', v_failure);
  END IF;

  v_config := COALESCE(v_promo.config, '{}'::jsonb);

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
      RETURN jsonb_build_object('success', true,
        'message', 'Discount code noted! Apply it at checkout for a discount.',
        'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
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

  RETURN jsonb_build_object('success', true, 'message', 'Promo code applied!',
    'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(text) TO authenticated;

-- 2. Client grants ------------------------------------------------------------

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
DO $$
BEGIN
  -- MAINTAIN exists from Postgres 17.
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
  END IF;
END;
$$;

-- Operator instructions are part of the live system prompt; only Edge
-- Functions (service role) read or write them.
DROP POLICY IF EXISTS "global_prompts_select_all" ON public.global_prompts;
REVOKE ALL ON TABLE public.global_prompts FROM anon, authenticated;

-- Global limits (user_id IS NULL) are server configuration. A signed-in user
-- may still read limits set for their own account.
DROP POLICY IF EXISTS "rate_limits_select_own" ON public.rate_limits;
CREATE POLICY "rate_limits_select_own" ON public.rate_limits
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE public.rate_limits FROM anon;

-- Admin reporting RPCs relied only on require_admin() inside them; one reads
-- every user's email. The admin Edge Function calls them with the service role.
REVOKE ALL ON FUNCTION public.get_daily_usage(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_usage_by_user(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_usage(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_usage_by_user(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_rate_limits() TO service_role;

-- New tables, sequences and functions start closed; each migration grants
-- what its clients need (supabase/README.md already asks for that).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 3. Account deletion ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  DELETE FROM public.workspaces WHERE owner_id = p_user_id;
  DELETE FROM public.workspace_thread_messages WHERE author_id = p_user_id;
  DELETE FROM public.workspace_threads WHERE created_by = p_user_id;
  DELETE FROM public.workspace_artifacts WHERE created_by = p_user_id;
  DELETE FROM public.workspace_sources WHERE created_by = p_user_id;
  -- Invite attempts name the actor without a foreign key. Keep the rows,
  -- because the per-IP limit counts them, but drop the user id; the redeem
  -- function purges them after a day.
  UPDATE private.workspace_invite_attempts
  SET actor_id = '00000000-0000-0000-0000-000000000000'
  WHERE actor_id = p_user_id;

  -- A demo code names its student (email and label) and would recreate the
  -- account on its next use. Remove it, and keep the sign-in attempts made
  -- with it only as anonymous counts.
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NOT NULL THEN
    UPDATE public.demo_access_attempts
    SET ip_address = NULL, browser_fingerprint = NULL
    WHERE code_hash IN (SELECT code_hash FROM public.demo_access_codes
                        WHERE lower(email) = lower(v_email));
    DELETE FROM public.demo_access_codes WHERE lower(email) = lower(v_email);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;

-- 4. Stripe webhook claims -----------------------------------------------------

-- The webhook now claims an event before running its handlers and marks it
-- complete afterwards. Existing rows, and rows written by the previous
-- function version (which recorded events only after success), default to
-- complete; the new claim inserts NULL explicitly.
ALTER TABLE public.webhook_events
  ADD COLUMN completed_at timestamptz DEFAULT now();
