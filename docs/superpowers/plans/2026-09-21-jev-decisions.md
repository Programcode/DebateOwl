# Jev decisions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jev-powered live Crossfire signals, semantic source ranking and case-use tracking, and `Auto Fast`/`Auto Pro` model routing through DebateLab's existing OpenRouter account.

**Architecture:** A small shared Deno module calls OpenRouter's Decisions API and validates typed Jev answers. The existing `ai` and `ai-stream` functions consume it for internal judgments while retaining their current authentication, quota, source-safety, and concrete-model paths. Client contracts carry bounded decision metadata into existing stores and UI without a new dependency or database migration.

**Tech Stack:** React 18, TypeScript 5.8, Zustand, Zod 4, Supabase Edge Functions on Deno, OpenRouter Decisions API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-jev-decisions-design.md`

## Global constraints

- Use Node `22.23.2`, npm, and the committed `package-lock.json`.
- Use only `OPENROUTER_API_KEY`; do not add or expose a TypeSafe key.
- Pin internal decisions to `typesafe/jev-1.13`.
- Keep `MODEL_CATALOG` concrete-only and preserve every manual model choice.
- `Auto Fast` is available to Basic users and normally resolves to `z-ai/glm-5.3-flash`, even though manual GLM selection remains Pro-only.
- `Auto Pro` remains Pro-only.
- Reserve one daily quota unit per product request; internal Jev calls do not reserve quota.
- Preserve deterministic source-quality, SSRF, citation, auth, RLS, and Crossfire transcript controls.
- Persist semantic source data only inside the existing `sources.metadata` JSONB and saved-output JSONB.
- Update English, Spanish, and Hungarian together.
- Preserve DebateLab's existing component system and visual design; add no frontend dependency.
- Do not deploy, merge, or change production state.

## Review focus

- A Basic user selecting `Auto Fast` must be allowed to resolve to GLM without gaining manual access to Pro-only GLM.
- An unavailable, timed-out, aborted, or malformed Jev response must follow the feature-specific fallback without losing a valid main response or starting work after cancellation.
- Semantic source updates must preserve existing provenance and must not delete, deactivate, or falsely mark uncertain sources as used.
- Crossfire signals must attach only to the answer in the newest completed exchange, including retries and restored drafts.
- Cost, analytics, and visible model metadata must report the concrete resolved model while retaining the requested automatic selection.

---

### Task 1: Shared Jev Decisions client

**Files:**
- Create: `supabase/functions/_shared/jev.ts`
- Create: `supabase/functions/_shared/jev.test.ts`
- Modify: `supabase/functions/_shared/research.ts`

**Interfaces:**
- Produces: `callJev({ state, questions, signal, fetchImpl? }): Promise<JevDecisionResult>`.
- Produces: validated `JevNoulAnswer`, `JevChoiceAnswer`, `JevScoreAnswer`, and normalized OpenRouter usage.
- Consumes: existing `fetchJsonWithTimeout`, response-size limits, `normalizeOpenRouterUsage`, and parent abort signals.

- [ ] **Step 1: Write failing serialization and parsing tests**

Add Deno tests with a real `Response` test double that assert:

```ts
const result = await callJev({
  state: { feature: "crossfire", text: "Question and answer" },
  questions: {
    directness: {
      type: "choice",
      instructions: "How directly does the answer address the question?",
      criteria: { direct: "Fully answers it", partial: "Answers only part", evasive: "Avoids it" },
    },
    concession: {
      type: "noul",
      instructions: "Does the answer concede the challenged claim?",
      criteria: { true: "Concedes it", false: "Does not concede it" },
    },
  },
  fetchImpl,
});

assertEquals(capturedUrl, "https://openrouter.ai/api/alpha/decisions");
assertEquals(capturedBody.model, "typesafe/jev-1.13");
assertEquals(result.answers.directness.choice, "direct");
assertEquals(result.answers.concession.noul, 0.12);
```

Add literal fixtures for choice probabilities, score legend, usage, returned model, malformed answers, oversized bodies, non-2xx responses, timeout, and caller abort. The production mutation each test catches is stated in its name.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
deno test --allow-read --allow-env=OPENROUTER_API_KEY --allow-net=127.0.0.1 supabase/functions/_shared/jev.test.ts
```

