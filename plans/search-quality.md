# Ask and sitewide search quality plan

**Status:** Remaining work as of 2026-08-31 on `main` (`acaac0d`).

## Preconditions

- Create and use your own isolated T3 Code worktree and feature branch for this plan; do not edit `main` or reuse another plan's worktree. Before edits, verify `pwd`, `git branch --show-current`, `git status --short --branch`, and `git worktree list --porcelain`, and keep this branch/worktree independent through its PR lifecycle.
- Use Node `22.x` from `package.json`, npm, and the committed `package-lock.json`; verify `node --version`, `npm --version`, and `test -f package-lock.json`, then run `npm ci` before the gates.

## Goal

Make web research trustworthy across Generate, Attack, Brainstorm, Factoids, and Ask. Prefer specific, primary, current sources, expose why a source was selected, and keep weak pages out of evidence claims.

## Current implementation

The main branch already has the shared research pipeline in `supabase/functions/_shared/research.ts` and ranking/query logic in `supabase/functions/_shared/source-quality.ts`. The `ai` handler runs research for Factoids, Ask, Generate, Brainstorm, and Attack, returns ranked metadata for discovered sources, and applies a quality floor before Factoids citations are marked verified (`supabase/functions/ai/index.ts:1389-1442,1445-1565`). Generate, Attack, and Brainstorm render `SourceQualityList` with strong/moderate/weak labels. Saved URL sources carry provenance in `session-store.ts`. The 2026-08-31 read-only production migration-list evidence recorded in `plans/model-cost-accounting.md` reports both 2026-08-22 migrations applied; the SQL comments saying "prepared but NOT applied" are historical release-branch comments, not current target evidence. Staging or another target still needs its own read-only parity check.

The ranking tests cover tournament, policy/statistics, and legal/current-event query planning plus weak-source handling (`supabase/functions/ai/source-quality.test.ts`, `supabase/functions/_shared/research.test.ts`). Factoids still drops the handler's `discoveredSources` at the client boundary (`src/lib/ai/client.ts:1024-1050`), and `FactoidsResults` has no consulted-source prop (`src/components/features/factoids/FactoidsResults.tsx:21-26`). Exa requests still use query operators and legacy field names (`supabase/functions/_shared/source-quality.ts:208-252`, `supabase/functions/_shared/research.ts:255-305`). There is no handler-boundary research test in `supabase/functions/ai/`.

## Remaining work, in order

### 1. Use first-class Exa source filters

**Files likely to change:**

- `supabase/functions/_shared/source-quality.ts`
- `supabase/functions/_shared/research.ts`
- `supabase/functions/ai/source-quality.test.ts`
- `supabase/functions/_shared/research.test.ts`
- New focused test: `supabase/functions/_shared/research-exa-filters.test.ts`

First confirm the current Exa request contract from its official documentation or a bounded staging request. Model a search request separately from its query text. Government requests should use the curated domain allowlist through `includeDomains`; academic and news requests should use the documented `category` values. Send the current request fields (`numResults` and `contents.text.maxCharacters`) and stop embedding `site:gov` in user-visible query text. Apply the same preference to AI follow-up queries.

If a filtered request returns zero results, retry that query once without the filter, keep the unfiltered results marked as fallback candidates, and let the existing ranker decide whether they are citable. Do not silently treat a filtered zero-result response as proof that no evidence exists.

Tests must assert request bodies, the preferred-source mapping, and the zero-result fallback without calling Exa. Preserve ranking, deduplication, timeout, cancellation, and weak-source behavior.

### 2. Show all consulted Factoids sources

**Files likely to change:**

- `src/lib/ai/client.ts:1024-1050`
- `src/pages/FactoidsPage.tsx:16-44,123-147`
- `src/components/features/factoids/FactoidsResults.tsx:21-26,140-240`
- `src/components/features/shared/SourceQualityList.tsx`
- `src/locales/en.json`, `src/locales/es.json`, `src/locales/hu.json`
- `src/test/ai/client-branches.test.ts`
- `src/test/components/FactoidsResults.test.tsx`
- `src/test/pages/ConversationPages.test.tsx`
- New browser coverage in `e2e/research-quality.spec.ts`

Return the existing handler envelope as `{ result, discoveredSources }` from `factoids()`, keep compatibility only where existing mocks still return a bare `FactoidsOutput`, and store the consulted list separately from the verified Factoids result. Pass it to `FactoidsResults` and render a localized "Sources consulted" section through `SourceQualityList`.

The panel must show quality and source type for every consulted page, explicitly label weak pages as fallback context, and never turn a weak or unverified page into a saved verified factoid. Keep the existing verified-factoid list, source-count limit, and exports unchanged. Test the envelope, empty list, strong/moderate links, and weak-source warning. The browser test should mock the authenticated Factoids request and prove the panel renders at desktop and mobile widths without horizontal overflow.

### 3. Add one handler-boundary research test

**Files likely to change:**

- New `supabase/functions/ai/handler-research.test.ts`
- Existing test adapters under `src/test/deno-compat.ts` only if the handler import needs a small, isolated shim

Import the actual `supabase/functions/ai/index.ts` entrypoint through the repository's Deno/Vitest adapter. Mock Supabase authentication and writes, Exa search/content calls, and the model-provider network boundary. Exercise at least one Factoids request through `Deno.serve` and assert that the response contains only quality-eligible verified citations plus the consulted-source envelope. Add an Ask case if it can reuse the same harness without hiding a separate failure.

Keep the test deterministic and offline. Assert that no real API key, provider, or production project is contacted. Preserve the handler's response status, timeout, cancellation, and error logging behavior.

## Verification and acceptance

Run focused checks after each slice:

```bash
npx vitest run supabase/functions/_shared/research.test.ts supabase/functions/ai/source-quality.test.ts supabase/functions/_shared/research-exa-filters.test.ts
npx vitest run src/test/ai/client-branches.test.ts src/test/components/FactoidsResults.test.tsx src/test/pages/ConversationPages.test.tsx
```

Then run the repository gates:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
deno check supabase/functions/_shared/research.ts supabase/functions/_shared/source-quality.ts supabase/functions/ai/index.ts
deno test --allow-read --allow-env=EXA_API_KEY --allow-net=127.0.0.1 supabase/functions/
CI=1 PORT=18081 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18081 npm run test:e2e -- e2e/research-quality.spec.ts
```

Confirm port `18081` is free before the browser run; the explicit `PORT` and `PLAYWRIGHT_BASE_URL` prevent reuse of the dev server's default `8080`. Acceptance requires correct Exa request fields and fallback, quality-labeled consulted Factoids sources in all supported locales, no weak citation, no fabricated URL, and no new overflow or console error.

## Rollout and authorization boundary

This work changes the `ai` Edge Function and the Factoids client. Do not deploy, apply migrations, alter secrets, or touch production data as part of implementation. Before a release, verify the exact target Supabase project and run a read-only migration-list check. The linked-production evidence above shows both 2026-08-22 migrations already applied, so do not reapply them; staging or another target must establish its own parity. If a target is missing the existing additive source-provenance migration, applying it is a separate explicitly authorized Supabase operation and must precede frontend writes of `sources.metadata`; deploying `ai` also needs explicit authorization for that target. Roll out a verified staging target first, then `ai` and frontend, with authenticated Factoids and Ask smoke tests after each step.

For rollback, redeploy the previous `ai` revision and previous frontend build. Leave the nullable provenance column unused if a migration rollback is required; do not drop it or rewrite historical rows without a separate approved operation. Keep Exa filter rollout behind the same release boundary until the request-body test and a real staging request agree.
