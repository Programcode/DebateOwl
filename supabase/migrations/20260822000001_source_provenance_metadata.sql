-- Provenance for saved research sources (Quality & Truth Release).
-- Prepared but NOT applied by the release branch. Apply before deploying a
-- frontend build that writes source metadata (session-store addSource sends
-- `metadata`; older schemas reject unknown columns).
--
-- RLS is unchanged: sources keeps its existing per-user policies and the new
-- column inherits them.

alter table public.sources
  add column if not exists metadata jsonb;

comment on column public.sources.metadata is 'Provenance for auto-captured or imported sources: url, sourceType, qualityScore, qualityLabel (strong|moderate|weak), originating research query, capturedVia feature.';
