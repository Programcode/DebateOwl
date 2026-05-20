# Model Cost Accounting Plan

## Goal

Make admin cost reporting real instead of always showing `$0.0000`.

Each AI request should store:

- the provider and model already selected by the user.
- input/output token counts returned by the provider.
- any cached/reasoning/thinking token counts when available.
- the pricing snapshot used for calculation.
- the calculated USD cost for that request.

The admin panel should then sum stored costs by total, day, feature, model, and user.

## Current Problem

The database already has `ai_requests.cost_usd`, `input_tokens`, and `output_tokens`, but `supabase/functions/ai/index.ts` calls `logUsage(...)` with token counts as `undefined` for most success paths. `logUsage` also has hardcoded rough pricing tables, so even when tokens are available the pricing source is not auditable.

Result: admin totals and top users show `$0.0000`.

## Official Pricing Sources

Download and snapshot pricing documentation from official provider pages:

- OpenAI: `https://platform.openai.com/docs/pricing` and `https://openai.com/api/pricing/`
- Anthropic: `https://docs.anthropic.com/en/docs/about-claude/pricing`
- Google Gemini: `https://ai.google.dev/gemini-api/docs/pricing`

Notes from current docs:

- OpenAI pricing is per 1M input, cached input, and output tokens, and reasoning tokens are billed as output tokens.
- Anthropic pricing is per MTok for base input, cache writes, cache hits, and output tokens.
- Gemini pricing is per 1M tokens and can vary by model, processing mode, prompt size threshold, cached context, grounding, and thinking/output tokens.

## Implementation Steps

1. Add a pricing snapshot folder:
   - `docs/pricing-snapshots/openai.html`
   - `docs/pricing-snapshots/anthropic.html`
   - `docs/pricing-snapshots/google-gemini.html`
   - `docs/pricing-snapshots/metadata.json`

2. Add a script:
   - `scripts/update-model-pricing.ts`
   - Downloads the official pricing pages.
   - Writes timestamp, source URL, and content hash.
   - Extracts only the model IDs used in `src/lib/ai/providers/types.ts`.
   - Emits a normalized checked-in file, for example `supabase/functions/_shared/model-pricing.ts`.

3. Normalize pricing as data:
   - `provider`
   - `model`
   - `source_url`
   - `source_retrieved_at`
   - `currency`
   - `input_per_1m`
   - `cached_input_per_1m`
   - `output_per_1m`
   - optional `cache_write_per_1m`
   - optional `long_context_threshold_tokens`
   - optional `long_context_input_per_1m`
   - optional `long_context_output_per_1m`
   - optional `tool_costs`

4. Add a shared calculator:
   - `supabase/functions/_shared/cost.ts`
   - `calculateRequestCost({ provider, model, usage, pricing })`
   - Handles OpenAI, Anthropic, and Google usage shapes.
   - Returns `{ inputTokens, cachedInputTokens, outputTokens, reasoningTokens, costUsd, pricingSnapshotId }`.
   - Fails closed for unknown pricing by logging `cost_usd = null`, not fake estimates.

5. Change provider wrappers to return usage:
   - OpenAI: capture `usage.prompt_tokens`, `usage.completion_tokens`, and cached-token details when present.
   - Anthropic: capture `usage.input_tokens`, `usage.output_tokens`, cache creation, and cache read tokens when present.
   - Google: capture `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`, and `totalTokenCount`.

6. Change `callAI` return shape:
   - From parsed JSON only.
   - To `{ output, usage }`.
   - Preserve existing feature behavior by passing `output` to existing transforms.

7. Update `logUsage`:
   - Remove hardcoded rough pricing.
   - Accept normalized usage and calculated cost.
   - Store `input_tokens`, `output_tokens`, `cost_usd`, and status consistently.

8. Add migration for richer audit fields:
   - `cached_input_tokens integer`
   - `reasoning_output_tokens integer`
   - `pricing_snapshot_id text`
   - `pricing_source_url text`
   - `cost_calculation_version text`

9. Backfill strategy:
   - Do not invent historical costs for rows with missing tokens.
   - Optionally set `cost_usd = null` where tokens are missing.
   - Admin UI should label these as "unknown cost" instead of `$0.0000`.

10. Admin panel updates:
   - Show total known cost.
   - Show unknown-cost request count.
   - Add cost by model table.
   - In Top Users, display `$0.0000` only when known cost is actually zero.
   - Use `—` or "unknown" when all rows lack token/cost data.

## Tests

- Unit tests for cost calculation:
  - OpenAI standard input/output.
  - OpenAI cached input.
  - Anthropic cache read/write tokens.
  - Gemini output plus thinking tokens.
  - Gemini long-context threshold.
  - unknown model returns `costUsd: null`.

- Edge function tests:
  - mocked OpenAI response stores token counts and cost.
  - mocked Anthropic response stores token counts and cost.
  - mocked Gemini response stores token counts and cost.
  - provider error logs request with `status = error` and no fake cost.

- Admin tests:
  - total cost sums known costs.
  - unknown-cost rows do not render as `$0.0000`.
  - top users cost display uses stored `cost_usd`.
  - cost by model renders model, request count, known cost, and unknown count.

## Rollout

1. Add pricing snapshot and calculator with tests.
2. Add migration for audit columns.
3. Update provider wrappers to preserve usage.
4. Update `logUsage` writes.
5. Update admin RPCs to return known cost and unknown-cost counts.
6. Update Admin UI.
7. Run:
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `deno check supabase/functions/ai/index.ts supabase/functions/admin/index.ts`
8. Deploy migration and Supabase functions before frontend deploy.

## Acceptance Criteria

- A real successful AI request creates an `ai_requests` row with non-null token counts.
- Known-priced models create a non-null `cost_usd`.
- Unknown-priced models are visible as unknown cost, not zero cost.
- Admin total cost and top-user cost reflect the stored request costs.
- Pricing data can be refreshed intentionally with one script and has auditable source URLs.
