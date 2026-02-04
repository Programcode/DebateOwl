-- Admin Panel Improvements Migration
-- Adds missing tables for rate limits, user roles, global prompts
-- Adds RPC functions for usage statistics

-- ============================================================
-- TABLES
-- ============================================================

-- User roles table (admin, user, banned)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'banned')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rate limits table (per-user or global limits)
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    limit_type text NOT NULL,
    limit_value integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Unique constraint for upsert behavior: one limit per user/type combo
    UNIQUE (user_id, limit_type)
);

-- Global AI prompts table
CREATE TABLE IF NOT EXISTS public.global_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature text NOT NULL UNIQUE CHECK (feature IN ('generate', 'attack', 'brainstorm', 'factoids', 'ask', 'all')),
    prompt_text text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id ON public.rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_type ON public.rate_limits(limit_type);
CREATE INDEX IF NOT EXISTS idx_global_prompts_feature ON public.global_prompts(feature);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- User roles: users can read their own role, admins via edge function with service role
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Rate limits: read via edge function with service role
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Global prompts: read-all for everyone (public prompts), write for admins via service role
ALTER TABLE public.global_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own" ON public.user_roles
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "rate_limits_select_own" ON public.rate_limits
    FOR SELECT USING (user_id = (SELECT auth.uid()) OR user_id IS NULL);

CREATE POLICY "global_prompts_select_all" ON public.global_prompts
    FOR SELECT USING (true);

-- ============================================================
-- RPC FUNCTIONS FOR USAGE STATISTICS
-- ============================================================

-- Get daily usage for the last N days
CREATE OR REPLACE FUNCTION public.get_daily_usage(days_back integer DEFAULT 7)
RETURNS TABLE (
    date text,
    requests bigint,
    cost numeric,
    errors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_char(created_at::date, 'Mon DD') AS date,
        count(*)::bigint AS requests,
        COALESCE(sum(cost_usd), 0)::numeric AS cost,
        count(*) FILTER (WHERE status != 'success')::bigint AS errors
    FROM public.ai_requests
    WHERE created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
    GROUP BY created_at::date
    ORDER BY created_at::date DESC;
END;
$$;

-- Get usage grouped by user for the last N days
CREATE OR REPLACE FUNCTION public.get_usage_by_user(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE (
    user_id uuid,
    requests bigint,
    cost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ai_requests.user_id,
        count(*)::bigint AS requests,
        COALESCE(sum(cost_usd), 0)::numeric AS cost
    FROM public.ai_requests
    WHERE created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
    GROUP BY ai_requests.user_id
    ORDER BY count(*) DESC
    LIMIT limit_count;
END;
$$;

-- Get deduplicated rate limits (most recent per type, per user/global)
CREATE OR REPLACE FUNCTION public.get_active_rate_limits()
RETURNS TABLE (
    id uuid,
    user_id uuid,
    limit_type text,
    limit_value integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (rl.user_id, rl.limit_type)
        rl.id,
        rl.user_id,
        rl.limit_type,
        rl.limit_value,
        rl.created_at
    FROM public.rate_limits rl
    ORDER BY rl.user_id, rl.limit_type, rl.updated_at DESC;
END;
$$;

-- Grant execute permission on functions
GRANT EXECUTE ON FUNCTION public.get_daily_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage_by_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_rate_limits TO authenticated;
