-- Keep this pipeline-incompatible statement isolated. Current Supabase CLI
-- runs CREATE INDEX CONCURRENTLY outside its per-file transaction batch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sparring_sessions_user_updated
  ON public.sparring_sessions (user_id, updated_at DESC);
