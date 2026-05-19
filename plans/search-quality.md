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
