-- SC-08: subscriptions are written only by the Stripe webhook and checkout
-- Edge Functions (service role). Clients read their own rows
-- (use-subscription.ts, settings-store.ts).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscriptions FROM anon, authenticated;
REVOKE SELECT ON TABLE public.subscriptions FROM anon;
