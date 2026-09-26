# Architecture

**Status:** Current. Verify implementation details against the linked source files.

## System context

DebateLab is a browser application with an optional Capacitor iOS shell. The client uses Supabase for sessions, persisted user data, database RPCs, and Edge Functions. Edge Functions keep privileged credentials server-side and integrate with AI providers, research services, Stripe, and Google APIs.

```text
Browser or Capacitor
  -> React routes, feature components, stores
  -> Supabase Auth, PostgreSQL, RPCs, Edge Functions
  -> AI providers, research, Stripe, Google Docs
```

## Client startup and routing

[`src/bootstrap.ts`](../src/bootstrap.ts) imports the application entry immediately, then schedules Jam after window load and idle time. [`src/main.tsx`](../src/main.tsx) mounts the application before starting native runtime handling, observability, native URL handling, and service-worker registration. Vercel browser telemetry is disabled inside the native shell and loaded behind a separate Suspense boundary.

[`src/App.tsx`](../src/App.tsx) owns routes and top-level providers. Pages are lazy loaded. Public routes cover marketing, legal pages, login, sources, and shared content. `/app/*` routes pass through `RequireAuth` and include the main tools, the Current Debate dashboard (`/app/debate`), history, library, timer, sparring, flowchart, settings, and administration. The header holds only Home, the Current debate menu, Library, History, and the language, theme, and Settings controls; tools are launched from Home and the dashboard.

`AuthProvider`, TanStack Query, theme and motion providers, toast systems, the offline indicator, and the route error boundary wrap the routed application.

## Client state

[`src/lib/stores/session-store.ts`](../src/lib/stores/session-store.ts) owns active AI results, conversations, saved work, sources, folders, flowcharts, autosave state, and persisted form state. It persists selected local state and hydrates authenticated rows from Supabase.

[`src/lib/stores/debate-store.ts`](../src/lib/stores/debate-store.ts) owns the signed-in user's debates, the Current Debate pointer, session-only one-off mode, and the shared Switch and Start dialogs. Every source and every automatically recorded result carries a `debateId`; one-off work and unsorted legacy rows have none. The Library, History, the AI source context, and discovered-source autosave all read from one debate at a time, so material never crosses debates. Motion-bearing tools confirm a motion that differs from the Current Debate (switch, create, or use once) before submitting, and the app blocks with Continue, Start new, or Switch after five days without work in the Current Debate.

[`src/lib/stores/settings-store.ts`](../src/lib/stores/settings-store.ts) owns language, theme, feature provider settings, prompts, and research preferences. It persists locally and synchronizes authenticated settings.

[`src/lib/stores/sparring-store.ts`](../src/lib/stores/sparring-store.ts) owns active sparring rounds in session storage and hydrates completed sessions from Supabase.

[`src/lib/supabase/AuthProvider.tsx`](../src/lib/supabase/AuthProvider.tsx) coordinates store hydration and reset across authentication changes. Store code is not the database schema source of truth; migrations are.

## Language behavior

[`src/lib/languages.ts`](../src/lib/languages.ts) is the shared catalog for English, Spanish, and Hungarian language codes, labels, and Intl locales. [`src/i18n.ts`](../src/i18n.ts) owns the locale resources and applies the selected interface language to i18next, document metadata, and `<html lang>`. Logged-out startup preserves local language preferences; authenticated hydration accepts only catalog languages.

Interface language and AI-output language are separate settings. Interface language controls rendered copy, accessible names, generated app boilerplate, dates, numbers, relative time, PDF chrome, and Web Speech's recognition locale. AI-output language is sent through every structured, streaming, Crossfire, and Sparring request path and becomes an explicit backend prompt instruction. Existing user/provider content and previously saved titles are not rewritten when either setting changes.

## Supabase environments and sessions

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) resolves production or staging client configuration. Public URLs and anon keys are browser configuration. Do not copy their values into docs.

