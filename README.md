# DebateLab

DebateLab is an AI debate preparation and practice app for competitive debaters. Students keep one Current Debate for the motion they are preparing, build cases and research for both sides, and practise against the AI, with everything saved to that debate.

Live application: [debateowl.com](https://debateowl.com) (previously debate.pi-stack.org, which now redirects here)

## What it does

- **Current Debate.** One motion follows the signed-in user across the app. Sources and results attach to it automatically, both sides (A favor and En contra) are tracked, and older debates stay available. One-off mode runs a tool without saving to any debate.
- **Prepare.** Generate builds a full case. Brainstorm explores angles. Factoids finds cited evidence. Flowchart maps claims and rebuttals.
- **Practice.** Attack finds weak points. Ask is a streaming debate coach. Crossfire drills questioning. Sparring runs a timed round against the AI and scores it.
- **Library and History.** Sources and saved work, scoped to the Current Debate.
- **Account.** Google, email code, and demo-code sign-in; Basic and Pro plans through Stripe; sharing; admin announcements.
- **Platforms.** Web and installable PWA with an offline shell.
- **Languages.** English, Spanish, and Hungarian interface and AI output.

Collaborative Workspace exists in the code but is hidden and on hold. Its routes appear only when `VITE_COLLABORATION_URL` is set.

The route source of truth is [`src/App.tsx`](src/App.tsx).

## Quick start

Requirements:

- Node.js 22.x and npm, using the committed `package-lock.json`
- Deno 2.x for Edge Function tests
- Docker and Supabase CLI 2.121.0, pinned in `package.json` (`npm ci` installs it) for the local database gate
- Playwright browsers for browser tests

```bash
git clone https://github.com/Programcode/DebateLab.git
cd DebateLab
npm ci
npm run dev
```

Vite serves on port `8080` by default. In a Superset workspace or other linked worktree, stay in the directory `git rev-parse --show-toplevel` returns.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify         # credential-free gate with the desktop Chromium smoke set
npm run verify:full    # adds the full desktop and mobile browser suite
./.superset/db-gate.sh # migrations, pgTAP, and full-stack journeys on local Supabase
```

[`docs/testing.md`](docs/testing.md) explains what each gate proves and covers WebKit, protected staging, live-provider runs, and the production canary.

## How it fits together

```text
Browser or PWA
  -> React 18 + Vite client (Zustand stores, TanStack Query)
  -> Supabase Auth, PostgreSQL with RLS, Edge Functions (Deno)
  -> OpenRouter models, research providers, Stripe, Google APIs
```

- The frontend is hosted on **Vercel**. [`vercel.json`](vercel.json) owns the build, app-route rewrites, cache policy, and security headers. Merging to `main` deploys it to production. Pushes to other branches do not.
- **Supabase** holds auth, data, and Edge Functions. Migrations and function deploys are separate operations that need explicit authorization.
- The browser never holds provider secrets. AI requests go to the `ai` and `ai-stream` Edge Functions, which check auth, quotas, and controls, load debate sources by ID, call the model through OpenRouter, validate the output, and record usage.

Key entry points:

- [`src/App.tsx`](src/App.tsx): routes and providers
- [`src/lib/stores/`](src/lib/stores/): client state and Supabase hydration, including the Current Debate
- [`src/lib/ai/client.ts`](src/lib/ai/client.ts): the browser's AI boundary
- [`supabase/functions/`](supabase/functions/): Edge Functions, with shared code in `_shared/`
- [`supabase/migrations/`](supabase/migrations/): database schema and policy history

## Repository map

```text
src/                 React client, stores, hooks, and unit tests
packages/core/       Platform-neutral shared code: schemas, validation, languages
supabase/            Edge Functions, migrations, pgTAP tests, local config
e2e/                 Playwright browser, full-stack, live, staging, and canary tests
services/            Collaboration service for the hidden Workspace
public/              Static pages, PWA assets, and SEO files
scripts/             Build, docs, SEO, and test helpers
.github/workflows/   Quality, live-provider, model-matrix, staging, and canary CI
.superset/           Worktree dev server, port allocation, and database gate
docs/                Architecture, development, testing, and operations guides
plans/               Plan index and every plan
```

## Documentation

- [`AGENTS.md`](AGENTS.md): the rules and commands coding agents follow
- [`docs/README.md`](docs/README.md): documentation index
- [`docs/architecture.md`](docs/architecture.md): runtime boundaries and request flows
- [`docs/development.md`](docs/development.md): setup and everyday workflows
- [`docs/testing.md`](docs/testing.md): verification gates
- [`docs/operations.md`](docs/operations.md): CI, Vercel, staging, deployment, and rollback
- [`supabase/README.md`](supabase/README.md): backend functions, migrations, and secret names
- [`plans/README.md`](plans/README.md): current work and backlog

## Security

Provider keys, service-role keys, and webhook secrets stay in Supabase or protected CI environments, never in `VITE_*` variables or docs. Row Level Security and handler-level checks are the authorization boundary; client routing is not. Report suspected vulnerabilities privately instead of opening a public issue.

## Contributing

Work on a feature branch, preserve unrelated changes, start bug fixes with a failing test, and run the relevant gates before asking for review. Pushing, merging (which deploys the frontend), migrations, Edge Function deploys, and secret changes need Adam's authorization. The full contract is in [`AGENTS.md`](AGENTS.md).
