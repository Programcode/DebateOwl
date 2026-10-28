# Testing and verification

**Status:** Current. Test selection is owned by [`vitest.config.ts`](../vitest.config.ts), [`playwright.config.ts`](../playwright.config.ts), and the npm scripts in [`package.json`](../package.json).

## Verification rule

Run the smallest reproduction first. Expand only when the changed behavior or a failure justifies it. A command passing proves the current local commit only.

Do not describe a stub session as authenticated backend proof. Do not describe a skipped staging job as passing.

## Documentation

```bash
npm run docs:check
```

This checks maintained Markdown for supported local-link failures and actionable retired checkout paths. It does not validate remote URLs, Markdown syntax, factual freshness, or heading anchors.

Focused checker test:

```bash
npx vitest run src/test/docs/check-docs.test.ts
```

## Lint and types

```bash
npm run lint
npm run typecheck
```

Lint runs ESLint, then `npm run lint:repo`:

- ESLint is type-aware for `src/` (outside `src/test/`) and rejects promises nobody awaits or catches. `void` marks a promise that cannot reject or handles its own errors. In browser tests it rejects `waitForTimeout`; a deliberate observation window keeps a `no-restricted-properties` disable comment with its reason.
- [knip](../knip.json) fails on unused files and on dependencies that are unused or missing from `package.json`.
- [`scripts/check-repo-rules.mjs`](../scripts/check-repo-rules.mjs) requires a top-level `permissions:` block, SHA-pinned actions, and `persist-credentials: false` on checkout in every workflow. A positive `has_*_privilege` check must name one privilege, as a quoted word or a per-row column, since a list means "any of"; write negative checks as `NOT has_*_privilege(...)`. It runs [squawk](https://squawkhq.com) on migrations newer than its baseline; silence a deliberate lock with `-- squawk-ignore <rule>` and a reason.

Type checking uses `tsconfig.app.json` for the client and `tsconfig.agentic.json` for `e2e.config.ts` and `agentic/` (the e2e runner itself does not type-check), and emits no files. Neither command replaces runtime tests.

## Unit and component tests

```bash
npm test
```

Vitest runs tests selected by [`vitest.config.ts`](../vitest.config.ts). The suite is deliberately small: it keeps only logic that browser tests cannot reach cheaply, such as security boundaries, Current Debate isolation, project selection, stream parsing, source import, and the Crossfire and Sparring rules. There is no coverage gate. Add a unit test for a pure function with real branching or a bug that has a clear repro; prove page behavior with Playwright instead.

Run one test file while iterating:

```bash
npx vitest run src/test/security/url-validation.test.ts
```

For a bug, watch the reproduction fail for the expected reason before implementing the fix.

Which behavior deserves a test, and which tests not to write, is in [AGENTS.md](../AGENTS.md#what-to-test). The short version: test specs where a regression is costly or invisible (auth, RLS, billing, quotas, migrations, concurrency, parsers, regressions of fixed bugs), and prove everything else by using the app.

## Collaboration service tests

```bash
npm run test:collaboration
```

This runs the Node collaboration service with real Hocuspocus providers and Yjs documents. It covers durable acknowledgement ordering, reconnect sync, duplicate delivery, schema and size rejection, PostgreSQL adapter behavior, proposal decision rollback, writer serialization, stale epochs, and process-kill recovery. It does not prove a deployed service.

## Edge Function tests

```bash
npm run test:edge
```

This uses Deno directly for `supabase/functions/`, including tests that import deployed handler boundaries and remote Deno modules. The npm script declares the allowed filesystem, environment, and loopback-network permissions.

A browser-oriented Vitest pass does not replace native Deno tests. The stream accounting handler tests use synthetic OpenRouter responses and inspect audit inserts for complete, interrupted, and truncated streams. The permission list includes the OpenRouter key name because the handler reads it, but these tests require no real provider credentials.

Current Debate context has focused Deno tests: `_shared/debate-context.test.ts` covers selection rules, the IDs-only request parser, digest budgets, per-feature policy, and loader isolation against real PostgREST query shapes; `ai/debate-context.test.ts` drives the `ai` and `ai-stream` handlers with forged debates, cross-debate IDs, a retired custom prompt, and stored text that tries to close its block.

Voice has its own Deno tests. `voice/index_test.ts` drives the `voice` handler against a fake ElevenLabs: a signed segment becomes audio and one costed usage row; a missing key, an invalid or expired token, edited text, another user's token, a reached cap, an expired or banned account, and a provider failure each return their code without reaching paid work they should not; every provider call keeps its clip however it ends, and an oversized body is refused without being read. `ai/voice.test.ts` drives the `ai` handler and checks that tags reach only the voice payload, that typed requests and the typed prompt are unchanged, and that measured delivery facts reach the judge and the saved round. `_shared/voice-tags.test.ts`, `_shared/voice-token.test.ts`, and `_shared/cost.test.ts` cover tag stripping and rationing, token binding, and character pricing. The permission list includes `ELEVENLABS_API_KEY` because the handler reads it; no real key is used.

`_shared/prompts/prompt-examples.test.ts` checks the two representative examples per feature in [`supabase/functions/_shared/prompts/prompt-examples.ts`](../supabase/functions/_shared/prompts/prompt-examples.ts) against each feature's quality rules and the fake provider's routing lines.

### Prompt example comparison

```bash
OPENROUTER_API_KEY=... deno run --allow-read --allow-write --allow-env=OPENROUTER_API_KEY \
  --allow-net=openrouter.ai scripts/prompt-examples.ts supabase/functions /tmp/after.json
```

This sends the fourteen prompt examples to one real model (GPT-6 Luna by default) and writes the raw outputs for manual review. Point the first argument at a directory holding an older `_shared/prompts.ts` and `ai/prompt-builder.ts` to compare revisions. It runs no web research and is a bounded manual check, not a model matrix or an automated quality gate.

### Live Jev contract smoke

```bash
OPENROUTER_API_KEY=... npm run smoke:jev
```

This sends one tiny typed choice to OpenRouter's Decisions endpoint using the pinned `typesafe/jev-1.13` model. It prints only the returned model, answer labels, latency, and token counts; it never prints the key or submitted state. The command makes a negligible billable live request and is separate from the credential-free `verify` gate.

## Production build

```bash
npm run build
```

This proves the Vite production bundle compiles, prerenders the public pages, checks the built site's links, fragments, JSON-LD and basic accessibility (including heading order) with `scripts/check-site.mjs`, checks that every sitemap page has at least 3 inbound links and the home page links to at least 15 with `scripts/check-links.mjs`, and then walks the emitted Vite manifest to reject feature-only PDF, DOCX, chart, ReactFlow, export, and Admin modules, the Spanish and Hungarian catalogs, and the signed-in layout from the static `index.html` dependency graph. It does not prove authentication, database behavior, provider access, or production deployment.

## Production service-worker smoke

```bash
npm run test:sw
```

Run this after `npm run build`. It serves `dist/` through Vite preview (which applies the `vercel.json` rewrites, so app routes get `app-shell.html` as in production) and proves that a v2 worker cache upgrades to this build's caches and claims the page; that after one visit to `/app`, Home, Library, History, Settings and Timer open offline as fresh navigations, the timer runs, the offline indicator shows, and switching to Spanish works; that a visited public page answers offline only with itself and an unvisited one gets the offline page; that an unvisited route shows recovery UI and an intent-prefetched one opens; and that private API paths and `/auth/callback` do not enter Cache Storage. It uses a stub session and blocks external requests, so it is not authenticated backend or deployed-host proof.

## Credential-free browser gate

```bash
P=$(bash .superset/e2e-port.sh) && CI=1 PORT=$P PLAYWRIGHT_BASE_URL=http://127.0.0.1:$P npm run test:e2e
```

Pull requests run only tests tagged `@smoke` on desktop Chromium (`npm run test:e2e:smoke`, about 30 tests). Tag a test `@smoke` only when it covers a whole user path that would otherwise go unchecked until the nightly run.

`.superset/e2e-port.sh` gives each worktree its own port from `18100-18179`, recorded in `~/.superset/debatelab-ports/allocations.json`, so two worktrees can run the gate at once. Without `PORT`, Playwright falls back to `18080`. Playwright starts a new Vite server on that port and runs:

- desktop Chromium at 1280 by 800
- mobile Chromium using the Pixel 5 device profile

The server is never reused. CI uses retries and two workers. On failure, traces, screenshots, videos, and the HTML report stay in ignored `test-results/` and `playwright-report/` directories. CI may upload those credential-free artifacts for diagnosis.

Playwright starts that server with `VITE_E2E=1`. The client then keeps the environment switcher, but the production fallback is `http://e2e.invalid` instead of the production Supabase project, and a request that still names that project is refused in the browser. `playwright.config.ts` also refuses to start when `VITE_SUPABASE_ENV` or `SUPABASE_URL` already points at production. `E2E_ALLOW_PROD=1` is the explicit override. The production canary uses `playwright.production.config.ts` and does not set `VITE_E2E`. Plain `npm run dev` is unchanged and still defaults to production.

The one-time DebateOwl welcome stays closed whenever `VITE_E2E` or `VITE_LOCAL_PREVIEW` is set, so Playwright, the verify stack and agentic tests never meet it; `?intro=show` opens it anyway and `?intro=skip` keeps it closed in any build. Closing it continues into the tour's Start debate step when that account has not finished the tour. If that chunk fails twice, the app logs once, remembers the welcome, and continues without the tour. The production canary and the service worker offline test (`npm run test:sw`), which drive production builds, seed `debateowl_intro_seen_v1` instead.

`e2e/hungarian-parity.spec.ts` is the focused Hungarian browser contract. On desktop and mobile Chromium it checks persisted `<html lang="hu">`, public and authenticated page chrome, route titles, onboarding, saved-chat empty state, Library controls, Timer semantics, localized close labels, and runtime errors. It deliberately does not reject arbitrary English text because source titles, user content, model names, and citations may legitimately remain in their source language.

`e2e/first-run.spec.ts` drives the same first run against stubbed Supabase routes in English and Hungarian, so it proves the client flow only.

`e2e/free-tools.spec.ts` (tag `@smoke`) opens every `/tools` page signed out and checks its heading, canonical URL and JSON-LD, and that it makes no Supabase request. On a paused Playwright clock it runs the timer past the BP protected minute, through a reload, and runs the two Public Forum prep banks; it also draws a motion set and reloads its permalink, times a pasted speech, lays out a BP flow sheet under print media, and checks that `/embed/debate-timer` is `noindex` and requests nothing from another origin. The format data, timer transitions, custom-format links, motion filters and speech-time arithmetic have unit tests in `src/test/free-tools/`. The dev server cannot prove the response headers: `src/test/vercel-deployment-config.test.ts` checks which paths may be framed.

`src/test/i18n-keys.test.ts` fails when a literal `t()` key in `src/` is missing from `en.json`, or when a call that passes `count` lacks its `_one` and `_other` forms. Dynamic keys such as ``t(`nav.${key}`)`` are out of its reach. `src/test/i18n.test.ts` requires the same keys in all three catalogs. Together they prove every literal key has a Spanish and Hungarian entry, not that the translation is natural.

The speech unit test proves that Hungarian selects `recognition.lang = 'hu-HU'`. Credential-free browser automation has no real microphone or speech service, so it does not prove recognition accuracy or hardware support.

Voice rounds are tested without a microphone, a speech service, or an ElevenLabs key. `src/test/voice/` covers the capture hook against a scripted recogniser (interim words, restart on silence, last words after stop, pause timing, refused microphone), the delivery measurements in all three languages, and the opponent voice player against a scripted Web Audio and `speechSynthesis` (segment order, every fallback path, stop, and blocked autoplay). `src/test/pages/SparringVoice.test.tsx` and `CrossfireVoice.test.tsx` drive both pages through a spoken turn. `e2e/voice-rounds.spec.ts` does the same in Chromium with the scripted recogniser and `speechSynthesis` from `e2e/helpers/voice.ts`, once with the `voice` route returning audio and once with it returning `voice_unavailable`, and asserts that no audio tag reaches the page or storage. None of this proves how ElevenLabs sounds, that a real browser recogniser hears a student, or that the live `voice` function is deployed with a key.

AI client and Edge tests prove that every request path carries a validated language and that prompts require Hungarian output. Provider responses are mocked; only an authorized protected-staging run can prove that a live provider follows the instruction across every prose field.

## Full credential-free gate

```bash
npm run verify
```

The gate runs, in order:

1. documentation checks
2. lint
3. type checking
4. unit tests
5. collaboration service tests
6. native Edge Function tests
7. production build
8. production service-worker offline smoke
9. the desktop Chromium `@smoke` set (`npm run verify:full` adds the full desktop and mobile suite)

It does not start local Supabase, run pgTAP, run WebKit, or use protected staging.

## Database and RLS gate

Requirements:

- Docker
- Supabase CLI 2.121.0, pinned in `package.json` (`npm ci` installs it)
- exclusive ownership of the local Supabase ports and containers

In Superset, run:

```bash
./.superset/db-gate.sh
```

The wrapper acquires `~/.superset/debatelab-db.lock`, starts full local Supabase, runs `npm run test:db`, then holds the same lock while a controlled Mailpit relay, collaboration process, fake model provider, and Vite client run the real-Auth desktop/mobile workspace and full-stack feature journeys. The `Database` workflow runs this same gate on pull requests that touch its paths, and retains its logs and browser traces on failure. It stops every owned process and the stack on exit, including after failure. To run only the database portion under the same lock, use `./.superset/db-gate.sh --db-only`. Outside Superset, run it with:

```bash
npx supabase db start
npm run test:db
npx supabase stop --no-backup
```

The stack replays migrations and runs pgTAP tests. The browser portion creates isolated local users and deletes them, captures mail only in local Mailpit, restarts the collaboration process, and proves recovery and revocation. `CREATE INDEX CONCURRENTLY` requires the stated CLI floor so it runs outside the migration batch.

### Full-stack feature journeys

The same gate serves every Edge Function and runs `e2e/full-stack/` on desktop and mobile Chromium. Only the paid model provider is replaced: [`e2e/full-stack/fake-openrouter.mjs`](../e2e/full-stack/fake-openrouter.mjs) runs as a `node:22-alpine` container on the Supabase Docker network, and the functions reach it through `OPENROUTER_API_URL`. It also answers the Stripe customer search that account deletion runs, which the `account` function reaches through `STRIPE_API_URL`. Real code handles everything else: Auth, demo-code sign-in, RLS, quota, source loading, prompt building, output validation, streaming, and persistence.

Each test signs in through the Login page with a fresh demo code and deletes that user afterwards. The specs cover:

- sign-in, reload, sign-out, a rejected code, and an expired token that refreshes before an AI request;
- case generation grounded in a 250 KB Library source, provider failure with retry, a zero quota, and a saved case that a fresh browser loads from History;
- Attack, Brainstorm, Factoids, streamed Ask (it fails if the client falls back to the non-streaming path), and Ask with citations;
- a fresh account's first run in English and Hungarian: the tour starts the first debate, the language picked before sign-up survives the first sign-in, and a tool offers a debate from the typed motion when none is current;
- Current Debate context: every request carries the debate's motion, instructions, and sources; Review drops a source and pins a saved case for exactly one request; the pin is stored; Crossfire leaves instructions out; and one-off work sends nothing;
- a judged Lincoln-Douglas sparring round and a Crossfire debrief after a Jev signal attaches to an answer;
- spoken Sparring and Crossfire rounds against the real `ai` and `voice` functions with no ElevenLabs key: the opponent prompt carries the voice rules, the reply comes back clean with signed segments, `voice` answers `voice_unavailable`, the browser voice reads the clean text, the judge gets the measured facts, and the saved round holds no audio tag (the recogniser and the browser voice are scripted);
- Library activation and deletion, output-language sync across devices, flowchart saves, and Delete all my data (it must leave another account's rows intact);
- Download my data (only the caller's rows, even when the request names another user) and Delete account (no row in any `public` or `private` table mentions the user afterwards, another account is untouched, and a call without a session or with another user's confirmation deletes nothing);
- a promo code redeemed in Settings that restores AI access, and signed Stripe webhooks that grant and revoke Pro while a forged or replayed one changes nothing;
- admin announcements seen by another user, denied admin access, and a public share link.

Tests assert the rendered result, what the Edge Function sent upstream (read back from the fake provider), and the resulting database rows. They also fail on any uncaught page error or horizontal page overflow. The fake provider rejects prompts it does not recognize, so a prompt change must update it.

These journeys do not prove live provider behavior, web research (the local stack has no search key), real Jev judgement (the fake answers every Jev question with a fixed confident choice), Stripe Checkout, the billing portal, and subscription cancellation during account deletion (they call the Stripe API; the local key is a placeholder, and the Deno tests cover the cancellation logic), the `checkout.session.completed` and `invoice.payment_succeeded` webhooks (they fetch the subscription from Stripe), or Google export.

### Interactive verification stack

To check one feature by hand, or keep evidence for a change, use the same stack as a long-lived instance through [`.claude/skills/verify-debatelab/`](../.claude/skills/verify-debatelab/SKILL.md). `bin/verify.sh up` starts it, and `doctor` proves the client resolved to the local project. `drive <all|recipes/<name>|e2e/<path>>` runs Playwright recipes or maintained specs and keeps screenshots, ARIA snapshots, provider calls and database rows in `.verify/artifacts/`. `down` stops everything. It holds the same `~/.superset/debatelab-db.lock` as the gate, so the gate waits while it is up. By default it uses the fake provider and proves the same things as the full-stack journeys. `up --live` turns the fake provider into a capped recording proxy to real OpenRouter that pins every chat call to `meta/muse-spark-1.3-contributor`, and gives Edge Functions a real Exa key; it reads keys from `~/.config/debatelab/live-verify.env`, costs money, and needs Adam's approval. Neither mode proves Stripe Checkout, Google export, staging, or production.

### Live provider journeys

```bash
LIVE_PROVIDERS=1 LIVE_OPENROUTER_API_KEY=... LIVE_EXA_API_KEY=... ./.superset/db-gate.sh
```

Live mode uses the same locked stack but skips pgTAP and the fake-provider specs. It runs `e2e/live/` on desktop Chromium against real OpenRouter, Jev, and Exa. Imported web pages are fetched live too. The fake provider becomes a recording proxy. It forwards every chat call to OpenRouter with the model pinned to `LIVE_MODEL` (default `anthropic/claude-haiku-5.5`; CI reads the `LIVE_MODEL` repository variable, which is unset), passes Jev decisions through unchanged, and refuses calls past `MAX_UPSTREAM_CALLS` (200). Every rewritten call leaves pinned to the Anthropic provider with `allow_fallbacks: false`, so it bills DebateLab's Anthropic key (BYOK in OpenRouter) and never OpenRouter credits. The gate, `verify.sh`, and the proxy refuse a `LIVE_MODEL` outside `anthropic/`, except `as-requested` for the model matrix. The default is also the Basic catalog default, so a live run that selects it cannot be told apart from the pin by the upstream model alone; recipes check the requested model instead. Anthropic is its only provider, so an outage or an exhausted key fails the gate instead of failing over.

The specs cover web-researched case generation, verified Factoids citations, Ask with web search, URL import, streamed Ask, Attack, Brainstorm, a judged sparring round, and Crossfire with live Jev signals. Outputs vary, so tests assert structure rather than text:

- the Edge Function response is 200 and has the expected shape;
- research returned `http(s)` sources and the UI rendered them;
- database rows were written;
- every provider call returned 200 and used the pinned model.

A live failure means the pipeline broke with this model. It does not prove how production models behave, because each model has its own latency and JSON quality.

`.github/workflows/live-e2e.yml` runs this nightly at 03:17 UTC, on demand, and on pull requests that change `supabase/functions/`, `src/lib/ai/`, `e2e/live/`, the fake provider, or the gate, using the `LIVE_OPENROUTER_API_KEY` and `LIVE_EXA_API_KEY` repository secrets. The gate exits before starting anything when either key is missing, so a misconfigured job fails instead of skipping.

### Model matrix

```bash
LIVE_PROVIDERS=1 LIVE_MODEL=as-requested LIVE_OPENROUTER_API_KEY=... LIVE_EXA_API_KEY=... ./.superset/db-gate.sh
```

`LIVE_MODEL=as-requested` switches the gate to `e2e/model-matrix/`. The proxy forwards whatever model the Edge Function chose, and the spec picks each model in `MODEL_CATALOG` from the Generate page's model menu and generates one researched case. A model that exhausts the `ai` function's shared 130-second request budget or returns invalid JSON fails its test. Each test prints the provider latency (`latency <model>: <ms>`) so the run log shows how close each model gets to the budget.

`.github/workflows/model-matrix.yml` runs this on Mondays at 04:29 UTC, on demand, and on pull requests that change `supabase/functions/_shared/`, `supabase/functions/ai/`, or `src/lib/ai/`. It is not a required check, because it runs only on those paths. One run costs about $1 in model and search usage.

## Agentic browser tests

```bash
H=.claude/skills/verify-debatelab/bin/verify.sh
$H up
$H e2e run                                                  # the suite on both viewports
$H e2e run --target desktop --tag journey                   # the tool journeys on one viewport
$H e2e run agentic/pages.e2e.ts --grep '\[hu\]'            # the page sweep in one language
$H e2e explore "Practise a Sparring round and report anything broken" --session student --agent first-timer
$H down
```

[`agentic/`](../agentic/) holds tests for [e2e](https://e2e.tester.army/docs), TesterArmy's agentic test runner (`e2e@0.17.0` with `@e2e-dev/web@0.12.0`, configured in [`e2e.config.ts`](../e2e.config.ts)). In each test, an AI agent works toward a goal in plain language (`agent.act`) and judges what is on screen (`agent.assert`). Locators and database reads then pin the result exactly. The suite covers what the Playwright layers cannot:

- Journeys (tag `journey`), one goal per tool, that survive copy and layout changes: the onboarding tour starting a first debate, Generate and reopening the case from History, Attack, Brainstorm filed in a new debate, Factoids, Ask, a full Sparring round to its verdict, Crossfire to its debrief, adding and pausing a Library source, saving a Flowchart, the speech Timer, and switching interface and AI output language in Settings. Each is pinned by a locator, the rows the app wrote (`ai_requests`, `brainstorms`, `cases`, `sparring_sessions`, `crossfires`, `sources`, `flowcharts`, `user_settings`), and in fake mode the provider's `FAKE-PROVIDER` marker on screen.
- The page sweep (`pages.e2e.ts`, tag `pages`): the 14 student pages and 5 public pages, in English, Spanish and Hungarian, on both viewports. It skips `/app/admin`, which needs an admin, and `/share/:code`, because no client code creates a share link yet. Selectors check `lang`, a heading, and that no `undefined`, `NaN` or `[object Object]` leaked into the page. The judge checks for error notices, raw translation keys, untranslated interface text (which `e2e/hungarian-parity.spec.ts` deliberately cannot reject), and clipped or overlapping text.
- Hidden failures. [`agentic/support/capture-errors.js`](../agentic/support/capture-errors.js) runs before the app in every document and records uncaught errors, rejected promises, `console.error` (which includes React's warnings and the route error boundary), and 5xx answers from Supabase. Every test fails on any of them, on a request to a hosted Supabase project, on a page wider than its viewport, and on visible text that runs past the screen edge (which an `overflow-x: hidden` wrapper would otherwise hide). Text clipped away, cut short by an ellipsis, or inside a sideways scroller does not count; [`agentic/edge-guard.e2e.ts`](../agentic/edge-guard.e2e.ts) pins those rules on injected layouts.
- In live mode (`up --live`), whether model output is on topic: the generated case argues the motion, and factoids carry sources. Recipes never assert model wording.
- Exploration. `e2e explore` sends a persona through the app with a goal and reports findings with expected and observed behavior, reproduction steps, and screenshots. The personas are the named agents in `e2e.config.ts`: `first-timer`, `coach`, `edge-input`, and `hungarian`.

How it runs:

- Always through `verify.sh e2e <run|explore|list|cache>`. The wrapper runs `doctor`, loads the stack environment, turns e2e telemetry off, and takes the testing agent's key from `OPENROUTER_API_KEY`, `LIVE_OPENROUTER_API_KEY`, or `~/.config/debatelab/live-verify.env`. It writes the report (`summary.md`, `report.json`), screenshots, traces, and failure videos to `.verify/artifacts/<run>-e2e-<command>-<pid>/`. The config refuses a non-loopback URL and never starts a dev server, because a plain `npm run dev` reaches production.
- Each signed-in test signs in a fresh demo-code user through the Login page and deletes it afterwards. Public-page tests use the `visitorTest` fixture with the same checks.
- There are two targets, `desktop` (1280 by 800) and `mobile` (393 by 851). e2e does not emulate touch. The app lays out by viewport width and never reads the user agent, so the viewport is what matters; the Playwright Pixel 5 project still owns touch behavior.
- The testing agent has two models on OpenRouter, separate from the app's provider mode, and a fake-mode stack still needs both. The actor (`agent.act` and explorations) and the judge (`agent.assert`, `waitFor`, `extract`) are `anthropic/claude-haiku-5.5` and `anthropic/claude-sonnet-5.5`, both pinned to the Anthropic provider with `allow_fallbacks: false`, so they bill DebateLab's Anthropic key (BYOK in OpenRouter) rather than OpenRouter credits. Recorded flows replay without the actor, so it runs only on a cache miss and in explorations; the model is not part of the replay key. The judge answers every judgment on every run: a full run of both viewports makes about 250 judgments. It is Sonnet because a Haiku judge failed about one in eight page checks on screens Sonnet passes, mostly by reading content below the fold as cut off. It takes about 45 minutes on one machine with three workers, which is why CI splits it into four jobs. `E2E_AGENT_MODEL` and `E2E_JUDGE_MODEL` override the two, but `e2e.config.ts` refuses anything outside `anthropic/` (`src/test/ai/anthropic-only-guard.test.ts` checks it). Use made-up debate content only. An OpenRouter error naming Anthropic (an outage, or the key out of credit) is infrastructure: rerun with `--last-failed`. The agent's context explains that fake AI answers are canned free-transport text.
- Replay. When a later check passes, an `agent.act` flow is recorded in [`agentic/replay/`](../agentic/replay/). Later runs replay it with no model call and verify that its effect happened, until the app changes and the agent takes over and records again. The model is not part of the cache key, so a flow recorded with one actor replays under another. A step that ends on a passing toast or other transient state can hand off to the agent on replay (`end-mismatch` in the report); that costs a model call, not a failure. Commit new and changed entries with the test that made them. Local runs read and write the cache; CI only reads it. Changing an instruction, its params, the test or target name, the agent's `context`, or e2e's minor version re-records.
- Without a model key or the stack environment, agent tests skip, so a bare `npx e2e run` proves nothing. `failOnSkippedFailure` fails a run in which a test skipped after a failure.

To write a test, import `test`, `expect`, and the fixtures from [`agentic/support/fixtures.ts`](../agentic/support/fixtures.ts) and pass the `agentic` options with a `journey` or `pages` tag. Follow every `agent.act` with a locator assertion, because only verified flows are recorded, and pin side effects with a database read through `admin`. Prefer `agent.assert` for what a selector cannot express, and an exact `expect` for everything else. A new user-facing tool gets a journey, and a new route joins `APP_PAGES` or `PUBLIC_PAGES` in `pages.e2e.ts`. When the judge flags vocabulary the app uses on purpose, add it to `context` in `e2e.config.ts` rather than weakening the assertion. The [`e2e` skill](../.claude/skills/e2e/SKILL.md), `npx e2e guide <topic>`, and `node_modules/e2e/docs` cover the API for the installed version.

A bug bash runs several explorations in parallel, one charter per area and persona, then proves each finding with a repro test. Ask an agent to "bug bash <area>"; the `e2e` skill's `bug-bash` topic has the procedure. A finding counts only when its repro test fails for the reported reason. Tag repro tests `{ tags: ["repro"] }` so the scheduled suite skips them until the fix lands, then remove the tag so they become regression tests. The client runs on a Vite dev server, so a route that is still compiling can look like a dead link to an explorer. Reproduce before you believe it.

[`.github/workflows/agentic-e2e.yml`](../.github/workflows/agentic-e2e.yml) runs the suite nightly at 03:47 UTC and on pull requests that change the app (`src/`, `public/`, Edge Functions, migrations, dependencies) or the suite, in four jobs: the page sweep and everything else, on each viewport. Every Sunday at 05:13 UTC it runs a bug bash instead: one exploration per persona, each with its own charter. On demand with a goal, it runs one exploration with the chosen persona and viewport. It uses the `LIVE_OPENROUTER_API_KEY` secret (the `E2E_AGENT_MODEL` and `E2E_JUDGE_MODEL` repository variables override the models), fails when the key is missing, and writes the report to the job summary. Explorations never fail the workflow: their findings are leads to reproduce. The suite is not a required check: model judgments can flake, and a red nightly is a finding to triage.

e2e is pre-1.0 and its minor releases have broken APIs, so it is pinned exactly. Read its changelog before upgrading, refresh the vendored skill as its header says, and expect the replay cache to re-record after a minor bump.

## Production canary

```bash
PROD_SUPABASE_ANON_KEY=... PROD_CANARY_EMAIL=... PROD_CANARY_PASSWORD=... \
npx playwright test --config=playwright.production.config.ts
```

`e2e/production/canary.spec.ts` checks `https://debateowl.com` directly:

- the site loads and signed-out app routes redirect to Login;
- every browser-facing Edge Function answers a preflight that allows the site origin (`workspace-invites` is excluded until production enables Workspaces);
- `ai` returns 401, not a 5xx, to an unauthenticated call;
- the canary account signs in, opens Generate, and Settings shows its Pro plan (a row-level-security read), without spending an AI request;
- the dedicated canary account gets a streamed Claude Haiku 5.5 answer from `ai-stream`;
- the canary account generates a three-contention case with Claude Haiku 5.5 through `ai`.

The last two checks are the only production writes, and they touch only the canary account: its `ai_requests` usage rows and whatever the Generate page saves for it. The dedicated canary account has Pro promo access capped at 10 requests a day. Captures are disabled because they could retain its session.

`.github/workflows/prod-canary.yml` runs after every successful Vercel production deployment of the `debate-navigator` project (GitHub environment `Production – debate-navigator`; the `debatelab-staging` project's production deployments do not start it), daily at 06:41 UTC, and on demand. Main can deploy more than 10 times a day, so deployment runs set `CANARY_AI_REQUESTS=false` and skip the two AI checks. The signed-in session check still runs on every deployment. Only the daily and manual runs make real AI requests: two per run, plus at most two retries. It reads the password and email from secrets and the public anon key from the `PROD_SUPABASE_ANON_KEY` repository variable.

The local stack begins at port `54321` and is not parallel-safe across worktrees. The task that starts it must stop it before finishing or abandoning the run. Use `supabase stop --no-backup` unless another active task explicitly owns the same stack.

Never substitute a staging or production project for this gate.

## WebKit release smoke

Install the browser when needed:

```bash
npx playwright install --with-deps webkit
```

Run:

```bash
P=$(bash .superset/e2e-port.sh) && CI=1 PORT=$P PLAYWRIGHT_BASE_URL=http://127.0.0.1:$P npm run test:e2e:webkit
```

This is the Safari-engine smoke gate. State explicitly when it did not run.

## Protected staging

To get into staging by hand, or to see what is seeded there, read [staging.md](staging.md). The suite tests whatever backend staging runs, and in CI it waits for the `staging-sync` status on its commit first.

Staging requires all three protected values:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_DEMO_CODE`

Partial configuration fails during Playwright config loading.

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
STAGING_SUPABASE_URL=<staging-url> \
STAGING_SUPABASE_ANON_KEY=<staging-anon-key> \
STAGING_DEMO_CODE=<dedicated-test-code> \
npm run test:e2e:staging
```

The suite:

- rejects the production project;
- verifies that the anon key belongs to the supplied staging URL;
- authenticates through `demo-code-login`;
- proves session reload;
- removes debates an interrupted earlier run left behind (only motions starting `E2E staging debate `);
- starts one uniquely named debate from Library, because sources belong to a Current Debate;
- writes one uniquely named source, then reads it back after clearing local state;
- makes one bounded AI request in Ask;
- deletes the source through the UI and the debate through the REST API with the test user's own session (the app cannot delete the Current Debate), which also removes the chat Ask saved to it.

Use port `18080`: the staging Edge Functions answer browser requests only from allowlisted origins (see the [staging contract](operations.md#staging-contract)). The CI demo code exists only in the GitHub `staging` environment, so a local run needs its own bounded staging code.

Temporary auth state lives under `test-results/.auth/`. The staging projects disable traces, screenshots, and video because browser captures can retain authenticated data. Actions time out after 30 seconds, well inside the 180-second test timeout, so cleanup still runs after a failure. Each failure logs the step name and the URL path, never the query or hash. Playwright still writes an ARIA snapshot to `test-results/**/error-context.md` on failure; the workflow does not upload it, and it can contain staging account text.

The GitHub staging workflow runs only after an eligible main-branch quality result or a main-branch manual dispatch, and only when `STAGING_E2E_ENABLED=true`. The protected environment must already contain current secrets, functions, schema, provider access, a dedicated test code, and a main-only deployment rule.

A skipped staging workflow is not a pass. Missing credentials or provider access is a blocker, not permission to use production or mocks.

## Checking a change by hand

Tests are not the proof that a change works; using it is. Two local recipes that need no shared Supabase stack:

- Built frontend: `npx vite build --outDir /tmp/<name>` (put build variables such as `VITE_SUPABASE_ENV=staging` in front), then `npx vite preview --outDir /tmp/<name> --host 127.0.0.1 --port <free port> --strictPort`, and drive it with Playwright. Abort `supabase.co` requests with `context.route()` and record their hosts to see which project the app calls without touching it; the Google button on `/login` produces a safe `/auth/v1/authorize` request. `vite preview` returns HTML for `/_vercel/insights` and `/_vercel/speed-insights`, so their `Unexpected token '<'` page errors are expected locally.
- One Edge Function over HTTP: functions that end with `if (import.meta.main) Deno.serve(handleRequest)`, such as `demo-code-login`, run alone with `DENO_SERVE_ADDRESS=tcp:127.0.0.1:<port> SUPABASE_URL=<fake> SUPABASE_SERVICE_ROLE_KEY=test deno run --allow-net --allow-env --allow-read supabase/functions/<name>/index.ts`. Point `SUPABASE_URL` at a small fake that answers the paths in the function's `index_test.ts`, and check CORS with `curl -X OPTIONS -H "Origin: <origin>" -D -`.

## CI evidence

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), the `Quality` workflow, runs documentation, lint, type, unit, collaboration, Edge Function, and build checks. On pull requests a parallel `browser-smoke` job runs the `@smoke` set on desktop Chromium. [`.github/workflows/browser-nightly.yml`](../.github/workflows/browser-nightly.yml) runs the full desktop and mobile suite nightly and on demand. [`.github/workflows/database.yml`](../.github/workflows/database.yml) runs the database gate when backend-facing paths change.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging conditions.

[`.github/workflows/agentic-e2e.yml`](../.github/workflows/agentic-e2e.yml) runs the agentic suite and on-demand explorations. [`.github/workflows/live-e2e.yml`](../.github/workflows/live-e2e.yml) runs the live provider journeys, and [`.github/workflows/prod-canary.yml`](../.github/workflows/prod-canary.yml) runs the production canary. `main` has no branch protection or rulesets (checked 2026-10-01; GitHub Free does not enforce them on private repositories), so no check is required. Path-filtered workflows that skip therefore don't block merges. Read the PR's checks before merging.

To see why a run failed, use `npm run ci:failures` (current branch's PR), `npm run ci:failures -- <pr>` or `npm run ci:failures -- <run-id>`. It works while the run is still going, as soon as a job fails. It lists failed jobs and steps, prints the Playwright or Vitest summary from each job log, downloads the `*-failure-<run-id>` artifacts into ignored `.ci-failures/`, and prints each failed test's error plus the dialogs and headings from its `error-context.md` page snapshot. A dialog the spec never answered shows up there. Protected staging uploads no artifact, so only its job log is available.

Before calling CI green:

1. identify the current head commit;
2. inspect the workflow run for that commit;
3. wait for every required check to reach a terminal state;
4. report billing, minutes, provider, or infrastructure failures as external exceptions rather than passes.

When Actions cannot run at all, the local `npm run verify` and `./.superset/db-gate.sh` results at the final head are the evidence. Record them in the PR and state that CI did not run. See [operations.md](operations.md#when-github-actions-cannot-run).

## What each result does not prove

- Render test: no authenticated backend proof.
- Unit test: no browser integration proof.
- Build: no runtime or provider proof.
- Local browser pass: no current-head CI proof.
- Credential-free E2E: no staging synchronization proof.
- Staging pass: no authorization to deploy or mutate production.
- Live provider pass: no proof for the production models, only for the pinned test model.
- Canary pass: production was healthy at that moment; it covers one AI path, not every feature.
- Agentic pass: a model judged the screens it was shown. It is not exhaustive, a judgment can be wrong in either direction, and fake mode proves nothing about model output. An exploration finding is a lead until a repro test fails on it.
