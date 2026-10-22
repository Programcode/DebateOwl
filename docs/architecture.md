# Architecture

**Status:** Current. Verify implementation details against the linked source files.

## System context

DebateLab is a browser application. The client uses Supabase for sessions, persisted user data, database RPCs, and Edge Functions. Edge Functions keep privileged credentials server-side and integrate with AI providers, research services, Stripe, and Google APIs.

```text
Browser or PWA
  -> React routes, feature components, stores
  -> Supabase Auth, PostgreSQL, RPCs, Edge Functions
  -> AI providers, research, Stripe, Google Docs
```

## Client startup and routing

[`src/bootstrap.ts`](../src/bootstrap.ts) imports the application entry immediately, then schedules Jam after window load and idle time. [`src/main.tsx`](../src/main.tsx) mounts the application before starting observability and service-worker registration. Vercel browser telemetry is loaded behind a separate Suspense boundary.

[`src/App.tsx`](../src/App.tsx) owns routes and top-level providers. Pages are lazy loaded. Public routes cover marketing, legal pages, login, sources, and shared content. `/app/*` routes pass through `RequireAuth` and include the main tools, the Current Debate dashboard (`/app/debate`), history, library, timer, sparring, flowchart, settings, and administration. The header holds only Home, the Current debate menu, Library, History, and the language, theme, and Settings controls; tools are launched from Home and the dashboard.

Collaborative Workspace (`/app/workspaces/*`, the `workspace-invites` function, and `services/collaboration/`) is hidden and on hold. Its routes register only when `VITE_COLLABORATION_URL` is set, which production does not do.

`AuthProvider`, TanStack Query, theme and motion providers, toast systems, the offline indicator, and the route error boundary wrap the routed application.

## Workspace layout

The repository is an npm workspace. The web app is the root package and still lives in `src/`. [`packages/core/`](../packages/core/README.md) (`@debatelab/core`) holds platform-neutral TypeScript the iOS app will share: languages, input validation, the Zod schemas for AI requests and results, Crossfire and Sparring logic, and the Edge Function error reader. Its code may not use DOM globals, React, `import.meta`, or Deno specifiers; its tsconfig has no DOM library and ESLint enforces the rest. Each moved module leaves a one-line re-export at its old `src/lib/` path, so web imports and test mocks are unchanged. The stores, the AI client and streaming, the Supabase client, and the i18n catalogs stay in `src/` for now.

## Client state

[`src/lib/stores/session-store.ts`](../src/lib/stores/session-store.ts) owns active AI results, conversations, saved work, sources, folders, flowcharts, autosave state, and persisted form state. It persists selected local state and hydrates authenticated rows from Supabase.

[`src/lib/stores/debate-store.ts`](../src/lib/stores/debate-store.ts) owns the signed-in user's debates, the Current Debate pointer, session-only one-off mode, and the shared Switch and Start dialogs. Every source and every automatically recorded result carries a `debateId`; one-off work and unsorted legacy rows have none. The Library, History, the AI source context, and discovered-source autosave all read from one debate at a time, so material never crosses debates. Motion-bearing tools confirm a motion that differs from the Current Debate (switch, create, or use once) before submitting; with no Current Debate they instead offer to start one from the typed motion. The first-run tour starts with the Current Debate card, then points at Library and Generate. The app blocks with Continue, Start new, or Switch after five days without work in the Current Debate.

[`src/lib/stores/settings-store.ts`](../src/lib/stores/settings-store.ts) owns language, theme, feature provider settings, prompts, and research preferences. It persists locally and synchronizes authenticated settings.

[`src/lib/stores/sparring-store.ts`](../src/lib/stores/sparring-store.ts) owns active sparring rounds in session storage and hydrates completed sessions from Supabase.

[`src/lib/supabase/AuthProvider.tsx`](../src/lib/supabase/AuthProvider.tsx) coordinates store hydration and reset across authentication changes. Store code is not the database schema source of truth; migrations are.

Discovered-source autosave in [`src/lib/ai/sources.ts`](../src/lib/ai/sources.ts) keeps one Library row per page per debate. It matches on a normalized URL (host without `www.`, no scheme, fragment, tracking parameters or trailing slash) and refreshes the existing row's research metadata instead of inserting a second one. Batches run one at a time within a tab; two tabs can still race, which only a unique index would stop.

