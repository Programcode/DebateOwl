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

[`src/main.tsx`](../src/main.tsx) mounts the application and starts native runtime handling, observability, native URL handling, service-worker registration, and offline route preloading. Vercel browser telemetry is disabled inside the native shell.

[`src/App.tsx`](../src/App.tsx) owns routes and top-level providers. Pages are lazy loaded. Public routes cover marketing, legal pages, login, sources, and shared content. `/app/*` routes pass through `RequireAuth` and include the main tools, history, library, timer, sparring, flowchart, settings, and administration.

`AuthProvider`, TanStack Query, theme and motion providers, toast systems, the offline indicator, and the route error boundary wrap the routed application.

## Client state

[`src/lib/stores/session-store.ts`](../src/lib/stores/session-store.ts) owns active AI results, conversations, saved work, sources, folders, flowcharts, autosave state, and persisted form state. It persists selected local state and hydrates authenticated rows from Supabase.

[`src/lib/stores/settings-store.ts`](../src/lib/stores/settings-store.ts) owns language, theme, feature provider settings, prompts, and research preferences. It persists locally and synchronizes authenticated settings.

[`src/lib/stores/sparring-store.ts`](../src/lib/stores/sparring-store.ts) owns active sparring rounds in session storage and hydrates completed sessions from Supabase.

[`src/lib/supabase/AuthProvider.tsx`](../src/lib/supabase/AuthProvider.tsx) coordinates store hydration and reset across authentication changes. Store code is not the database schema source of truth; migrations are.

## Supabase environments and sessions

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) resolves production or staging client configuration. Public URLs and anon keys are browser configuration. Do not copy their values into docs.

[`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) creates the client with persistent sessions, automatic refresh, PKCE, and environment-specific storage keys.

Client-side environment selection is a developer convenience, not authorization. Edge Functions and database policies must enforce access independently.

## AI request flow

[`src/lib/ai/client.ts`](../src/lib/ai/client.ts) is the browser AI boundary.

1. A feature page validates input and calls a feature wrapper.
2. The client reads the current Supabase session.
3. It invokes `ai` or `ai-stream` with selected controls and active source context.
4. The Edge Function validates authentication, input bounds, supported model and control combinations, access limits, and feature-specific rules.
5. The backend optionally gathers research, builds prompts, calls a provider, validates output, and records usage.
6. The client validates or transforms the response and updates the relevant store.

[`supabase/functions/ai/index.ts`](../supabase/functions/ai/index.ts) serves non-streaming structured tools and practice modes. [`supabase/functions/ai-stream/index.ts`](../supabase/functions/ai-stream/index.ts) serves Ask over server-sent events.

A configured mock provider bypasses Supabase for local and test behavior. It is not authenticated backend evidence.

## Research and source import

Shared research, source ranking, URL validation, and prompt construction live under [`supabase/functions/_shared/`](../supabase/functions/_shared/).

The import endpoint validates public HTTP URLs, resolves redirect targets, blocks private networks, and enforces response timeout, content type, and size limits. Research paths bound source count and content before prompt construction.

## Database boundary

[`supabase/migrations/`](../supabase/migrations/) owns schema history, RLS policies, functions, triggers, subscriptions, usage accounting, sharing, sparring, announcements, and demo access.

The browser uses user-scoped Supabase access. Privileged Edge Function operations use server credentials only after handler-level checks. Shared backend auth helpers live in [`supabase/functions/_shared/auth.ts`](../supabase/functions/_shared/auth.ts).

Do not infer current schema from old README examples or store query names. Replay migrations and run pgTAP tests for database proof.

## Authentication and authorization

Supabase Auth owns user sessions. Protected routes provide a client navigation boundary, but server authorization is decisive.

- RLS owns row visibility and mutation rights.
- Shared backend helpers validate bearer tokens and admin roles.
- Admin endpoints verify server-side roles.
- Stripe webhook requests use Stripe signatures rather than user sessions.
- Demo-code login is a pre-session flow with hashing, rate limits, bounded use, and a rule that demo access cannot grant administrator status.

## Billing and usage

Checkout and portal functions create Stripe sessions after authenticated ownership and redirect validation. The webhook updates subscription state and records event processing for idempotency. AI handlers record provider usage and calculated cost using shared pricing logic.

Provider pricing evidence is retained under [`docs/pricing-snapshots/`](pricing-snapshots/). The snapshots are evidence, not runtime configuration.

## Observability

Client startup initializes Sentry and PostHog when configured. Product events and exceptions use [`src/lib/observability.ts`](../src/lib/observability.ts). Vercel Analytics and Speed Insights run only in the web build.

CI and staging must not upload authenticated browser captures. Logging must not expose tokens, provider keys, user content, or protected staging values.

## PWA and offline behavior

The service worker and manifest provide installable web assets and an offline app shell. Client startup registers the service worker and preloads route chunks. Offline support does not make authenticated Supabase or AI operations available without a network.

## iOS shell

[`capacitor.config.ts`](../capacitor.config.ts) owns the native app identifier, build directory, schemes, and native plugin settings. The iOS app wraps the same Vite output using a relative asset base.

OAuth still travels through the provider and Supabase HTTPS callback before returning to the app callback scheme. Native URL handling lives in the client startup path.

## Deployment boundary

[`Dockerfile`](../Dockerfile) builds `dist/` with Node 22 and serves it through Nginx. [`nginx.conf`](../nginx.conf) owns SPA fallback, cache policy, crawler restrictions, and response security headers. GitHub workflow files own quality, staging, and packaging automation.

Read [operations.md](operations.md) before changing deployment behavior and [testing.md](testing.md) before claiming a boundary works.
