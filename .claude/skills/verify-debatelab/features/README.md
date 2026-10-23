# DebateLab verification map

This directory is the maintained source for verifying DebateLab's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe. The skill's `SKILL.md` covers launch, doctor, evidence, and cleanup.

## Baseline preconditions

- `bin/verify.sh up` has printed `READY http://127.0.0.1:18081`, and `bin/verify.sh doctor` exits 0.
- The browser client is the `up` instance at `http://127.0.0.1:18081`. Never use the `debatelab` container on `:8080` or a plain `npm run dev`, because both reach production.
- Each scripted test signs in with its own fresh demo-code user (a Pro account with a daily limit of 999) and deletes it afterwards. The fixture marks the onboarding tour as seen, and the user starts with no Current Debate.
- Most tools work inside a Current Debate (see [current-debate](./current-debate.md)). Start one with `startDebate(page, motion)` first, or answer the motion dialog that opens after submit with `chooseForMotion(page, "create" | "once")`. The Library's `Add Source` stays disabled until a debate exists.
- In fake mode, model answers come from the fake provider and contain the marker `FAKE-PROVIDER`. In live mode (`up --live`), every chat call goes to real OpenRouter pinned to `anthropic/claude-haiku-5.5` on the Anthropic BYOK key, research uses real Exa, and answers are real model text.
- The feature files quote fake-mode text such as `FAKE-PROVIDER case thesis`. Recipes never assert it: they read the `ai` response body with `aiResponse()` and check that its fields are on screen, so the same recipe passes in both modes.

## Driving conventions

- Scripted runs go in `recipes/<feature>.spec.ts`, import from `./fixtures`, and run with `bin/verify.sh drive recipes/<feature>`.
- Interactive runs use `bin/verify.sh user` to get a code, then sign in on `/login`.
- Prefer roles and accessible names. The exceptions use `data-testid`: Crossfire's controls, the header's Current Debate control (`debateControl(page)`), the Current Debate strip and dashboard, and the voice controls (`voice-mode`, `voice-mic`).
- Wait for `aiResponse()` or a named element, never a fixed sleep. Use `AI_TIMEOUT` (30 s fake, 240 s live) for anything behind a model call.
- Run both `desktop-chromium` and `mobile-chromium` when the change touches layout.

## Proof and skip reporting

- UI proof is an ARIA snapshot plus a screenshot before and after the action, with `steps.log` naming each action.
- Side-effect proof is `expectProviderCalls([...])` (what the Edge Function sent upstream) plus the rows read back through `admin`. Every test writes `provider-calls.json`; in live mode the fixture fails the test if any chat call was answered by a model other than the pin.
- Record the feature ID and entry point with every artifact.
- Tests that need live mode record an `unverified` annotation in fake mode instead of passing silently. Report those as unverified.
- Never verifiable here: Stripe Checkout and the billing portal, Google sign-in and Google Docs export, staging, production, and the deployed host. Jev decisions are real only in live mode and use Jev's own model, not the pin.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections, in this order:

- `Sub-features`
- `How to get to it (user POV)`
- `Driving it with verify.sh + Playwright`
- `Gotchas`

## Features

