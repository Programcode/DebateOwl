# DebateLab documentation

Start with the smallest document that answers the task instead of loading every file.

## Freshness labels

- **Current:** maintained guidance. Update it in the same change as the source it describes.
- **Plan:** intended work. Revalidate it against the current branch before executing it.

`npm run docs:check` checks every Markdown file for broken local links and retired checkout paths, except generated output and plan files under `plans/`. The plan index `plans/README.md` is still checked.

## Understand the system

- [Architecture](architecture.md), current. Open before changing subsystem boundaries or tracing browser, Current Debate, data, AI, auth, billing, observability, PWA, or iOS flows.
- [Agent guide](../AGENTS.md), current. Always-loaded commands, safety rules, and routing.
- [Root README](../README.md), current. Product overview and quick start.

## Set up and develop

- [Development guide](development.md), current. Open for installation, environment behavior, linked worktrees, frontend, backend, database, or iOS workflows.
- [Supabase backend](../supabase/README.md), current. Open before changing Edge Functions, shared backend modules, migrations, RLS, RPCs, or backend secrets.
- [Collaboration service](../services/collaboration/README.md), current. Only for the hidden Workspace.

## Test and verify

- [Testing guide](testing.md), current. Open before running coverage, Edge Function, database, browser, WebKit, live-provider, canary, or protected staging gates.
- [`package.json`](../package.json) owns npm script definitions.
- [`vitest.config.ts`](../vitest.config.ts) and [`playwright.config.ts`](../playwright.config.ts) own test selection and browser behavior.

## Operate or deploy

- [Operations guide](operations.md), current. Open before changing CI, Vercel hosting, staging, CORS, migrations, Edge Function deployment, rollback, or production state.
- [`.github/workflows/`](../.github/workflows/) is the CI source of truth.

## Plans

- [Plan index](../plans/README.md), plan. What is in progress, the backlog, what is on hold, and what shipped.

## Maintenance rule

Each operational fact has one owner:

- scripts and runtime versions: [`package.json`](../package.json)
- routes: [`src/App.tsx`](../src/App.tsx)
- test behavior: Vitest and Playwright config
- CI behavior: `.github/workflows/`
- database behavior: `supabase/migrations/` and database tests
- Edge Function behavior: `supabase/functions/`
- hosting and HTTP policy: [`vercel.json`](../vercel.json)

When an owner changes, update only the focused document that explains that fact. Prefer links over copied catalogs.
