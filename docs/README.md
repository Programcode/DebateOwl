# DebateLab documentation

This directory uses progressive disclosure. Start with the smallest document that answers the task instead of loading every file.

## Freshness labels

- **Current:** maintained operational or architectural guidance. Update it with the owning source.
- **Plan:** proposed work. Revalidate it against the current branch before execution.
- **Evidence snapshot:** captured facts from a named date or revision. Do not treat it as current state.
- **Generated:** produced by a tool or platform. Change the source or generator instead.
- **Historical:** retained context about past work. It may contain retired results or assumptions, but it must not preserve actionable retired checkout commands.

New maintained Markdown is checked by `npm run docs:check` unless it lives under an explicit generated, evidence, security-scan, plan, or design-spec prefix.

## Understand the system

- [Architecture](architecture.md), current. Open before changing subsystem boundaries or tracing browser, data, AI, auth, billing, observability, PWA, or iOS flows.
- [Agent guide](../AGENTS.md), current. Always-loaded commands, safety rules, and routing.
- [Root README](../README.md), current. Product overview and human quick start.

## Set up and develop

- [Development guide](development.md), current. Open for installation, environment behavior, linked worktrees, frontend, backend, database, or iOS workflows.
- [Supabase backend](../supabase/README.md), current. Open before changing Edge Functions, shared backend modules, migrations, RLS, RPCs, or backend secrets.

## Test and verify

- [Testing guide](testing.md), current. Open before running coverage, Edge Function, database, browser, WebKit, or protected staging gates.
- [`package.json`](../package.json) owns npm script definitions.
- [`vitest.config.ts`](../vitest.config.ts) and [`playwright.config.ts`](../playwright.config.ts) own test selection and browser behavior.

## Operate or deploy

- [Operations guide](operations.md), current. Open before changing CI, Docker, Nginx, staging, CORS, migrations, Edge Function deployment, rollback, or production state.
- [Quality and packaging workflow](../.github/workflows/deploy.yml) and [protected staging workflow](../.github/workflows/staging-e2e.yml) are the CI sources of truth.

## Plans

- [Plan index](../plans/README.md), plan. It records active proposals and the backlog.
- Individual plans describe intent at a past revision. Check their branch, commit, paths, and assumptions before using them.

## Evidence and historical records

- [`pricing-snapshots/`](pricing-snapshots/) contains immutable provider-pricing evidence used by cost accounting.
- [SEO work log](seo-debatelab-2026-07-05.md), [SEO escalation](seo-escalation-2026-07-05.md), and [authority opportunities](seo-authority-opportunities-2026-07-05.md) are historical snapshots from 2026-07-05.
- [Security scan 06d93a47](../security/scans/2026-08-19-codex-security-06d93a47/README.md) is evidence for one old revision, not current security proof.

## Decisions

- [Agent-friendly documentation](decisions/001-agent-friendly-documentation.md) explains why DebateLab keeps root instructions short and routes deeper work to focused documents.

## Maintenance rule

Operational facts have one owner:

- scripts and runtime versions: [`package.json`](../package.json)
- routes: [`src/App.tsx`](../src/App.tsx)
- test behavior: Vitest and Playwright config
- CI behavior: `.github/workflows/`
- database behavior: `supabase/migrations/` and database tests
- Edge Function behavior: `supabase/functions/`
- packaging and HTTP policy: [`Dockerfile`](../Dockerfile) and [`nginx.conf`](../nginx.conf)

When an owner changes, update only the focused document that explains that fact. Prefer links over copied catalogs.
