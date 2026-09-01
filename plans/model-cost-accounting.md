# Model cost accounting follow-up plan

**Owner:** DebateLab application, admin, and Supabase Edge Function maintainers

**Snapshot:** 2026-08-31, `main` at `acaac0d`

**Goal:** Finish the operational accounting cleanup so stored model costs stay auditable, incomplete provider work is not billed as complete, and admin totals distinguish unknown cost from non-AI activity.

## Preconditions

Work in a new isolated T3 Code worktree with a dedicated feature branch owned by this plan. Before reading for implementation or editing, run `pwd`, `git branch --show-current`, `git status --short --branch`, and `git worktree list --porcelain`. Stop if the current directory is the main checkout, the branch is `main`, the worktree is dirty with another task's changes, or an existing plan worktree is being reused. Keep this plan's branch and PR independent of every other plan.

Use the repository's pinned runtime and package workflow. Verify `node --version` reports `22.x`, `npm --version` succeeds, `test -f package-lock.json` passes, and install with `npm ci`. Do not substitute Node 24, pnpm, yarn, or a different lockfile.

## Verified baseline

The Quality & Truth cost implementation is already merged. The current tree has provider usage normalizers and the fail-closed calculator in `supabase/functions/_shared/cost.ts`, the versioned model table in `_shared/model-pricing.ts`, the refresh-and-hash script, provider usage capture in both AI functions, and the admin model/feature/user display with unknown-cost labels. Those completed pieces are evidence for this follow-up, not work to repeat.

The local pricing metadata is `official-docs-2026-08-22`, retrieved on 2026-08-22. The script deliberately reports model findings and does not rewrite prices automatically. `gemini-3.1-flash-lite-preview` remains intentionally unknown-priced in the checked-in table.

The additive audit migration `supabase/migrations/20260822000000_ai_request_cost_audit.sql` is present. A read-only `npx supabase migration list` against the linked production project on 2026-08-31 reports both 2026-08-22 migrations as applied. The migration comments saying "prepared but NOT applied" are historical and must not be used as current deployment evidence. Staging parity still needs an explicit target check before removing compatibility code.

## Remaining gaps

1. `ai` and `ai-stream` still retry an audit-column insert with a base-row insert when the new columns are missing. Once every supported environment is confirmed migrated, that compatibility fallback hides schema drift and should be removed. No new migration is needed.
2. `ai-stream` can log provider usage fragments after a client abort or incomplete upstream stream as a known cost. A partial observation is not a complete bill. Incomplete stream success/error paths must set the existing `incomplete` marker so `calculateRequestCost` returns `cost_usd = null` while retaining observed raw usage.
3. `import-source` writes successful `feature = 'import_source'`, `provider = 'url'`, and `model = 'url-import'` rows without token or cost data. Admin unknown-cost queries currently treat those non-AI operations like unpriced model calls. Keep their request volume visible, but exclude them from AI known/unknown cost breakdowns instead of displaying a fake zero or an irrelevant "unknown model" warning.
4. The checked-in official pricing capture is nine days old at this snapshot date. Refresh it at execution time and reconcile any changed model findings or rates by hand. Never infer a price from a changed page layout.

## Scope and non-goals

- Verify migration parity in each explicitly targeted environment, then remove only the two audit-column fallback branches in `supabase/functions/ai/index.ts` and `supabase/functions/ai-stream/index.ts`.
- Mark incomplete streaming provider work as incomplete in `ai-stream`; preserve the current calculator and raw-usage audit semantics.
- Make admin aggregation classify `import_source` as non-AI activity. Keep request-volume counts, but keep it out of AI cost/unknown-cost totals and cost-by-model/feature displays, or add a clearly non-applicable label if product review requires showing it there.
- Refresh official snapshots with `scripts/update-model-pricing.ts`; if prices or model availability changed, update the normalized table, snapshot id, and focused cost cases together. Unknown models must continue to fail closed.
- Do not backfill historical rows, invent token counts, rewrite old costs, add secrets, change provider limits, or change the database schema. Do not alter the existing RLS policy.

## Likely files

- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai-stream/index.ts`
- Modify: `supabase/functions/_shared/cost.ts` to expose the small tested helper that marks partial stream usage incomplete.
- Modify: `supabase/functions/admin/index.ts`
- Create: `supabase/functions/_shared/admin-cost.ts` for pure costability and non-AI classification helpers.
- Modify: `supabase/functions/_shared/model-pricing.ts` only when the refreshed official evidence changes a verified entry.
- Refresh: `docs/pricing-snapshots/openai.md`, `docs/pricing-snapshots/anthropic.md`, `docs/pricing-snapshots/google-gemini.html`, and `docs/pricing-snapshots/metadata.json` through the existing script.
- Modify: `package.json` and `package-lock.json` to add the exact `tsx@4.19.2` dev dependency before running the TypeScript pricing refresh.
- Modify tests: `supabase/functions/_shared/cost.test.ts` and `supabase/functions/_shared/admin-cost.test.ts`.
- Retain the existing known/unknown display coverage in `src/test/pages/AdminPage.test.tsx`; extend it only if the admin response contract changes.
- No change expected: `supabase/migrations/20260822000000_ai_request_cost_audit.sql`; it is the existing additive migration and must be applied, not rewritten.

## Sequenced changes

### 1. Establish environment and pricing baselines

Read-only check the exact linked production and staging targets for migration `20260822000000`. If any target lacks the audit columns, stop the fallback-removal phase. Applying the existing migration is a separate authorized Supabase operation and must happen before deploying functions that require the columns.

Add `tsx@4.19.2` as an exact dev dependency with npm, commit the matching `package.json` and `package-lock.json` changes with the implementation, then run `npm exec -- tsx scripts/update-model-pricing.ts` only in the implementation worktree. Review all three fresh captures, hashes, and model findings. If any finding changed, transcribe only prices supported by the captured official page into `_shared/model-pricing.ts`, bump `PRICING_SNAPSHOT_ID`, and add or update focused cases. If a model is not verifiable, leave it unknown-priced.

### 2. Make observed usage truthful

Track whether `ai-stream` reached a complete upstream terminal state. On client abort or any incomplete upstream error, pass the observed usage through the incomplete marker, including an `{ incomplete: true }` record when no usage was returned. Keep fully completed streams billable when the provider supplied usable usage. Remove the audit-column fallback from both `logUsage` implementations only after migration parity is proven. Do not add a retry that could duplicate an insert.

### 3. Separate AI cost from importer activity

Update the admin aggregation's costability predicate and selected fields so successful `import_source` rows do not inflate unknown-cost counts or appear as unpriced model costs. Preserve all request-volume counts and existing AI known-cost sums. Add regression fixtures covering known AI cost, unknown-priced AI cost, rate-limited rows, provider errors, and successful importer rows.

### 4. Prove the complete accounting flow

With a real authenticated staging account and authorized provider test credentials, run one successful non-stream request for a verified-priced model, one basic Ask stream, one interrupted stream, one unknown-priced model request, and one source import. Inspect the resulting `ai_requests` rows directly and exercise the admin stats response and Admin page. Confirm snapshot ids and raw usage are present where the audit columns apply, partial work is unknown-cost, and importer activity is not mislabeled as model cost.

## Verification

Focused checks:

```bash
npx vitest run \
  supabase/functions/_shared/cost.test.ts \
  src/test/pages/AdminPage.test.tsx
deno check supabase/functions/ai/index.ts supabase/functions/ai-stream/index.ts supabase/functions/admin/index.ts
deno test --allow-read --allow-env=EXA_API_KEY --allow-net=127.0.0.1 supabase/functions/
```

Run the full local gates:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
CI=1 PORT=18082 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18082 npm run test:e2e -- --workers=2
```

Run the existing Edge Function suites as well:

```bash
npx vitest run supabase/functions
```

The authenticated staging requests and direct row/admin inspection are required runtime evidence. Unit tests and a clean build do not prove provider usage capture or migration parity. Do not issue provider or Supabase production requests during local verification.

## Acceptance

- After migration parity is confirmed, neither AI function contains a base-row fallback for missing audit columns, and an audit insert cannot be silently downgraded.
- A completed priced provider request stores observed input/output counts, calculator version, pricing snapshot/source, raw usage, and a non-null USD cost.
- An unknown-priced model preserves observed usage but stores `cost_usd = null` and is displayed as unknown.
- An interrupted or incomplete stream never produces a known lower-bound cost; observed fragments remain auditable.
- Successful `import_source` rows remain part of request-volume reporting but do not inflate AI unknown-cost totals or show as a fake `$0.0000` model cost.
- Admin totals, feature/model/user breakdowns, and the Admin page agree on known versus unknown cost, with no historical backfill.
- Pricing metadata hashes and normalized entries resolve to the reviewed official captures used for the release.

## Rollout, rollback, and authorization

This follow-up has no new schema migration. For any environment missing `20260822000000`, apply that existing additive migration first, one verified target at a time, only under explicit authorization. Deploy `ai`, `ai-stream`, and `admin` only after the schema check, then deploy the frontend if its display contract changed. Real provider requests, staging credentials, production function deployment, and production row inspection require Adam's explicit authorization for the concrete operation.

If runtime verification fails, redeploy the last known-good Edge Function revisions. Revert normalized pricing and snapshot files as one commit if a transcription is wrong. Leave additive audit columns and historical rows untouched. Never drop columns or rewrite past costs as a rollback.
