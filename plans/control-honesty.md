# Control honesty follow-up plan

**Owner:** DebateLab application and Supabase Edge Function maintainers

**Snapshot:** 2026-09-01, `main` at `79b65ca`. Re-verified: PRs #16-#28 did not touch control enforcement.

**Goal:** Keep every visible AI control honest at the edge boundary, including requests that do not come from the browser.

## Preconditions

Work in a new isolated T3 Code worktree with a dedicated feature branch owned by this plan. Before reading for implementation or editing, run `pwd`, `git branch --show-current`, `git status --short --branch`, and `git worktree list --porcelain`. Stop if the current directory is the main checkout, the branch is `main`, the worktree is dirty with another task's changes, or an existing plan worktree is being reused. Keep this plan's branch and PR independent of every other plan.

Use the repository's pinned runtime and package workflow. Verify `node --version` reports `22.x`, `npm --version` succeeds, `test -f package-lock.json` passes, and install with `npm ci`. Do not substitute Node 24, pnpm, yarn, or a different lockfile.

## Verified baseline

The Quality & Truth control matrix and deterministic output enforcement are already merged in `9e467dd` and `3d27bac`. The current tree contains the frontend payload matrix, backend prompt matrix, shared enforcement, and the existing tests. This plan does not reimplement that work.

The current control contract is:

- `src/lib/ai/schemas/*.ts` and the feature forms constrain browser input.
- `supabase/functions/ai/prompt-builder.ts` puts selected controls into prompts.
- `supabase/functions/_shared/control-enforcement.ts` applies deterministic output rules where a post-filter is safe. Brainstorm side remains prompt-level by design; only its selected output shape is filtered.
- `src/lib/ai/streaming.ts` and `supabase/functions/ai-stream/index.ts` support plain Ask streaming, while structured/advanced Ask requests use `ai`.

## Remaining gaps

The edge functions sanitize text but do not reject malformed control values. The non-streaming handler reads enum controls with `String(...)` and booleans with `Boolean(...)`, so a direct caller can submit an unsupported enum or a string such as `"false"` and receive fallback or truthy behavior. The browser Zod schemas do not protect this boundary.

Both streaming gates currently reject only `clarify`. The client helper and `ai-stream` can therefore accept `summarize`, `proscons`, or `argumentmap`, even though the streaming response is a plain Ask response and does not provide those structured contracts. The visible UI does not expose those modes, but the server and client should agree for direct callers and future UI changes.

## Scope and non-goals

- Extend `supabase/functions/_shared/control-enforcement.ts` with one pure validator for the current control allowlists. Accept omitted optional fields so existing defaults remain stable, but reject present values with the wrong type or unsupported enum value before quota reservation, research, or provider calls.
- Apply the validator in both `supabase/functions/ai/index.ts` and `supabase/functions/ai-stream/index.ts`.
- Make streaming eligible only for Ask `general` with all advanced toggles off, and keep the browser helper aligned with that rule.
- Keep audience and tone as prompt-level style guidance. Do not add brittle vocabulary post-processing or change their existing honesty note.
- Do not add new Ask modes, change retrieval policy, change output schemas, or redo the completed Quality & Truth matrix/enforcement work.

## Likely files

- Modify: `supabase/functions/_shared/control-enforcement.ts`
- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai-stream/index.ts`
- Modify: `src/lib/ai/streaming.ts`
- Test: `supabase/functions/_shared/control-enforcement.test.ts`
- Test: `supabase/functions/ai/control-matrix.test.ts`
- Test: `src/test/ai/streaming.test.ts`
- Test: `src/test/ai/control-payload-matrix.test.ts` as a regression gate for the unchanged browser request contract.
- Test: `e2e/authed-pages.spec.ts` with a deterministic function stub for the visible Ask control flow.

## Sequenced changes

### 1. Define and enforce the edge control contract

Extend the existing shared control module with explicit allowlists for the controls already present in the feature input schemas. Validate Generate side/format/role/length/audience/tone, Attack aggressiveness/judge paradigm/toggles, Brainstorm side/output mode, Factoids direction/source type/timeframe/source count where typed, and Ask mode/toggles. Preserve current defaults for omitted optional fields. Return a safe client error for malformed present values.

Call the validator after bounded sanitization and before quota reservation or any Exa/provider work. The streaming route must use the same Ask mode and boolean rules before it checks advanced-mode eligibility. Keep provider/model allowlisting unchanged.

Change `isAskStreamingModeAllowed` and `isAskStreamingSupported` to allow only `general`; advanced toggles remain non-streaming. Use an error message that names the unsupported mode without implying that structured output was produced.

### 2. Add regression coverage

Test every accepted enum and boolean boundary, omitted defaults, invalid enums, wrong-type booleans, and the fact that validation happens without a provider call. Add explicit streaming cases for all supported Ask modes, proving only `general` with all advanced toggles off is eligible. Retain the existing payload and prompt matrix as a full regression gate.

## Verification

Focused checks:

```bash
npx vitest run \
  supabase/functions/_shared/control-enforcement.test.ts \
  supabase/functions/ai/control-matrix.test.ts \
  src/test/ai/streaming.test.ts \
  src/test/ai/control-payload-matrix.test.ts
```

Run the full local gates from the repository contract:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
deno check supabase/functions/ai/index.ts supabase/functions/ai-stream/index.ts
deno test --allow-read --allow-env=EXA_API_KEY --allow-net=127.0.0.1 supabase/functions/
CI=1 PORT=18081 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18081 npm run test:e2e -- --workers=2
```

If a browser test is added, stub the Edge Function and assert the submitted control values plus the rendered behavior. Do not treat a page-render smoke test as proof of edge validation.

## Acceptance

- A direct request with an unsupported enum or non-boolean toggle receives a bounded 4xx response before quota, research, or provider work.
- Omitted optional values still follow the existing documented defaults.
- Client and server streaming gates agree for `general`, `clarify`, `summarize`, `proscons`, and `argumentmap`; only the plain general path streams.
- Existing visible controls still reach the same payload and prompt markers, and deterministic output rules remain unchanged.
- No code claims that prompt-only audience, tone, or Brainstorm side controls are post-processed.

## Rollout, rollback, and authorization

This is a code-only change with no migration. Deploy the Edge Functions before the frontend helper if both are released together, then run an authenticated staging smoke test for one valid and one rejected control request. Production Edge Function deployment and any real provider request require Adam's explicit authorization for that operation. No credentials, quotas, production data, or secrets may be changed as part of local verification.

If the new validation rejects a legitimate existing caller, redeploy the prior `ai`/`ai-stream` revisions and revert the frontend helper commit. The completed Quality & Truth behavior and database state do not need rollback.