[`src/hooks/use-subscription.ts`](../src/hooks/use-subscription.ts) estimates today's remaining AI requests from the account's `ai_requests` rows (refused calls and `jev_*` helper rows excluded) and its own `rate_limits` override. Global `rate_limits` rows are server-only, so the estimate only warns (Sparring setup) and informs (Settings); it is null, never blocking, when any read fails. The `ai` function's 402 stays the decision, and every tool shows it with the same daily-limit dialog.

## Language behavior

[`packages/core/src/languages.ts`](../packages/core/src/languages.ts) is the shared catalog for English, Spanish, and Hungarian language codes, labels, and Intl locales. [`src/i18n.ts`](../src/i18n.ts) owns the locale resources and applies the selected interface language to i18next, document metadata, and `<html lang>`. Logged-out startup preserves local language preferences; authenticated hydration accepts only catalog languages.

Interface language and AI-output language are separate settings. Interface language controls rendered copy, accessible names, generated app boilerplate, dates, numbers, relative time, PDF chrome, and Web Speech's recognition locale for dictation. Voice rounds recognise speech in the AI-output language instead, because that is the language the round is held in. AI-output language is sent through every structured, streaming, Crossfire, and Sparring request path and becomes an explicit backend prompt instruction. Existing user/provider content and previously saved titles are not rewritten when either setting changes.

