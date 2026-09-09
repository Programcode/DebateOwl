# System prompt improvement plan

**Status:** Implementation and manual baseline completed on the isolated `t3code/system-prompt-improvements` branch, based on `235bb49`. Credential-free and protected staging verification passed. Release verification and rollout are tracked in PR #42. See [prompt-eval-sheet.md](prompt-eval-sheet.md) for the dated 36-response comparison and its limits.

## Preconditions

- Create and use your own isolated T3 Code worktree and feature branch for this plan; do not edit `main` or reuse another plan's worktree. Before edits, verify `pwd`, `git branch --show-current`, `git status --short --branch`, and `git worktree list --porcelain`, and keep this branch/worktree independent through its PR lifecycle.
- Use Node `22.x` from `package.json`, npm, and the committed `package-lock.json`; verify `node --version`, `npm --version`, and `test -f package-lock.json`, then run `npm ci` before the gates.

## Goal

Keep DebateLab's debate coaching prompts controlled, evidence-honest, language-aware, and compatible with every structured JSON contract, including the newer sparring and Crossfire modes.

## Current implementation

`supabase/functions/_shared/prompts.ts` now composes product identity, one feature task, one JSON rule block, admin/custom instructions, bounded local sources, and research citation rules in a stable order (`prompts.ts:1-11,441-479`). It includes the date placeholder, humanizer rules, transcript-only sparring guidance, and Crossfire turn-reference rules. `supabase/functions/ai/index.ts:1280-1299` supplies the current date, global prompt, custom prompt, local sources, and research marker. Crossfire and sparring correctly ignore unrelated custom/source context where their contracts require it.

Existing regression coverage includes shared-layer presence/order/no-duplication/date replacement (`supabase/functions/_shared/prompts.test.ts`), visible controls and language (`supabase/functions/ai/prompt-builder.test.ts` and `src/test/supabase/prompt-builder.test.ts`), exact propagation and post-processing (`supabase/functions/ai/control-matrix.test.ts`), and JSON schema validation at the client boundary. The exact Generate length rule is enforced in both the prompt and `control-enforcement.ts`.

## Remaining work, in order

### 1. Finish the prompt fixture matrix

**Files likely to change:**

- `supabase/functions/ai/prompt-builder.test.ts`
- `src/test/supabase/prompt-builder.test.ts`
- `supabase/functions/_shared/prompts.test.ts`
- `supabase/functions/ai/control-matrix.test.ts` only when a missing control needs a regression row

Add deterministic fixture cases for the combinations that are not covered today. Generate needs Introductor, R1, R2, and Conclusor roles across brief, standard, and comprehensive lengths. Attack needs moderate and ruthless intensity, each judge paradigm, and both fallacy/weighing toggle states. Brainstorm needs top-five, mindmap, and buckets with one-side and both-side inputs. Factoids needs legal, statistics, academic, recent-timeframe, direction, and source-count inputs. Ask needs general and clarify modes with citation, web-search, pros/cons, and argument-map toggles. Include school, LD, and PF sparring controls and the three Crossfire styles where their dedicated builders are exercised.

Each fixture should assert the request prompt fields and the behavioral output rule that matters. Do not snapshot large prose strings or call a provider. Assert that structured features retain the shared JSON-only rule, language cannot disappear, research rules appear only when research is attached, and no feature-specific layer is duplicated.

### 2. Bring streaming Ask prompt rules to an explicit contract

**Files likely to change:**

- `supabase/functions/ai-stream/index.ts:112-125`
- A small shared streaming prompt helper in `supabase/functions/_shared/prompts.ts` if extraction reduces duplication
- New focused edge test beside `supabase/functions/ai-stream/` or the existing `src/test/ai/streaming.test.ts`

The streaming endpoint intentionally returns Markdown and rejects advanced research/toggle modes, so it must not be forced through the JSON Ask prompt. Compare its `buildMessages` identity, language, mode guidance, and no-invented-citation rules with the shared Ask contract. Extract only the common rules that fit both paths, retain the freeform streaming contract, and test that a simple streaming Ask request keeps the rules while advanced modes remain rejected. Do not introduce a second research path.

### 3. Record a small manual prompt evaluation

**Files likely to change:**

- New `plans/prompt-eval-sheet.md`
- No production code

Create a dated, versioned evaluation sheet with three motions and three complexity levels. For each run record quality, control obedience, evidence honesty, language consistency, hallucination risk, and JSON validity. Mark these observations as subjective evidence, not an automated gate. Use the same prompt/model configuration for a before/after comparison and do not place credentials or raw provider responses containing user data in the repository.

Per-provider tuning experiments are out of scope until this fixture and manual baseline show a repeatable provider-specific failure. The old feature-by-feature rollout order is also out of scope because the shared layers are one change point; review the feature diffs and release them together.

## Verification and acceptance

Run focused tests after each fixture group:

```bash
npx vitest run supabase/functions/_shared/prompts.test.ts supabase/functions/ai/prompt-builder.test.ts supabase/functions/ai/control-matrix.test.ts src/test/supabase/prompt-builder.test.ts
npx vitest run supabase/functions/ai-stream/prompt.test.ts src/test/ai/streaming.test.ts src/test/ai/streaming-integration.test.ts
```

Then run the repository gates:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
deno check supabase/functions/_shared/prompts.ts supabase/functions/ai/index.ts supabase/functions/ai-stream/index.ts
npm run test:edge
CI=1 PORT=18082 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18082 npm run test:e2e -- e2e/authed-pages.spec.ts e2e/sparring.spec.ts e2e/crossfire.spec.ts
```

The maintained `test:edge` script includes the environment permissions required by handler tests. The earlier `--allow-env=EXA_API_KEY` command fails when current tests set their synthetic Supabase and provider environment. Streaming handler tests run under native Deno.

Confirm port `18082` is free before the browser run; the explicit `PORT` and `PLAYWRIGHT_BASE_URL` prevent reuse of the dev server's default `8080`. Use mocked provider responses and authenticated fixtures. Acceptance requires every visible control to have a tested prompt or post-processing effect, all structured outputs to pass their schema gates, streaming Ask to remain Markdown-only, no citation rule to leak into a no-research path, and the manual sheet to be dated and reproducible.

## Rollout and authorization boundary

Prompt changes affect the `ai` and possibly `ai-stream` Edge Functions. Implementation must not deploy functions, change prompt records, alter secrets, or mutate production. Stage the shared prompt and streaming changes together in a non-production project, run the focused and full gates, then run authenticated browser checks before requesting production deployment authorization. Admin-configured global prompts remain runtime data and must not be overwritten by this work.

For rollback, redeploy the previous `ai` and `ai-stream` revisions and restore the previous frontend build if the client contract changed. Keep the prompt evaluation sheet as evidence of which revision was tested. If a prompt change breaks JSON validity or a visible control, stop rollout and revert the prompt-layer change rather than weakening schema validation.
