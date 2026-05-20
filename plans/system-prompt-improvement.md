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