## Supabase environments and sessions

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) resolves production or staging client configuration. Public URLs and anon keys are browser configuration. Do not copy their values into docs. Admins switch projects from Settings; see [operations.md](operations.md#switching-the-frontend-to-staging).

[`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) creates the client with persistent sessions, automatic refresh, PKCE, and environment-specific storage keys. Its fetch notices when a signed-in request is refused (401 from REST or Functions, 401 or 403 from Auth's user lookup). [`session-expiry.ts`](../src/lib/supabase/session-expiry.ts) then forces a token refresh outside that request: if Auth refuses the refresh too, the session was revoked, so the browser signs out locally and the login page says the session expired. A network failure, 5xx or rate limit keeps the session.

Client-side environment selection is a developer convenience, not authorization. Edge Functions and database policies must enforce access independently.

## AI request flow

[`src/lib/ai/client.ts`](../src/lib/ai/client.ts) is the browser AI boundary: app code imports only from it. The request transport is `request.ts` (streaming Ask uses `streaming.ts`, live generation `live.ts`), and each feature has a file in `features/`, mirroring `supabase/functions/ai/features/`.

1. A feature page validates input and calls a feature wrapper.
2. The client reads the current Supabase session.
3. It invokes `ai` or `ai-stream` with selected controls, the Current Debate context as IDs only, and a bounded recent Ask history when needed.
4. The Edge Function validates authentication, loads the requested debate's material for the authenticated user and that debate only, then enforces input bounds, supported model and control combinations, access limits, and feature-specific rules.
5. The backend optionally gathers research, builds prompts, calls an allowlisted model through OpenRouter, validates output, and records the provider-reported usage and charge.
6. The client validates or transforms the response and updates the relevant store.

[`supabase/functions/ai/index.ts`](../supabase/functions/ai/index.ts) serves the structured tools and practice modes. It is the HTTP entrypoint and dispatcher: authentication, validation, entitlements, model routing, source ranking, and usage accounting run there once, then one handler per feature in [`supabase/functions/ai/features/`](../supabase/functions/ai/features/) builds the prompt and shapes the output. [`supabase/functions/ai-stream/index.ts`](../supabase/functions/ai-stream/index.ts) serves plain Ask over server-sent events. Each feature's task prompt and user-prompt builder lives in [`supabase/functions/_shared/prompts/`](../supabase/functions/_shared/prompts/) beside one module of shared rules.

### Live generation

Every structured answer is shown while the model writes it. A page passes a `live` callback to its feature wrapper, and the request adds `stream: true`. Every check before the feature handler (authentication, input, debate context, quota, model routing, source ranking) still answers with plain JSON and its real status. After that, [`supabase/functions/ai/stream.ts`](../supabase/functions/ai/stream.ts) answers with server-sent events: `phase` (`research`, `writing`, `checking`), `delta` with the model's raw text, `reset` when a JSON repair retry starts the answer again, and one final `result` holding the status and body a plain request returns. Only the call whose output the user sees streams; research sub-calls and Jev decisions do not. The joined text is parsed exactly as a non-streamed reply, and streamed usage is billed the same way, marked incomplete if the stream breaks. On the client, [`src/lib/ai/live.ts`](../src/lib/ai/live.ts) reads the stream, [`packages/core/src/ai/partial-json.ts`](../packages/core/src/ai/partial-json.ts) turns the JSON written so far into a draft, and the page renders it with the result's own labels. A JSON body is accepted too, so the client works against a server from before live generation.

For a validated Crossfire next turn, the server returns the reply first with a short-lived signed sidecar token. The client then requests a Jev classification of only the newest completed question-answer exchange. The token is atomically claimed through its own one-use counter, separate from the product's daily AI quota. The optional directness, concession, and follow-up signal is attached by turn ID to the answer; a missing, slow, replayed, forged, or failed sidecar never delays or invalidates the main reply. Draft version 1 remains compatible because turn signals are optional.

### Voice rounds

Sparring and Crossfire can be spoken. The setup screen offers a voice switch only where the browser has the Web Speech recogniser and the microphone is not blocked; otherwise it shows a one-line reason and the round is typed as before. The first time the switch is turned on, a notice says where audio and text go, and [`src/lib/voice/availability.ts`](../src/lib/voice/availability.ts) remembers the acknowledgement in that browser.

The student's speech never reaches DebateLab as audio. [`src/hooks/use-speech-capture.ts`](../src/hooks/use-speech-capture.ts) feeds the microphone to the browser's recogniser (in Chrome that sends audio to Google), restarts it when the browser ends a session on silence, and puts the recognised words into the same draft a typed turn uses. It also times the take, and [`packages/core/src/voice/delivery.ts`](../packages/core/src/voice/delivery.ts) turns that into measured facts: speaking time, words per minute, filler words from a per-language list, and silences of three seconds or more. The facts ride on the user's speech or turn as an optional `delivery` field, so sessions and drafts from before voice rounds still load. The sparring scorecard and the Crossfire debrief show them as numbers. The sparring judge receives them with a prompt that allows it to quote those numbers and comment on structure, and forbids any claim about tone, confidence, or volume; typed rounds keep the typed prompt unchanged. The Crossfire debrief is never asked to judge delivery.

A voice request adds a top-level `voice: true` beside `input`, where a server from before voice rounds ignores it. The opponent prompt then allows a short allowlist of inline audio tags such as `[sighs]` and `[sarcastic]`. [`supabase/functions/_shared/voice-tags.ts`](../supabase/functions/_shared/voice-tags.ts) splits the model's reply in two: the clean text, with every tag removed, is what the response's `output` carries, what is signed, shown, saved, and read by the fallback voice; the spoken text keeps allowlisted tags, turns `[pause]` into the ellipsis Eleven v4 documents for pauses, rations tags to at most one per sentence and never two sentences running, and is cut into segments of at most 1,000 characters. Up to 12 segments are returned in a top-level `voice.segments` list, each with a 30-minute HMAC token from [`_shared/voice-token.ts`](../supabase/functions/_shared/voice-token.ts) that binds the text to the user and the feature; the verifier allows 30 seconds of clock difference between the two functions. Text past the twelfth segment comes back unsigned and without tags in `voice.overflow`, which only the browser voice reads, so a long reply is heard in full without raising the ElevenLabs cost of one reply. The spoken text lives only in memory in the browser.

[`src/lib/voice/opponent-voice.ts`](../src/lib/voice/opponent-voice.ts) plays a reply segment by segment through the [`voice`](../supabase/functions/voice/index.ts) Edge Function, fetching one segment ahead and decoding with Web Audio. The function authenticates the caller, verifies the token so it speaks only text the server wrote, and returns `voice_unavailable` when `ELEVENLABS_API_KEY` is not set, before it reserves anything. It then checks the account, reserves one clip from the per-user daily voice cap through `consume_daily_quota` under the `voice` key (60 clips for paid access, 12 on a trial, overridable with a `daily_voice_clips` row in `rate_limits`), calls ElevenLabs (`eleven_v4` for Sparring, `eleven_v4_turbo` for Crossfire), and logs an `ai_requests` row with the billed characters. Every attempt keeps its clip, including one ElevenLabs refuses, so replayed tokens cannot reach the provider without limit while it fails. Whenever a segment cannot be had, because the key is missing, the cap is reached, or the call fails, the browser's `speechSynthesis` reads the rest of the reply from the clean text and the round continues. After any refusal from the function other than an invalid token, the browser stops asking for the rest of that round and tries ElevenLabs again when the next round starts; a network error is retried on the next reply. In Sparring the student's clock waits while the opponent speaks. Starting to speak stops the opponent's audio.

[`vercel.json`](../vercel.json) allows the microphone for the app's own origin only (`microphone=(self)`); dictation and voice rounds both depend on it.

A configured mock provider bypasses Supabase for local and test behavior. It is not authenticated backend evidence.

## Research and source import

Shared research, source ranking, URL validation, and prompt construction live under [`supabase/functions/_shared/`](../supabase/functions/_shared/).

Research makes two small model calls of its own: Ask decides whether a question needs web search, and deep research writes follow-up search queries. Both run on `BACKGROUND_MODEL` (Claude Haiku 5.5 at low effort) in [`supabase/functions/_shared/model-catalog.ts`](../supabase/functions/_shared/model-catalog.ts), not on the model the user picked; only the answer uses that model. Their usage is still added to the parent request's row.

The import endpoint validates public HTTP URLs, resolves redirect targets, blocks private networks, and enforces response timeout, content type, and size limits. Research paths bound source count and content before prompt construction.

[`supabase/functions/_shared/prompt-budget.ts`](../supabase/functions/_shared/prompt-budget.ts) holds the limits that set how many input tokens a request pays for: characters kept per fetched page, search snippets per research prompt, earlier Ask messages, and the Ask context cap. A research prompt lists each source once: a page read in full is not repeated as a search snippet, and a URL that several queries found appears a single time. For `anthropic/*` models the system prompt carries a `cache_control` breakpoint, so a repeat of the same prefix within five minutes is billed at the cache-read price; a prompt below the model's minimum cacheable length is sent uncached at the normal price.

Every AI request in a Current Debate carries a `debateContext` of IDs and preferences, never text: the debate, the side the request prepares, the Library source IDs, and the saved results to read. [`src/lib/debate/context.ts`](../src/lib/debate/context.ts) chooses the default with the rules in [`supabase/functions/_shared/debate-context.ts`](../supabase/functions/_shared/debate-context.ts): the debate's active sources, pinned results first, then up to three of the newest results of the types that feature uses, for the requested side. A compact line above each tool's primary button shows that selection, and Review changes it for one request, or for a whole Crossfire or Sparring round, where Review appears only before the round starts; pins persist in `debate_context_pins`. [`supabase/functions/_shared/debate-context-loader.ts`](../supabase/functions/_shared/debate-context-loader.ts) loads the motion, settings, instructions, sources, and result digests with every query filtered by the caller and the one debate, before quota or provider work. The prompt renders that material in delimited blocks followed by rules that it cannot override. Live sparring stays transcript-only: the scorecard sees only the motion and settings. Crossfire omits free-form instructions. Whole results are dropped when their budget is spent, and a Crossfire round that would pass its 100,000-character prompt budget drops its saved results. In both cases `meta.debateContext` reports what reached the model and what was set aside. A debate deleted on another device returns 404, and the browser reloads its debate list. One-off requests send no debate context. The retired per-user custom system prompt is no longer sent or honored; operator prompts in `global_prompts` remain. Jev scores relevance, importance, and evidence strength after the existing deterministic quality floor, while failures preserve the prior order. Generate also records a bounded source-use snapshot in the saved case output. Semantic counts and the latest case-use flag live in the existing source `metadata` JSON, so the Library can default to Smart ordering without a schema migration.

Ordinary Ask remains stateless while a conversation is in progress. The browser sends only the newest eight messages within a UTF-8 byte budget. Inside a debate, each finished exchange is recorded into one chat for that debate; in one-off mode, pressing Save persists the chat and its messages; Workspace threads use their separate durable server-side context path. Legacy local-only sources are not sent to the authenticated AI endpoint because they have no persisted UUID to authorize and load.

## Database boundary

[`supabase/migrations/`](../supabase/migrations/) owns schema history, RLS policies, functions, triggers, subscriptions, usage accounting, sharing, sparring, announcements, and demo access.

The browser uses user-scoped Supabase access. Privileged Edge Function operations use server credentials only after handler-level checks. Shared backend auth helpers live in [`supabase/functions/_shared/auth.ts`](../supabase/functions/_shared/auth.ts).

Do not infer current schema from old README examples or store query names. Replay migrations and run pgTAP tests for database proof.

## Account export and deletion

Settings offers three controls. "Download my data" calls the `account` Edge Function, which returns `export_account_data`, which holds the auth profile, every row whose ownership column (`user_id`, `owner_id`, `author_id`, `created_by`, or `recipient_id`) references the user, chat messages, published announcements addressed to the user, and announcements they wrote. Columns that only mention the user, such as `actor_id` or `resolved_by`, never select a row, and workspace rows are exported only while the user is still a member, as their read policies require. It leaves out credential and integrity columns and admin catalog work (promo codes, curated sources, global prompts, demo codes). Admin grants appear as grant type and dates only, because RLS hides their notes and author from the user. "Delete All My Data" calls `clear_current_user_data` and keeps the account. "Delete account" asks the user to type their email (or DELETE for an account without one), then calls the `account` function.

Deletion runs in a fixed order, and a failure at any step leaves the account in place:

1. Stop Stripe billing for every customer in `subscriptions`, in `stripe_customers`, or found by a Stripe search on `metadata.user_id`. The function expires open Checkout sessions, then cancels live subscriptions immediately, without a refund. If Stripe cannot be reached, nothing is deleted. `create-checkout` records the customer in `stripe_customers` before it opens a session, because Stripe search can lag a new customer by up to a minute. A Checkout session opened in another tab during the few seconds deletion takes is not stopped.
2. Remove Storage objects whose owner is the user through the Storage API, because Storage forbids deleting objects with SQL. `source_files.storage_key` is user-writable, so it never selects an object for deletion.
3. Call `prepare_account_deletion`, which deletes the workspaces the user owns and the user's own sources, threads, messages, and results in other workspaces. Those foreign keys stay `RESTRICT` so that a raw delete of an auth user cannot remove shared work by accident.
4. Delete the auth user with the Auth admin API. Every other foreign key into `auth.users` cascades or sets null, and the `on_auth_user_deleted` trigger clears the user from announcements, which have no foreign key.

Admin-authored rows such as promo codes, curated sources, announcements, and grants to other users survive with the author cleared. Stripe keeps its own invoices and payments for tax and accounting. A new foreign key to `auth.users` must cascade, set null, or be cleared by `prepare_account_deletion`. `supabase/tests/account_deletion_test.sql` fails if its fixture has no row in that table or if any row still mentions the deleted user.

## Authentication and authorization

Supabase Auth owns user sessions. Protected routes provide a client navigation boundary, but server authorization is decisive.

- Google OAuth, six-digit email OTP, and demo-code token-hash handoffs all finish as ordinary Supabase sessions and use the same store hydration path.
- RLS owns row visibility and mutation rights.
- Shared backend helpers validate bearer tokens and admin roles.
- Admin endpoints verify server-side roles.
- Stripe webhook requests use Stripe signatures rather than user sessions.
- Demo-code login is a pre-session flow with hashing, fail-closed rate limits, bounded use, and a rule that demo access cannot grant administrator status. Existing demo accounts are reusable only when server-controlled Auth `app_metadata` binds the user to that code.

## Billing and usage

Checkout and portal functions create Stripe sessions after authenticated ownership and redirect validation. The webhook updates subscription state and records event processing for idempotency. AI handlers record the provider-reported usage and charge for each request.

All model requests use the single OpenRouter backend route and `OPENROUTER_API_KEY`. The shared ten-model catalog, its defaults (Claude Haiku 5.5 for Basic, Claude Sonnet 5.5 for Pro; Claude Opus 5.5 runs only when picked), Pro-only entries, retired-ID successors, and request controls live in [`supabase/functions/_shared/model-catalog.ts`](../supabase/functions/_shared/model-catalog.ts). Each feature's reply length cap lives in [`supabase/functions/_shared/output-caps.ts`](../supabase/functions/_shared/output-caps.ts); `max_tokens` adds room for the reasoning effort on top. A JSON reply cut off at its cap is retried once with twice the budget, and a streamed Ask answer cut off there ends with a notice under it. OpenRouter usage remains raw in the audit row, and the reported charge is unknown when the provider does not return a complete cost. The opponent's voice is the one exception to the OpenRouter route: the `voice` function calls ElevenLabs with `ELEVENLABS_API_KEY`. ElevenLabs reports billed characters, not dollars, so [`supabase/functions/_shared/cost.ts`](../supabase/functions/_shared/cost.ts) prices those rows from a dated list-price snapshot; promotions and plan credits are not modelled, so a voice row can overstate the charge.

Every model call asks for JSON. Calls whose shape the server checks in code (the Crossfire next turn and debrief, the Ask search decision, and research follow-up queries) send a strict JSON Schema, so OpenRouter routes them only to endpoints that enforce it; the other features use plain JSON mode. [`supabase/functions/ai/provider.ts`](../supabase/functions/ai/provider.ts) fixes common slips in a reply locally (markdown fences, prose around the object, trailing commas, raw line breaks in strings) before it pays for one repair retry, and a reply the provider cut off at its cap is retried once with twice the budget, not with the repair prompt.

`Auto Fast` and `Auto Pro` are virtual selections, not provider model IDs. The Edge Functions resolve them through TypeSafe Jev on OpenRouter before calling the concrete writing model. Auto Fast is available to Basic accounts, routes only among the Basic models (Claude Haiku 5.5, GPT-6 Luna, Muse Spark 1.3 Contributor), and normally resolves to Claude Haiku 5.5. Auto Pro remains Pro-only, routes between Claude Sonnet 5.5 and GPT-6.1 Sol, and normally resolves to Claude Sonnet 5.5; it never routes or falls back to Opus. Provider calls, usage rows, and response metadata record the concrete resolved model, while response metadata also retains the requested automatic selection. A Jev router call uses the same OpenRouter key and does not consume a second daily quota unit.

## Observability

Client startup loads Sentry and PostHog asynchronously when configured. Product events and exceptions use the privacy-filtering facade in [`src/lib/observability.ts`](../src/lib/observability.ts), so SDK loading or failure cannot block rendering. Sentry events carry the build's commit SHA as the release and the Vercel environment name. Route crashes keep the original error type and stack frames but replace the message, which can carry user text. Vercel Analytics and Speed Insights run only in the web build and load outside the application render boundary.

CI and staging must not upload authenticated browser captures. Logging must not expose tokens, provider keys, user content, or protected staging values.

## PWA and offline behavior

The service worker and manifest provide installable web assets and an offline app shell. It precaches only the navigation shell and static identity assets; route chunks enter the runtime cache when a user visits them. On first registration, the client also reports same-origin `/assets/` resources that loaded before the worker took control so the first visited route works offline without a forced reload. Updates wait for the normal service-worker lifecycle instead of reloading an active page. Offline support does not make unvisited routes, authenticated Supabase, or AI operations available without a network.

## Deployment boundary

Vercel builds `dist/` with Node 22 and serves it. [`vercel.json`](../vercel.json) owns the app-route rewrites, the 404 for everything else, cache policy, crawler restrictions, and response security headers. Merging to `main` deploys the frontend to production; Supabase migrations and Edge Functions deploy separately. GitHub workflow files own quality, live-provider, staging, and canary automation.

Read [operations.md](operations.md) before changing deployment behavior and [testing.md](testing.md) before claiming a boundary works.
