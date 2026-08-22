# Ask and Sitewide Search Quality Plan

## Goal

Make web research trustworthy across Generate, Attack, Brainstorm, Factoids, and Ask. Search should prefer specific, primary, current sources and visibly downgrade broad fallback sources.

## Current Baseline

- The shared Supabase `ai` function uses Exa for search and content extraction.
- Search now runs multiple deterministic queries, AI follow-up queries, source ranking, and reads the strongest URLs first.
- Ask displays source quality metadata in `searchInfo.sources`.

## Next Implementation Steps

1. Move research code from `supabase/functions/ai/index.ts` into `supabase/functions/_shared/research.ts`.
2. Add topic-specific query builders:
   - debate tournament: official pages, Tabbycat, Calicotab, WSDC, WUDC, tab/results pages.
   - policy/statistics: government, intergovernmental orgs, academic papers, high-quality news.
   - legal/current events: official laws, court pages, agencies, primary reporting.
3. Add source quality metadata to all discovered source returns, not only Ask.
4. Add source display components for Generate, Attack, Brainstorm, and Factoids where useful.
5. Store source ranking metadata in saved source records so users can review why a source was selected.
6. Add a "source quality floor":
   - strong/moderate sources can support citations.
   - weak sources can only appear as fallback context with an uncertainty.
7. Add integration tests with mocked Exa responses for each feature.

## Tests

- Deno tests for ranking and query building.
- Mocked edge function tests for Ask citation fallback.
- Frontend tests for displaying source quality labels.
- Manual browser test with current tournament queries and policy-stat queries.

## Deployment

Deploy `supabase functions deploy ai --project-ref uziwdtkzofptihahfooo` after Deno checks, frontend tests, and a local authenticated Ask test pass.

## Status after Quality & Truth Release (branch t3code/quality-truth-release)

Implemented:

1. Research pipeline extracted to `supabase/functions/_shared/research.ts` (Exa search, follow-ups, ranking context, citation sources) with an injected model caller so it is testable; ranking/query builders moved to `_shared/source-quality.ts`.
2. Topic-specific query builders (tournament, policy/statistics, legal/current events) were already present and are now covered by tests in the shared module.
3. All discovered-source returns carry quality metadata; Factoids now also returns `discoveredSources`.
4. Source display: shared `SourceQualityList` renders strong/moderate/weak labels plus "fallback context only" for weak sources in Generate, Attack, and Brainstorm results. Factoids shows only verified citations (quality-labeled consulted-list display deferred).
5. Provenance persists to saved sources: `sources.metadata` jsonb (migration `20260822000001`, prepared but NOT applied) stores url, sourceType, qualityScore, qualityLabel, originating query, capturedVia.
6. Source-quality floor completed: factoid citations verify only against fetched non-weak research content (`applyFactoidsVerification`); weak or unknown URLs are downgraded and filtered. Ask fallback already excluded weak sources.

Tests: `_shared/research.test.ts`, extended `source-quality.test.ts`, frontend `SourceQualityList.test.tsx`, session-store provenance round-trip, client discoveredSources tests.

Deferred:

- Replace inline `site:gov` query text with Exa's dedicated domain-filter request field (needs a live Exa parameter-verification pass).
- Handler-level integration test that mocks Exa end-to-end through `Deno.serve`; current coverage is at the extracted-function level plus frontend mocks.
- Factoids UI panel listing all consulted sources with quality chips.
