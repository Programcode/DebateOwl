-- Older table-creation migrations relied on Supabase's automatic public grants.
-- Make their final Data API permissions explicit for new projects and db reset.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_settings,
  public.cases, public.attacks, public.brainstorms, public.factoids,
  public.chats, public.messages, public.sources, public.source_files,
  public.ai_requests, public.api_keys,
  public.user_roles, public.rate_limits, public.global_prompts,
  public.flowcharts,
  public.subscriptions, public.promo_codes, public.user_promos,
  public.admin_grants, public.shared_items, public.source_folders,
  public.daily_usage_counters
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.cases, public.attacks, public.brainstorms, public.factoids,
  public.chats, public.messages, public.sources, public.source_files,
  public.api_keys, public.flowcharts, public.source_folders
TO authenticated;

GRANT SELECT ON TABLE
  public.user_roles, public.rate_limits, public.subscriptions,
  public.user_promos, public.admin_grants, public.ai_requests
TO authenticated;

-- Settings keep their existing SELECT and column-limited UPDATE grants;
-- trusted usage and shared items remain server-owned.
GRANT SELECT ON TABLE public.global_prompts TO anon, authenticated;

-- The existing anonymous keepalive insert uses this sequence's nextval().
GRANT USAGE ON SEQUENCE public.keepalive_events_id_seq TO anon, service_role;