Expected: FAIL because `jev.ts` and `callJev` do not exist.

- [ ] **Step 3: Implement the minimum Decisions client**

Define discriminated question and answer unions. Parse the response from
`unknown`; reject an answer whose type, chosen label, probability map, score,
legend, or bounds do not match its submitted question. Use the injected fetch
only in tests; production defaults to `globalThis.fetch`. Link the eight-second
timeout to the caller signal, and return normalized usage without logging state
or question content.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2.

Expected: all `jev.test.ts` tests pass with no leaked credential or unhandled rejection.

- [ ] **Step 5: Run shared backend regression tests**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run test:edge
```

Expected: all Edge tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/jev.ts supabase/functions/_shared/jev.test.ts supabase/functions/_shared/research.ts
git commit -m "feat(ai): add OpenRouter Jev decisions client"
```

### Task 2: Automatic model routing

**Files:**
- Modify: `supabase/functions/_shared/model-catalog.ts`
- Modify: `supabase/functions/_shared/model-catalog.test.ts`
- Create: `supabase/functions/_shared/auto-model-router.ts`
- Create: `supabase/functions/_shared/auto-model-router.test.ts`
- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai-stream/index.ts`
- Modify: `supabase/functions/ai/handler-research.test.ts`
- Modify: `supabase/functions/ai-stream/handler_test.ts`
- Modify: `src/lib/ai/providers/types.ts`
- Modify: `src/lib/stores/settings-store.ts`
- Modify: `src/components/ModelSelector.tsx`
- Modify: `src/test/components/ModelSelector.test.tsx`
- Modify: `src/test/settings-store.test.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `callJev` from Task 1.
- Produces: `AUTO_MODEL_SELECTIONS`, `isAutoModelSelection()`, and `resolveModelSelection()` returning requested selection, resolved concrete ID, catalog entry, and effective reasoning.
- Produces: response `meta.requestedModel` and `meta.resolvedModel` for non-streaming and streaming requests.

- [ ] **Step 1: Write failing pure-router tests**

Cover these hand-derived cases:

```ts
assertEquals(await resolveModelSelection(autoFastOrdinaryFixture), {
  requestedModel: "auto-fast",
  resolvedModel: "z-ai/glm-5.3-flash",
  usedFallback: false,
});

assertEquals(await resolveModelSelection(autoFastLogicFixture), {
  requestedModel: "auto-fast",
  resolvedModel: "deepseek/deepseek-v4-flash-0731",
  usedFallback: false,
});
```

Also assert Basic Auto Fast access, GLM fallback, unsupported Jev labels ignored,
confidence below `0.55` fallback, Pro candidate allowlisting, Auto Pro rejection
before resolution for Basic, and caller abort propagation.

- [ ] **Step 2: Run pure-router tests and verify RED**

Run:

