-- Return auth email with top usage rows so the admin dashboard does not expose raw user IDs.

CREATE OR REPLACE FUNCTION public.get_usage_by_user(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE (
    user_id uuid,
    email text,
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
        auth_users.email::text AS email,
        count(*)::bigint AS requests,
        COALESCE(sum(cost_usd), 0)::numeric AS cost
    FROM public.ai_requests
    LEFT JOIN auth.users AS auth_users
        ON auth_users.id = ai_requests.user_id
    WHERE ai_requests.created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
    GROUP BY ai_requests.user_id, auth_users.email
    ORDER BY count(*) DESC
    LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_usage_by_user TO authenticated;
