-- Keep Stripe webhook idempotency records server-side only.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_events TO service_role;

COMMENT ON TABLE public.webhook_events IS
  'Stripe webhook idempotency log; accessible only to service-role backend code.';
