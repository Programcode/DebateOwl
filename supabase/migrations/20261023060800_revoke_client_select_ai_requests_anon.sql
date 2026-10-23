-- SC-08: ai_requests predates the closed default privileges, so anon kept
-- SELECT. No signed-out client reads it (use-subscription.ts runs signed in),
-- and a permissive SELECT policy left on a hosted project (DB-03) would
-- otherwise expose usage rows to anyone with the anon key.
REVOKE SELECT ON TABLE public.ai_requests FROM anon;
