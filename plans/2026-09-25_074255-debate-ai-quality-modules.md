# PR 2: Debate-aware AI and smaller modules

## What Adam wants

Once Current Debate exists, every DebateLab feature should understand the same preparation instead of behaving like a blank tool. The model should receive useful debate context automatically, while the student can see and change what will be sent. The current prompts also need deliberate improvement, and the oversized AI Edge Function needs smaller internal files so future fixes do not require understanding an 88 KB entrypoint.

This PR improves the existing product. It does not restart Workspace or create a new AI platform.

## How debate context follows the user

- Every request receives the Current Debate motion and the requested side or both sides.
- Every request may use that debate's sources, settings, free-form instructions, and saved outputs.
- DebateLab chooses relevant outputs automatically using simple, predictable rules: feature, side, artifact type, pinned state, and recency.
- The server loads and authorizes the real text. The browser sends IDs and preferences, never trusted context text.
- No source, result, instruction, or chat may cross into another debate.

### Visible override inside each feature

Place one compact context control after the feature inputs and directly above the primary submit/start button:

`Using 6 sources, your A favor case, and 2 recent arguments  [Review]`

- Review opens a sheet or popover listing included sources and outputs with checkboxes.
- Users can include or exclude items for that request.
- The default selection returns on the next request unless the user pins an output or changes a source's active state for the debate.
- Show excluded-by-size counts honestly. Never claim the model saw omitted content.
- In one-off mode, the control says that no Current Debate material will be used or saved.
- Keep the compact `Working in: <motion>` strip from PR 1 below the page title.

## Prompt work

- Give Generate, Attack, Brainstorm, Factoids, Ask, Crossfire, and Sparring their own small prompt modules.
- Keep shared language, citation, research, injection, schema, and safety rules in one common module.
- Improve each existing prompt against two representative local examples, one for each side where applicable. Do not invent a prompt CMS or giant evaluation suite.
- Generate should produce speech-ready claims, warrants, evidence use, impacts, and weighing for the requested role.
- Attack should identify the actual target, explain the flaw, and provide a usable response instead of generic criticism.
- Brainstorm should create genuinely different strategic directions.
- Factoids should return cuttable sourced material and label uncertainty.
- Ask should answer the requested mode directly and use only context it received.
- Crossfire should stay concise, track real exchanges, and never invent concessions.
- Sparring should remain in role during the round and give evidence-linked feedback afterward without pretending it heard delivery or confidence.
- Replace the old global custom-prompt path with the Current Debate's structured settings and short free-form instructions.
- Treat all user instructions, sources, outputs, and transcripts as untrusted debate content. They cannot override authorization, schemas, citations, quotas, or safety rules.

## Smaller Edge code without more services

- Keep the deployed `ai` and `ai-stream` endpoints unchanged.
- Leave `supabase/functions/ai/index.ts` as the HTTP entrypoint and dispatcher.
- Move each feature's handler into a focused internal module.
- Keep authentication, entitlements, quotas, research, model routing, costs, request budgets, error mapping, and response headers shared once.
- Move code with behavior preserved before changing its prompt. This makes regressions obvious.
- Do not create seven Edge Functions, new deployment configuration, a vector database, or a prompt-management system.

## Proof

- Focused tests for cross-debate isolation, forged IDs, context overrides, size bounds, and prompt-injection boundaries.
- Existing schema/contract tests stay green for all seven features.
- One bounded local real-provider smoke per feature when credentials exist. Do not run a model matrix.
- Run locally at final head:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run test:edge
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run verify
```

GitHub Actions are currently unreliable. Record local results and distinguish fixture checks from live-provider checks.

## Agent prompt

After PR 1 merges, implement PR 2 from `plans/2026-09-25_074255-debate-ai-quality-modules.md` in a fresh worktree from current `origin/main`.

Adam wants every existing feature to understand the Current Debate without silently dumping everything into the model. Add server-authorized automatic context selection and the visible Review control exactly where the plan specifies. Improve all seven feature prompts using two representative examples each. Split the oversized AI entrypoint and prompt file into focused internal modules, but keep the deployed `ai` and `ai-stream` endpoints stable.

Reuse existing auth, quotas, research, routing, costs, persistence, schemas, and UI patterns. Do not create separate deployed functions, a vector database, a prompt platform, or any Workspace dependency. Run focused local tests while working, then `npm run test:edge` and `npm run verify` once at final head. Run at most one representative live smoke per feature when credentials exist.

Commit, push, and open a PR titled `refactor(ai): add debate-aware context and focused feature handlers`. Include exact local evidence. Do not merge or deploy.