```bash
deno test --allow-read --allow-env=OPENROUTER_API_KEY --allow-net=127.0.0.1 supabase/functions/_shared/auto-model-router.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement virtual selections and router**

Keep the ten-item concrete catalog unchanged. Add exact virtual definitions:

```ts
export const AUTO_MODEL_SELECTIONS = [
  { id: "auto-fast", name: "Auto Fast", isProOnly: false },
  { id: "auto-pro", name: "Auto Pro", isProOnly: true },
] as const;
```

Build one Jev choice whose criteria contain only the applicable candidate IDs
and the approved strengths from the spec. Bound routing state to 8,000
characters. Validate the answer against the submitted candidate set.

- [ ] **Step 4: Make the backend resolve before concrete validation**

Refactor both Edge handlers to parse a `ModelSelection`, authenticate, enforce
`Auto Pro`, reserve one quota unit, resolve the selection, then apply existing
concrete catalog and reasoning rules. A validated `Auto Fast` route may use its
explicit candidate list even when GLM's manual catalog entry is Pro-only; a
manually requested GLM still uses the existing Pro gate. Use the resolved model
for provider calls, usage rows, cost, and admin aggregation. Return requested
and resolved IDs in response metadata. Add a separate internal Jev usage row
without calling the quota RPC again.

- [ ] **Step 5: Run handler tests and verify routing GREEN**

Run:

```bash
deno test --allow-read --allow-env=DEMO_CODE_PEPPER,EXA_API_KEY,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,SPARRING_INTEGRITY_SECRET,OPENROUTER_API_KEY,WORKSPACE_INVITE_SECRET,WORKSPACE_INVITE_MAILER_URL,WORKSPACE_INVITE_MAILER_TOKEN,WORKSPACE_INVITE_BASE_URL --allow-net=127.0.0.1 supabase/functions/_shared/model-catalog.test.ts supabase/functions/_shared/auto-model-router.test.ts supabase/functions/ai/handler-research.test.ts supabase/functions/ai-stream/handler_test.ts
```

Expected: Basic Auto Fast reaches GLM, Basic Auto Pro returns the existing 403,
manual GLM stays Pro-only, streaming reports the concrete model, and quota is
reserved once.

- [ ] **Step 6: Write failing client picker and settings tests**

Assert Auto Fast and Auto Pro render before concrete models, Auto Fast is enabled
for Basic, Auto Pro is disabled for Basic, automatic values survive store
normalization and server hydration, and reasoning is disabled for either auto
selection.

- [ ] **Step 7: Run client tests and verify RED**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/components/ModelSelector.test.tsx src/test/settings-store.test.ts
```

Expected: FAIL because virtual choices are not yet rendered or accepted.

- [ ] **Step 8: Implement the picker and persisted settings contract**

Add the two localized choices using the existing Select, Badge, and model label
styles. Do not add a new icon or layout. Preserve saved Pro controls while
entitlement is loading. Extend settings normalization without putting virtual
IDs into `MODEL_CATALOG`.

- [ ] **Step 9: Run client tests, typecheck, and docs check**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/components/ModelSelector.test.tsx src/test/settings-store.test.ts src/test/i18n.test.ts
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run typecheck
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run docs:check
```

Expected: all commands pass.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/model-catalog.ts supabase/functions/_shared/model-catalog.test.ts supabase/functions/_shared/auto-model-router.ts supabase/functions/_shared/auto-model-router.test.ts supabase/functions/ai/index.ts supabase/functions/ai-stream/index.ts supabase/functions/ai/handler-research.test.ts supabase/functions/ai-stream/handler_test.ts src/lib/ai/providers/types.ts src/lib/stores/settings-store.ts src/components/ModelSelector.tsx src/test/components/ModelSelector.test.tsx src/test/settings-store.test.ts src/locales/en.json src/locales/es.json src/locales/hu.json docs/architecture.md
git commit -m "feat(ai): add Jev automatic model routing"
```

### Task 3: Semantic source ranking, retention, and case usage

**Files:**
- Create: `supabase/functions/_shared/source-decisions.ts`
- Create: `supabase/functions/_shared/source-decisions.test.ts`
- Modify: `supabase/functions/_shared/prompts.ts`
- Modify: `supabase/functions/_shared/research.ts`
- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai/handler-research.test.ts`
- Modify: `src/lib/stores/session-store.ts`
- Modify: `src/lib/ai/client.ts`
- Modify: `src/lib/ai/schemas/generate.ts`
- Modify: `src/components/features/shared/SourceQualityList.tsx`
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/test/components/SourceQualityList.test.tsx`
- Modify: `src/test/pages/LibraryPage.test.tsx`
- Modify: `src/test/session-store.test.ts`
- Modify: `src/test/ai/client-branches.test.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `callJev` from Task 1.
- Produces: `rankSourcesForRequest()` and `identifyCaseSourceUsage()` with deterministic fallbacks.
- Produces: `SourceSemanticMetadata`, `SourceAssessment`, response `sourceAssessments`, and Generate `metadata.sourceUsage`.

- [ ] **Step 1: Write failing source decision tests**

Use literal source fixtures to assert:

- existing deterministic weak-source exclusion remains decisive;
- Jev relevance, importance, and strength reorder non-weak candidates;
- an all-low-confidence batch preserves original order;
- malformed or missing answers preserve original order;
- case usage requires probability above `0.70`;
- values from `0.30` through `0.70` remain uncertain;
- assessment count and source excerpts remain bounded.

- [ ] **Step 2: Run focused source decision tests and verify RED**

Run:

```bash
deno test --allow-read --allow-env=OPENROUTER_API_KEY --allow-net=127.0.0.1 supabase/functions/_shared/source-decisions.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement server-side source decisions**

