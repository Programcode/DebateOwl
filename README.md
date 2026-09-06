# DebateLab

DebateLab is an AI-assisted research, case-building, and practice application for competitive debaters. The web app combines structured debate tools, source management, live practice modes, and server-side AI access behind Supabase authentication.

Live application: [debate.pi-stack.org](https://debate.pi-stack.org)

## What the application does

DebateLab currently includes:

- Case generation with structured claims, warrants, impacts, evidence, and export.
- Attack analysis for weaknesses, fallacies, cross-examination questions, and counters.
- Motion brainstorming in mind-map, bucket, and ranked-argument modes.
- Fact checking and research with source discovery and citation handling.
- Ask, an AI debate coach with conversation history and optional source grounding.
- Crossfire practice with turn-based prompts and debriefs.
- Timed sparring rounds with saved sessions and scorecards.
- A flowchart editor for argument structure.
- A source library with folders, imports, activation controls, and cloud sync.
- History, sharing, timers, settings, subscriptions, announcements, and administration.
- A Capacitor iOS shell, PWA support, offline route preloading, and installable web assets.

Public marketing, guide, legal, and shared-content routes are separate from the authenticated application. The route source of truth is [`src/App.tsx`](src/App.tsx).

## Quick start

### Requirements

- Node.js 22.x
- npm and the committed `package-lock.json`
- Deno 2.x for Edge Function tests
- Docker and Supabase CLI 2.115 or newer for database tests
- Playwright browsers for browser tests

### Install and run

```bash
git clone https://github.com/Programcode/DebateLab.git
cd DebateLab
npm ci
npm run dev
```

Vite listens on port `8080` by default. Open `http://localhost:8080`.

If an agent or Superset created a linked worktree, stay in that worktree. Confirm it with:

```bash
git rev-parse --show-toplevel
```

Do not jump to a different checkout because a document or old command names another directory.

## Common commands

```bash
npm run dev            # Vite development server
npm run docs:check     # maintained Markdown links and retired paths
npm run lint           # ESLint
npm run typecheck      # TypeScript without emitting files
npm test               # Vitest once
npm test -- --coverage # selected-scope coverage gate
npm run test:edge      # native Deno Edge Function tests
npm run test:db        # pgTAP tests with local Supabase running
npm run build          # production Vite build
npm run test:e2e       # desktop and mobile Chromium
npm run verify         # complete credential-free gate
```

The full testing matrix, staging requirements, artifact behavior, and exact browser commands are in [`docs/testing.md`](docs/testing.md).

## Stack

The client uses React 18, TypeScript, Vite 7, React Router 7, Zustand, TanStack Query, Tailwind CSS, Radix-based UI components, Zod, Vitest, and Playwright.

The backend uses Supabase Auth, PostgreSQL, Row Level Security, migrations, pgTAP, and Deno Edge Functions. Server-side integrations include supported AI providers, research services, Stripe, and Google Docs export. Client observability uses Sentry, PostHog, Vercel Analytics, and Vercel Speed Insights.

Production assets are built with Node 22 and served by Nginx. GitHub Actions owns quality, database, browser, staging, and image-packaging workflows.

Versions and scripts come from [`package.json`](package.json). Do not maintain a second dependency catalog in documentation.

## Architecture at a glance

```text
Browser or Capacitor shell
  -> React routes and feature components
  -> Zustand stores and TanStack Query
  -> Supabase Auth, database, RPCs, and Edge Functions
  -> AI providers, research, Stripe, and Google APIs
```

Important boundaries:

- [`src/main.tsx`](src/main.tsx) starts the client, observability, native runtime, service worker, and offline preloading.
- [`src/App.tsx`](src/App.tsx) defines public and authenticated routes.
- [`src/lib/supabase/client.ts`](src/lib/supabase/client.ts) creates the environment-specific Supabase client.
- [`src/lib/stores/`](src/lib/stores/) owns persisted client state and server hydration.
- [`src/lib/ai/client.ts`](src/lib/ai/client.ts) is the browser's AI request boundary.
- [`supabase/functions/`](supabase/functions/) contains server-side request handlers.
- [`supabase/functions/_shared/`](supabase/functions/_shared/) contains shared backend auth, validation, research, pricing, and prompt logic.
- [`supabase/migrations/`](supabase/migrations/) is the database history and schema source of truth.

Read [`docs/architecture.md`](docs/architecture.md) before changing boundaries or tracing a request across the system.

## Repository map

```text
src/                   React client, stores, hooks, schemas, and tests
supabase/functions/    Deno Edge Functions and shared backend modules
supabase/migrations/   Ordered PostgreSQL migrations
supabase/tests/        Database and policy tests
public/                Static pages, PWA assets, and machine-readable files
e2e/                   Playwright browser and protected staging tests
ios/                   Capacitor-generated Xcode project
.github/workflows/     Quality, database, browser, staging, and packaging CI
docs/                  Current guides, decisions, and dated evidence
plans/                 Active implementation plans and backlog
```

This map is intentionally shallow. Use source search for component-level discovery instead of expanding it into an exhaustive tree.

## Authentication and environments

The client resolves its Supabase environment in [`src/lib/supabase/env.ts`](src/lib/supabase/env.ts). Public project URLs and anon keys are client configuration, while provider keys, service-role credentials, webhook secrets, and integrity secrets stay in server-side environments.

Authentication uses Supabase sessions with PKCE and environment-specific browser storage. Protected `/app/*` routes require a session. Server-side authorization remains the source of truth for admin access, paid features, data ownership, and rate limits.

The checked-in [`.env.example`](.env.example) contains optional client observability settings. Never commit real credentials or copy them into documentation.

## Data and state

The session store manages generated work, chats, sources, folders, flowcharts, and form state. The settings store manages user preferences and provider selections. The sparring store keeps active round state in session storage and hydrates completed sessions from Supabase.

Supabase tables, RPCs, policies, and triggers are defined by migrations. Do not use a README schema example as migration authority.

For backend ownership and local database work, read [`supabase/README.md`](supabase/README.md).

## AI and research requests

The browser never sends provider secrets. It sends authenticated requests to `ai` or `ai-stream` Edge Functions. Those handlers enforce supported models and controls, check access and limits, assemble source context, call providers, validate output, and account for usage.

The non-streaming endpoint serves structured tools and practice modes. The streaming endpoint serves Ask through server-sent events. Import and research paths validate public URLs and apply request, content, and size limits.

## Testing

Start with the smallest reproduction, then expand according to the blast radius.

The normal credential-free gate is:

```bash
npm run verify
```

It runs documentation checks, lint, type checking, selected-scope coverage, native Edge Function tests, a production build, and desktop plus mobile Chromium against a fresh server on `127.0.0.1:18080`.

Database migrations and RLS policies use a separate local Supabase gate. Protected staging uses a real staging session and requires all protected values together. It must never point at production.

Read [`docs/testing.md`](docs/testing.md) before running database, browser, WebKit, or staging suites.

## iOS

The iOS app is a Capacitor shell around the Vite build.

```bash
npm run ios:build
npm run ios:open
```

The bundle identifier is `com.adam.debatelab`, and the app callback scheme is `debatelab://`. The native build uses a relative Vite base. OAuth providers still redirect through the Supabase HTTPS callback before returning to the app.

Generated files under the Xcode project should be changed through Capacitor or Xcode workflows, not rewritten as ordinary web source.

## Security boundaries

- Provider and service-role secrets stay in Supabase or protected CI environments.
- Edge Functions authenticate in the handler when gateway JWT verification is disabled.
- Stripe webhooks use signature verification, not user bearer authentication.
- Database ownership relies on RLS, authenticated user IDs, and narrowly scoped server operations.
- Source imports reject private-network targets and enforce redirect, timeout, content-type, and size limits.
- Staging browser runs disable traces, screenshots, and video because those artifacts can retain authenticated data.
- Production data, secrets, migrations, and function deployments require explicit authorization and a verified target.

Security details belong near the enforcing code and migrations. Report suspected vulnerabilities privately rather than opening a public issue with exploit details.

## CI and deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the credential-free quality gate. Pull requests also run local database and Chromium jobs. Non-PR runs may package the built assets into a multi-architecture Docker image when registry credentials are available.

[`.github/workflows/staging-e2e.yml`](.github/workflows/staging-e2e.yml) runs only for authorized main-branch staging conditions. A skipped staging job is not a staging pass.

[`Dockerfile`](Dockerfile) builds `dist/` with Node 22 and serves it through Nginx. [`nginx.conf`](nginx.conf) owns SPA routing, cache policy, indexing rules, and response security headers.

Read [`docs/operations.md`](docs/operations.md) before changing CI, Docker, Nginx, staging, CORS, migrations, Edge Functions, or production behavior.

## Documentation

[`docs/README.md`](docs/README.md) is the documentation index. The main current documents are:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/development.md`](docs/development.md)
- [`docs/testing.md`](docs/testing.md)
- [`docs/operations.md`](docs/operations.md)
- [`supabase/README.md`](supabase/README.md)
- [`plans/README.md`](plans/README.md)

Dated SEO notes, pricing snapshots, security scans, plans, and generated files have different freshness rules. Do not treat them as current operational instructions.

## Contributing

1. Work in a feature branch or assigned worktree.
2. Preserve unrelated changes.
3. Add a failing reproduction before fixing a bug when a suitable test layer exists.
4. Run focused checks while working.
5. Run the relevant full gate before requesting review.
6. Keep documentation and source-owner links current when commands or boundaries change.
7. Do not push, deploy, migrate, or change production state without authorization.

The detailed agent contract is in [`AGENTS.md`](AGENTS.md).
