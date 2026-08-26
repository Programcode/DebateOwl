# Ask and Sitewide Search Quality — Completed Implementation Record

## Goal

Make web research trustworthy across Generate, Attack, Brainstorm, Factoids, and Ask. Search should prefer specific, primary, current sources and visibly downgrade broad fallback sources.

## Completed source work

1. Research is isolated in `supabase/functions/_shared/research.ts`, with model calls injected through `ResearchDeps` so the research layer remains testable.
2. Topic-aware request planning covers:
   - debate tournaments: official/tab/results searches, Tabbycat/Calicotab/WSDC/WUDC terminology;
   - policy/statistics: government and intergovernmental data, academic evidence, current reporting;
   - legal/current events: official laws, courts, agencies, primary sources.
3. Preferred Exa source types are represented as first-class request fields rather than query-operator hacks:
   - government/public-sector searches use `includeDomains` with a curated domain set;
   - academic searches use Exa's `research paper` category;
   - news searches use Exa's `news` category;
   - a zero-result filtered request retries the same query without the filter to preserve recall.
4. Search results are ranked with source type, quality score, quality label, reasons, query provenance, recency, specificity, and fallback penalties.
5. Strong/moderate sources may support citations. Weak sources remain fallback context only.
6. Generate, Attack, and Brainstorm expose researched source quality through the shared `SourceQualityList`.
7. Factoids now returns `discoveredSources` separately from verified factoids and renders all consulted pages with quality chips. Weak consulted sources remain visible as fallback context but cannot become verified evidence.
8. Ask keeps search metadata and citation fallback quality-gated.
9. Saved source provenance can store source type, quality score/label, originating query, and capture path where the database migration is available.

## Verification in source

Coverage now includes:

- ranking and topic-specific request planning;
- raw Exa request body assertions for `includeDomains`, category, `numResults`, and text-size fields;
- filtered-search zero-recall fallback;
- quality-floor enforcement for Factoids;
- frontend consulted-source labels and weak-source warnings;
- Factoids client provenance parsing;
- a handler-boundary Factoids test that imports the actual `supabase/functions/ai/index.ts` entrypoint through the Vitest `Deno.serve` loopback shim while mocking Supabase, Exa, and model-provider network boundaries.

Relevant tests include:

- `supabase/functions/_shared/research.test.ts`
- `supabase/functions/_shared/research-exa-filters.test.ts`
- `supabase/functions/ai/source-quality.test.ts`
- `supabase/functions/ai/handler-research.test.ts`
- `src/test/components/SourceQualityList.test.tsx`
- `src/test/components/FactoidsResults.test.tsx`
- `src/test/ai/factoids-provenance.test.ts`

## Deployment status

This record describes repository source. On `feature/sparring-verification-retention-loop`, **no Supabase migration or Edge Function has been applied or deployed**. Any backend behavior changed on this branch remains pending explicit deployment authorization.

`supabase/migrations/20260822000001_source_provenance_metadata.sql` and any later branch migrations are source artifacts until separately applied.