- [Demo-code sign-in](./auth-demo-login.md): sign-in, reload, rejected code, sign-out (`e2e/full-stack/auth.spec.ts`); email one-time-code sign-in through Mailpit, the emailed sign-in link through `/auth/callback` (including after a failed resend, and a used link), a signed-out deep link through a wrong code, the resend countdown and back, a second account on the same browser, and the same account after Sign out on Settings landing on `/app` (`recipes/auth.spec.ts`).
- [Case generation](./case-generation.md): generate, web research, save and reopen from History on a fresh device, PDF and DOCX export, single-section regeneration, building a flowchart from the case, provider failure and retry, a reply cut off at its length cap, quota block (`recipes/case-generation.spec.ts`).
- [Library sources](./library-sources.md): add, pause, delete, grounding, and URL import (`recipes/library.spec.ts`).
- [AI tools](./ai-tools.md): Attack, Brainstorm, Factoids, and Ask streamed, cut off at its length cap, cited, with web search, and the student's bubble contrast with the Hungarian layout at 375 px (`recipes/ai-tools.spec.ts`).
- [Live generation](./live-generation.md): every AI tool shows its answer while the model writes it, Cancel mid-stream, and the event stream's shape (`recipes/live-generation.spec.ts`); Crossfire and Sparring requests stream too (`recipes/practice.spec.ts`).
- [Current Debate](./current-debate.md): start, the first-debate offer and the different-motion choice, sources and results scoped to a debate, switching, and the first onboarding step (`recipes/current-debate.spec.ts`); debate context review and pins (`e2e/full-stack/debate-context.spec.ts`).
- [Model defaults](./model-defaults.md): Pro accounts start on Claude Sonnet 5.5 with Opus 5.5 as an opt-in, Basic accounts on Claude Haiku 5.5 with Pro models locked, retired model IDs move to their successor, and an Auto choice fits the picker at 375 px (`recipes/model-defaults.spec.ts`).
- [Practice](./practice.md): the Sparring setup's whole-round cost and Start's pending state, a full Lincoln-Douglas sparring round with verdict (and its Hungarian chart labels), and Crossfire in both directions with debrief, each filed in its debate (`recipes/practice.spec.ts`).
- [Voice rounds](./voice-rounds.md): spoken Sparring and Crossfire on the browser voice, with no ElevenLabs key (`recipes/voice-rounds.spec.ts`).
- [Workspace autosave](./workspace-autosave.md): a slow Crossfire or Sparring save from a Workspace never overwrites newer text (`recipes/workspace-autosave.spec.ts`). Needs `up --collab`; skips without it.
- [Account data](./account-data.md): Download my data and Delete account, each proven against a bystander (`recipes/account-data.spec.ts`); Delete All My Data scoped against a bystander (`e2e/full-stack/account-data.spec.ts`).
- Account: output language reaching the model from a new device, flowchart node delete (at once, with an `Undo` toast; no confirm dialog), save and load, and the speech timer (`R` resets only while paused) (`recipes/account.spec.ts`).
- [Usage limits](./usage-limits.md): Opus refused when its weight does not fit today while Haiku still runs, and the weekly AI budget dialog (`recipes/usage-limits.spec.ts`).
- Billing: expired account blocked, promo code restores access (`recipes/billing.spec.ts`); each billing state (trial, extended access, active Pro, Pro set to cancel, promo Pro without Stripe, payment failed, subscription ended) shown the same way by Settings, the pricing dialog (its one plan button and Current badge) and a refused AI request, in English and Hungarian, light and dark, at 360 and 375 px (mobile project) and 768 and 1280 px (desktop project); the usage line on every tool page matching Settings and updating after a run; the trial banner; and `/app/billing` landing on the Settings subscription card (`recipes/billing-states.spec.ts`). The pricing dialog's Manage path stubs `create-portal` with its own no-subscription answer, since the portal needs Stripe; signed, forged, and replayed Stripe webhooks, including a failed renewal that keeps Pro (`e2e/full-stack/billing.spec.ts`).
- [Localization](./localization.md): tab titles per route and language, translated form validation and server refusals, the language switcher on sign-in and 404, and `?lang=` with the `/es` and `/hu` home pages (`recipes/localization.spec.ts`).
- Admin announcements and the non-admin block (`e2e/full-stack/admin.spec.ts`), public share links (`e2e/full-stack/public.spec.ts`), and Workspaces with live collaboration and invites (`e2e/workspace-collaboration.spec.ts`).

Not yet mapped in recipes: theme, the public landing and SEO pages beyond their titles, the free no-login tools under `/tools` and `/embed/debate-timer` (no backend; `e2e/free-tools.spec.ts` covers them), and share-link creation (the app has no client caller for the `share` function). The agentic suite covers UI language switching (`agentic/workspace.e2e.ts`) and renders the public pages in every language (`agentic/pages.e2e.ts`).
