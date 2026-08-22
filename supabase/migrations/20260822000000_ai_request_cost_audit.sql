-- Audit columns for real model cost accounting (Quality & Truth Release).
-- Prepared but NOT applied by the release branch. Apply with:
--   npx supabase db push
-- before deploying the `ai` and `ai-stream` edge functions, which write these
-- columns (both functions fall back to a base insert if the columns are absent,
-- so deploy-order mistakes degrade logging instead of breaking requests).
--
-- RLS is unchanged: ai_requests stays service-role-write-only
-- (20260819000000_security_hardening.sql revoked client INSERT/UPDATE/DELETE).

alter table public.ai_requests
  add column if not exists cached_input_tokens integer,
  add column if not exists cache_write_tokens integer,
  add column if not exists reasoning_output_tokens integer,
  add column if not exists pricing_snapshot_id text,
  add column if not exists pricing_source_url text,
  add column if not exists cost_calculation_version text,
  add column if not exists raw_usage jsonb;

comment on column public.ai_requests.cached_input_tokens is 'Provider-reported cached input tokens (OpenAI cached subset, Anthropic cache reads, Google cached content).';
comment on column public.ai_requests.cache_write_tokens is 'Anthropic cache write tokens (5m + 1h combined when both are reported).';
comment on column public.ai_requests.reasoning_output_tokens is 'Provider-reported reasoning/thinking tokens, already included in output_tokens.';
comment on column public.ai_requests.pricing_snapshot_id is 'Pricing snapshot used for cost calculation, e.g. official-docs-2026-08-21.';
comment on column public.ai_requests.pricing_source_url is 'Official pricing page the snapshot entry came from; null when pricing is unknown.';
comment on column public.ai_requests.cost_calculation_version is 'Calculator implementation version, e.g. cost-calc-v1.';
comment on column public.ai_requests.raw_usage is 'Verbatim provider usage object for audit.';
