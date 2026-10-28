-- SC-08: usage counters are written by the quota RPCs (service role) and read
-- by clients only through ai_usage_today() (SECURITY DEFINER). RLS has no
-- policy for them.
REVOKE ALL ON TABLE public.daily_usage_counters FROM anon, authenticated;