[`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) creates the client with persistent sessions, automatic refresh, PKCE, and environment-specific storage keys.

Client-side environment selection is a developer convenience, not authorization. Edge Functions and database policies must enforce access independently.

## AI request flow

[`src/lib/ai/client.ts`](../src/lib/ai/client.ts) is the browser AI boundary.

1. A feature page validates input and calls a feature wrapper.
2. The client reads the current Supabase session.
3. It invokes `ai` or `ai-stream` with selected controls, stable active-source IDs, and a bounded recent Ask history when needed.
4. The Edge Function validates authentication, loads active personal sources by authenticated user and ID, then enforces input bounds, supported model and control combinations, access limits, and feature-specific rules.
5. The backend optionally gathers research, builds prompts, calls an allowlisted model through OpenRouter, validates output, and records the provider-reported usage and charge.
6. The client validates or transforms the response and updates the relevant store.

[`supabase/functions/ai/index.ts`](../supabase/functions/ai/index.ts) serves non-streaming structured tools and practice modes. [`supabase/functions/ai-stream/index.ts`](../supabase/functions/ai-stream/index.ts) serves Ask over server-sent events.

For a validated Crossfire next turn, the server returns the reply first with a short-lived signed sidecar token. The client then requests a Jev classification of only the newest completed question-answer exchange. The token is atomically claimed through its own one-use counter, separate from the product's daily AI quota. The optional directness, concession, and follow-up signal is attached by turn ID to the answer; a missing, slow, replayed, forged, or failed sidecar never delays or invalidates the main reply. Draft version 1 remains compatible because turn signals are optional.

A configured mock provider bypasses Supabase for local and test behavior. It is not authenticated backend evidence.

## Research and source import

Shared research, source ranking, URL validation, and prompt construction live under [`supabase/functions/_shared/`](../supabase/functions/_shared/).

The import endpoint validates public HTTP URLs, resolves redirect targets, blocks private networks, and enforces response timeout, content type, and size limits. Research paths bound source count and content before prompt construction.

Authenticated personal AI requests carry stable source IDs instead of source content, drawn only from the target debate's active sources; one-off requests send none. The Edge Function loads matching active rows for the authenticated user, bounds their title, content, origin, and type, then passes that context to ranking and prompt construction. Jev scores relevance, importance, and evidence strength after the existing deterministic quality floor, while failures preserve the prior order. Generate also records a bounded source-use snapshot in the saved case output. Semantic counts and the latest case-use flag live in the existing source `metadata` JSON, so the Library can default to Smart ordering without a schema migration.

Ordinary Ask remains stateless while a conversation is in progress. The browser sends only the newest eight messages within a UTF-8 byte budget. Inside a debate, each finished exchange is recorded into one chat for that debate; in one-off mode, pressing Save persists the chat and its messages; Workspace threads use their separate durable server-side context path. Legacy local-only sources are not sent to the authenticated AI endpoint because they have no persisted UUID to authorize and load.

## Database boundary

[`supabase/migrations/`](../supabase/migrations/) owns schema history, RLS policies, functions, triggers, subscriptions, usage accounting, sharing, sparring, announcements, and demo access.

The browser uses user-scoped Supabase access. Privileged Edge Function operations use server credentials only after handler-level checks. Shared backend auth helpers live in [`supabase/functions/_shared/auth.ts`](../supabase/functions/_shared/auth.ts).

Do not infer current schema from old README examples or store query names. Replay migrations and run pgTAP tests for database proof.

## Authentication and authorization

Supabase Auth owns user sessions. Protected routes provide a client navigation boundary, but server authorization is decisive.

- Google OAuth, six-digit email OTP, and demo-code token-hash handoffs all finish as ordinary Supabase sessions and use the same store hydration path.
- RLS owns row visibility and mutation rights.
- Shared backend helpers validate bearer tokens and admin roles.
- Admin endpoints verify server-side roles.
- Stripe webhook requests use Stripe signatures rather than user sessions.
- Demo-code login is a pre-session flow with hashing, fail-closed rate limits, bounded use, and a rule that demo access cannot grant administrator status. Existing demo accounts are reusable only when server-controlled Auth `app_metadata` binds the user to that code.

## Billing and usage

Checkout and portal functions create Stripe sessions after authenticated ownership and redirect validation. The webhook updates subscription state and records event processing for idempotency. AI handlers record provider usage and calculated cost using shared pricing logic.

All model requests use the single OpenRouter backend route and `OPENROUTER_API_KEY`. The shared ten-model catalog, Luna Basic default, Pro-only entries, and request controls live in [`supabase/functions/_shared/model-catalog.ts`](../supabase/functions/_shared/model-catalog.ts). OpenRouter usage remains raw in the audit row, and the reported charge is unknown when the provider does not return a complete cost.

`Auto Fast` and `Auto Pro` are virtual selections, not provider model IDs. The Edge Functions resolve them through TypeSafe Jev on OpenRouter before calling the concrete writing model. Auto Fast is available to Basic accounts and normally resolves to GLM 5.3 Flash; manual GLM selection keeps its Pro restriction. Auto Pro remains Pro-only. Provider calls, usage rows, and response metadata record the concrete resolved model, while response metadata also retains the requested automatic selection. A Jev router call uses the same OpenRouter key and does not consume a second daily quota unit.

Historical provider pricing evidence is retained under [`docs/pricing-snapshots/`](pricing-snapshots/). Those snapshots support legacy calculator records and are evidence, not runtime configuration for the OpenRouter route.

## Observability

Client startup loads Sentry and PostHog asynchronously when configured. Product events and exceptions use the privacy-filtering facade in [`src/lib/observability.ts`](../src/lib/observability.ts), so SDK loading or failure cannot block rendering. Vercel Analytics and Speed Insights run only in the web build and load outside the application render boundary.

CI and staging must not upload authenticated browser captures. Logging must not expose tokens, provider keys, user content, or protected staging values.

## PWA and offline behavior

The service worker and manifest provide installable web assets and an offline app shell. It precaches only the navigation shell and static identity assets; route chunks enter the runtime cache when a user visits them. On first registration, the client also reports same-origin `/assets/` resources that loaded before the worker took control so the first visited route works offline without a forced reload. Updates wait for the normal service-worker lifecycle instead of reloading an active page. Offline support does not make unvisited routes, authenticated Supabase, or AI operations available without a network.

## iOS shell

[`capacitor.config.ts`](../capacitor.config.ts) owns the native app identifier, build directory, schemes, and native plugin settings. The iOS app wraps the same Vite output using a relative asset base.

OAuth still travels through the provider and Supabase HTTPS callback before returning to the app callback scheme. Native URL handling lives in the client startup path.

## Deployment boundary

[`Dockerfile`](../Dockerfile) builds `dist/` with Node 22 and serves it through Nginx. [`nginx.conf`](../nginx.conf) owns SPA fallback, cache policy, crawler restrictions, and response security headers. GitHub workflow files own quality, staging, and packaging automation.

Read [operations.md](operations.md) before changing deployment behavior and [testing.md](testing.md) before claiming a boundary works.
