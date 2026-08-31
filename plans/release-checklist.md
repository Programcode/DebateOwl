# Quality & Truth Release checklist

Run every step before merging this branch. Nothing here deploys anything; deployment and migration application remain separate, explicitly approved steps.

## 0. Deployment record (2026-08-22)

- Merged: PR #5 (squash) + CI fix 6a0e592; Docker image `debate-trainer:latest` rebuilt by CI.
- Supabase staging (brifeyypjauyusmkptkx): 4 stray history rows repaired to reverted, reconcile migration made policy-idempotent, 7 migrations pushed, ai/ai-stream/admin deployed, preflight 200.
- Supabase production (uziwdtkzofptihahfooo): the two release migrations pushed, functions deployed, preflight 200/204, admin 401 unauthenticated.
- Frontend: Vercel project debate-navigator deployed and aliased to https://debate.pi-stack.org; VPS container `debatelab` recreated from the new image (HTTP 200).
- Local verification: full Supabase stack run in Docker (ports 5532x); RLS and error-path usage logging proven against it. Fresh local chains need manual DML grants for anon/authenticated/service_role (prod already has them; do NOT add a grants migration).

## 1. Automated checks (all must pass locally)

- [ ] `npm run lint` — zero errors
- [ ] `npm run typecheck` — clean
- [ ] `npm test` — full vitest suite green
- [ ] `npm run build` — production build succeeds
- [ ] `deno check supabase/functions/ai/index.ts supabase/functions/ai-stream/index.ts supabase/functions/admin/index.ts`
- [ ] `npm run test:edge` — native Deno coverage including the exported handler boundary
- [ ] `supabase db start && npm run test:db` — migration replay and pgTAP policy coverage with Supabase CLI 2.115 or newer

## 2. Migration review (before any deploy)

The two Quality & Truth migrations below are recorded in section 0 as applied:

- `20260822000000_ai_request_cost_audit.sql` — audit columns on `ai_requests`
- `20260822000001_source_provenance_metadata.sql` — `metadata` jsonb on `sources`

The audit follow-up adds one migration that must run before the updated `admin`
function or frontend is deployed:

- `20260831191838_deactivate_announcements.sql` — adds `deactivated_at` and excludes deactivated announcements from authenticated reads without deleting dismissal history

- [ ] Confirm all changed migration files are reviewed against current schema, migration order, and RLS (`ai_requests` stays service-role-write-only; `sources` keeps per-user policies; announcement deactivation preserves dismissal rows)
- [ ] Apply order: pending migrations first, then edge functions (`ai`, `ai-stream`, `admin`, `announcements` as changed), then frontend
  - both edge functions fall back to a base insert if audit columns are missing, so a deploy-order mistake degrades logging instead of breaking requests
  - the frontend sends `metadata` on source saves; deploying it before the `sources` migration will fail those writes

## 3. Authenticated staging smoke tests

With migrations applied and functions deployed to staging:

- [ ] Run one AI request per feature (Generate, Attack, Brainstorm, Factoids, Ask) with a real user
- [ ] Verify `ai_requests` rows now carry non-null token counts and, for priced models, non-null `cost_usd`, `pricing_snapshot_id`, `cost_calculation_version`
- [ ] Verify an unknown-priced model (e.g. `gemini-3.1-flash-lite-preview`) logs tokens with `cost_usd = null`
- [ ] Admin dashboard: Total Cost shows known cost or "Unknown" plus missing-data count, never `$0.0000` for unknown data; Cost by Model lists models with known cost and unknown counts
- [ ] Generate/Brainstorm/Attack results render "Researched sources" with strong/moderate/weak labels; weak sources say "fallback context only"
- [ ] Factoids return only verified citations whose URLs match fetched non-weak research content
- [ ] Ask in Clarify mode without follow-up questions shows the clarify uncertainty note
- [ ] Attack with both toggles off returns empty fallacies and the neutral weighing placeholder
- [ ] Auto-saved sources keep provenance metadata (inspect a `sources.metadata` row)

## 4. Manual source-quality checks

- [ ] Current-tournament query through Factoids: official tab/results pages rank above social/video; quality labels plausible against the listed reasons
- [ ] Policy/statistics query: government or IGO sources appear in top ranks
- [ ] Legal/current-events query: court or agency pages surface when they exist
- [ ] A query where only weak sources exist: response states limited evidence instead of citing weak pages

## 5. Manual control-honesty checks

- [ ] Generate length brief/standard/comprehensive yields exactly 2/3/4 contentions
- [ ] Audience/tone visibly change phrasing but search behavior is unchanged (matches their label)
- [ ] Ask toggles each change the rendered output shape as labeled
- [ ] Attack intensity/paradigm change the critique framing

## Rollback

- Edge functions: redeploy from the previous commit (`git checkout <prev-sha> -- supabase/functions && npx supabase functions deploy ...`)
- Frontend: redeploy previous build
- Migrations: columns are additive and nullable; rollback means leaving them unused, or `alter table ... drop column` if required
- No historical data is rewritten by this branch; nothing backfills costs