Batch three typed questions per bounded candidate. Preserve stable original
indexes for ties. Apply semantic ordering only when at least one candidate has
usable confidence. After validated Generate output, batch one Noul per retained
source to identify material use and attach a maximum of ten snapshots.

- [ ] **Step 4: Write failing source persistence and UI tests**

Assert the client:

- sends stable IDs for active library sources;
- parses valid semantic metadata and discards invalid nested fields;
- persists `metadata` during `updateSource`;
- merges assessment updates without losing quality provenance;
- autosaves only retained or used discovered sources;
- defaults Library to Smart sorting;
- orders case-used, importance, strength, quality, and recency in that order;
- renders `Used in this case`, importance, strength, and use count accessibly;
- reloads a saved case with its source-usage snapshot.

- [ ] **Step 5: Run client tests and verify RED**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/session-store.test.ts src/test/ai/client-branches.test.ts src/test/components/SourceQualityList.test.tsx src/test/pages/LibraryPage.test.tsx
```

Expected: FAIL because semantic metadata and Smart sorting do not exist.

- [ ] **Step 6: Implement source contracts, persistence, and UI**

Extend provenance parsing with the exact bounded nested type from the spec.
Persist metadata on source updates. Add one store action that applies a bounded
assessment batch with user-scoped updates and optimistic rollback. Keep the
existing source row composition, adding no more than three semantic labels.
Add localized sort choices and the selected-source explanation.

- [ ] **Step 7: Run focused backend and client tests GREEN**

Run:

```bash
deno test --allow-read --allow-env=DEMO_CODE_PEPPER,EXA_API_KEY,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,SPARRING_INTEGRITY_SECRET,OPENROUTER_API_KEY,WORKSPACE_INVITE_SECRET,WORKSPACE_INVITE_MAILER_URL,WORKSPACE_INVITE_MAILER_TOKEN,WORKSPACE_INVITE_BASE_URL --allow-net=127.0.0.1 supabase/functions/_shared/source-decisions.test.ts supabase/functions/_shared/research.test.ts supabase/functions/ai/source-quality.test.ts supabase/functions/ai/handler-research.test.ts
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/session-store.test.ts src/test/ai/client-branches.test.ts src/test/components/SourceQualityList.test.tsx src/test/pages/LibraryPage.test.tsx src/test/i18n.test.ts
```

Expected: all commands pass and no prior provenance or source-quality assertion changes meaning.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/source-decisions.ts supabase/functions/_shared/source-decisions.test.ts supabase/functions/_shared/prompts.ts supabase/functions/_shared/research.ts supabase/functions/ai/index.ts supabase/functions/ai/handler-research.test.ts src/lib/stores/session-store.ts src/lib/ai/client.ts src/lib/ai/schemas/generate.ts src/components/features/shared/SourceQualityList.tsx src/pages/LibraryPage.tsx src/test/components/SourceQualityList.test.tsx src/test/pages/LibraryPage.test.tsx src/test/session-store.test.ts src/test/ai/client-branches.test.ts src/locales/en.json src/locales/es.json src/locales/hu.json docs/architecture.md
git commit -m "feat(sources): rank and retain evidence with Jev"
```

### Task 4: Live Crossfire coaching signals

