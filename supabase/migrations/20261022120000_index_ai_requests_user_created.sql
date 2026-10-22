-- The monthly AI budget in consume_daily_quota sums a user's ai_requests for
-- the current month on every AI request. Keep this pipeline-incompatible
-- statement isolated: the Supabase CLI runs CREATE INDEX CONCURRENTLY outside
-- its per-file transaction batch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_requests_user_created
  ON public.ai_requests (user_id, created_at);
