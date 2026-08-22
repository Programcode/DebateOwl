# System Prompt Improvement Plan

## Goal

Make prompts produce more controlled, useful debate coaching while preserving the app's structured JSON contracts.

## Problems to Fix

- The global system prompt is too generic and does not consistently enforce debate-specific quality.
- Feature prompts repeat guidance in scattered places, so control behavior can drift.
- Ask mode, source handling, and citation honesty need stricter rules against invented evidence.
- Prompt changes are hard to evaluate because there is no prompt regression suite.

## Proposed Work

1. Create a shared prompt rubric for all features:
   - debate usefulness
   - control obedience
   - evidence honesty
   - language consistency
   - concise JSON validity

2. Split prompts into stable layers:
   - global product identity
   - feature-specific task
   - user controls
   - source/citation rules
   - output schema rules

3. Add per-feature prompt fixtures:
   - Generate: BP intro, BP extension, rebuttal, brief/standard/comprehensive.
   - Attack: aggressive vs moderate critique, fallacy on/off, weighing on/off.
   - Brainstorm: top-five vs buckets, both sides vs one side.
   - Factoids: legal, statistics, academic, recent timeframe.
   - Ask: general, clarify, citations, web search, pros/cons, argument map.

4. Add regression tests that assert:
   - required controls appear in the user prompt.
   - source/citation honesty rules are present when needed.
   - JSON-only instruction is present for structured features.
   - language instruction cannot be dropped.
   - generated case length maps to exact contention counts.

5. Add a small manual eval sheet:
   - 3 motions
   - 3 levels of complexity
   - pass/fail notes for quality, control obedience, and hallucination risk.

6. Roll out prompt edits feature by feature:
   - Ask first, because users feel quality immediately.
   - Generate second, because structure/control compliance matters most.
   - Factoids/search third, because citation honesty needs careful review.
   - Attack and Brainstorm last.

## Acceptance Criteria

- Prompt-builder tests cover every user-visible control.
- No structured feature loses valid JSON output in tests.
- Ask responses state uncertainty instead of inventing sources.
- Generate consistently respects side, role, length, audience, and tone.
- Prompt text is easier to update without changing unrelated feature behavior.

## Status after Quality & Truth Release (branch t3code/quality-truth-release)

Implemented:

1. Layered prompts in `supabase/functions/_shared/prompts.ts`: product identity (includes humanizer rules), per-feature task prompts, single-sourced JSON-only output rules, admin/custom overrides, knowledge base, and research citation honesty rules included only when research accompanies the request.
2. Deduplication: humanizer text, citation-honesty rules, and JSON instructions each exist once; Ask's duplicated honesty lines were folded into shared layers. The Generate role-vs-length contradiction was removed with an explicit CONTROL PRECEDENCE rule.
3. Fixtures/regression tests: `_shared/prompts.test.ts` (layer presence, order, no duplication, date replacement), existing `prompt-builder.test.ts` for controls/language, and `control-matrix.test.ts` for exact propagation.
4. Manual evaluation sheet created at `plans/prompt-eval-sheet.md`: 3 motions x 3 complexity levels, scoring quality/control obedience/hallucination risk/JSON validity, explicitly marked as subjective evidence rather than automated proof.

Deferred:

- Feature-by-feature rollout ordering from this plan (Ask first) collapses into one release branch because prompt layers are shared infrastructure; per-feature diffs remain reviewable in `_shared/prompts.ts`.
- Per-provider prompt tuning experiments.