**Files:**
- Create: `supabase/functions/_shared/crossfire-signals.ts`
- Create: `supabase/functions/_shared/crossfire-signals.test.ts`
- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai/handler-research.test.ts`
- Modify: `src/lib/crossfire/schemas.ts`
- Modify: `src/lib/crossfire/reducer.ts`
- Modify: `src/lib/ai/client.ts`
- Modify: `src/pages/CrossfirePage.tsx`
- Modify: `src/test/crossfire/schemas.test.ts`
- Modify: `src/test/crossfire/reducer.test.ts`
- Modify: `src/test/crossfire/storage.test.ts`
- Modify: `src/test/ai/crossfire-client.test.ts`
- Modify: `src/test/pages/CrossfirePage.test.tsx`
- Modify: `e2e/crossfire.spec.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `callJev` from Task 1 and resolved-model metadata from Task 2.
- Produces: `evaluateCrossfireExchange()` and optional `CrossfireTurnSignal` attached to an answer turn.
- Produces: next-turn response `{ output, signal?, meta }`; a missing signal is valid.

- [ ] **Step 1: Write failing server signal tests**

Cover both Crossfire modes:

```ts
assertEquals(questionAi.signal?.answerTurnId, "T2");
assertEquals(questionAi.signal?.answerQuality, "direct");
assertEquals(aiQuestionsUser.signal?.answerTurnId, "T2");
assertEquals(aiQuestionsUser.signal?.concession, "implicit");
```

Also assert only the newest completed exchange is sent, no call occurs without a
question-answer pair, invalid answers return no signal, a Jev 500 returns the
valid main reply, and abort does not start or retry signal work.

- [ ] **Step 2: Run signal tests and verify RED**

Run:

```bash
deno test --allow-read --allow-env=OPENROUTER_API_KEY --allow-net=127.0.0.1 supabase/functions/_shared/crossfire-signals.test.ts
```

Expected: FAIL because signal evaluation does not exist.

- [ ] **Step 3: Implement signal evaluation and handler integration**

Build the combined transcript plus validated new reply, derive the answer turn
ID from the sequence, and ask one choice plus concession choice plus one Noul.
Parse confidence and probabilities without generating prose. Catch non-abort
Jev errors after the main reply validates and return the reply without a signal.

- [ ] **Step 4: Write failing client state and UI tests**

Assert strict signal parsing, rejection of unknown/non-answer turn IDs, reducer
attachment, retry replacement, version-1 draft compatibility, restored signals,
visible localized labels, accessible probability explanation, and no labels on
questions.

- [ ] **Step 5: Run client tests and verify RED**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/crossfire/schemas.test.ts src/test/crossfire/reducer.test.ts src/test/crossfire/storage.test.ts src/test/ai/crossfire-client.test.ts src/test/pages/CrossfirePage.test.tsx
```

Expected: FAIL because turns cannot carry signals.

- [ ] **Step 6: Implement signal state and restrained transcript UI**

Add the optional signal schema, pass it through the client, and let the reducer
attach it only to the matching answer turn. Reuse existing Badge and semantic
tokens. Show follow-up opportunity only above `0.70`; include its probability
in accessible text. Keep the turn card's existing motion and layout.

- [ ] **Step 7: Run focused Crossfire suites GREEN**

Run:

```bash
deno test --allow-read --allow-env=DEMO_CODE_PEPPER,EXA_API_KEY,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,SPARRING_INTEGRITY_SECRET,OPENROUTER_API_KEY,WORKSPACE_INVITE_SECRET,WORKSPACE_INVITE_MAILER_URL,WORKSPACE_INVITE_MAILER_TOKEN,WORKSPACE_INVITE_BASE_URL --allow-net=127.0.0.1 supabase/functions/_shared/crossfire-signals.test.ts supabase/functions/_shared/crossfire-response.test.ts supabase/functions/ai/prompt-builder.test.ts supabase/functions/ai/handler-research.test.ts
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/crossfire/schemas.test.ts src/test/crossfire/reducer.test.ts src/test/crossfire/storage.test.ts src/test/ai/crossfire-client.test.ts src/test/pages/CrossfirePage.test.tsx src/test/i18n.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Extend browser coverage**

Update `e2e/crossfire.spec.ts` fixtures to return signals in both modes. Assert
that the answer receives the correct live label, questions do not, retry does
not duplicate labels, and the final transcript retains them.

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npx playwright test e2e/crossfire.spec.ts --project=desktop-chromium --project=mobile-chromium
```

Expected: desktop and mobile Crossfire tests pass.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/crossfire-signals.ts supabase/functions/_shared/crossfire-signals.test.ts supabase/functions/ai/index.ts supabase/functions/ai/handler-research.test.ts src/lib/crossfire/schemas.ts src/lib/crossfire/reducer.ts src/lib/ai/client.ts src/pages/CrossfirePage.tsx src/test/crossfire/schemas.test.ts src/test/crossfire/reducer.test.ts src/test/crossfire/storage.test.ts src/test/ai/crossfire-client.test.ts src/test/pages/CrossfirePage.test.tsx e2e/crossfire.spec.ts src/locales/en.json src/locales/es.json src/locales/hu.json docs/architecture.md
git commit -m "feat(crossfire): add live Jev coaching signals"
```

### Task 5: Live integration proof and release gate

**Files:**
- Create: `scripts/smoke-jev.mjs`
- Modify: `package.json`
- Modify: `docs/testing.md`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: the final shared Jev request contract and existing local environment key.
- Produces: `npm run smoke:jev`, which prints only model, answer labels, latency, and usage counts.

- [ ] **Step 1: Write the smoke script self-check first**

The script accepts an injected fetch in its exported function. Add a Vitest test
that verifies it sends the pinned model, rejects missing keys before network
access, and never includes the key or submitted state in its returned summary.

- [ ] **Step 2: Run the smoke test and verify RED**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- src/test/scripts/smoke-jev.test.ts
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the reusable smoke command and docs**

Use a tiny fixed classification state. Read `OPENROUTER_API_KEY` from the
environment, call the same endpoint and pinned model, print sanitized JSON, and
exit non-zero for malformed or unsuccessful results. Document what the smoke
proves and that it spends a negligible live request.

- [ ] **Step 4: Run the live Jev smoke without exposing the key**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run smoke:jev
```

Expected: sanitized output identifies `typesafe/jev-1.13`, a valid typed answer,
latency, and token counts. If the key is unavailable locally, record the exact
missing-credential blocker and rely on mocked contract tests; do not print or
copy a credential.

- [ ] **Step 5: Run the full local release gate**

Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run verify
git diff origin/main...HEAD --check
git status --short
```

Expected: `npm run verify` passes, diff check is clean, and the only working-tree
changes are the intended final task files before commit.

- [ ] **Step 6: Verify the real UI path**

Use the T3 collaborative preview against the current worktree. Verify desktop
and mobile:

- Model picker selects and retains Auto Fast for Basic; Auto Pro is disabled.
- Sources defaults to Smart and visibly orders case-used evidence first.
- Generate displays used-source judgments and persists them after saving and
  reloading the case.
- Both Crossfire modes show live signals on answers only.
- Browser console has no errors and keyboard controls remain usable.

Expected: all four flows work on the running application, not only in fixtures.

- [ ] **Step 7: Commit**

```bash
git add scripts/smoke-jev.mjs src/test/scripts/smoke-jev.test.ts package.json docs/testing.md supabase/README.md
git commit -m "test(ai): add Jev integration verification"
```

- [ ] **Step 8: Whole-branch review and fix pass**

Build the review package from the merge base and send it to a fresh reviewer.
Re-grade findings by user impact. Fix every Critical or Important finding in one
TDD pass, rerun the affected focused tests and full verification, and commit the
fixes. Record any deferred Minor item in the execution ledger.

- [ ] **Step 9: Push, open, and babysit the pull request**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat: add Jev decisions to DebateLab" --body $'## Summary\n- add server-side Jev decisions through the existing OpenRouter key\n- add Auto Fast and Auto Pro routing\n- rank and retain sources with case-use judgments\n- add live Crossfire coaching signals\n\n## Verification\n- npm run verify\n- npm run smoke:jev\n- desktop and mobile browser checks\n\nMerge is intentionally left to Adam.'
gh pr checks --watch
```

Immediately register the PR with the T3 thread. Wait for current-head CI and a
substantive CodeRabbit review. Fix submitted-code failures and every valid
in-scope finding, push, and repeat until the current head is green and review is
clear. Do not merge or enable auto-merge.
