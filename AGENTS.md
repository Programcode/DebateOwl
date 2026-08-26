# DebateLab Agent Guide

This file is the verification contract for coding agents working in DebateLab. Read it before changing code.

## Runtime and package manager

- Node.js: 22.x
- Package manager: npm (`package-lock.json` is canonical)
- Web app dev port: 8080 by default
- Local Supabase port used by existing tooling: 54321
- Production web app: `https://debate.pi-stack.org`
- Frontend: Vite + React + TypeScript
- Backend source: Supabase Edge Functions and SQL migrations under `supabase/`

## Canonical verification

After `npm ci`, install the browser once on a new machine:

```bash
npx playwright install chromium
```

On Linux CI or a fresh Linux host where system browser dependencies are missing:

```bash
npx playwright install --with-deps chromium
```

Then the canonical branch verification command is:

```bash
npm run verify
```

`npm run verify` must run, in order:

1. ESLint
2. TypeScript typechecking
3. Vitest with the configured coverage thresholds
4. Production Vite build
5. Playwright deterministic browser journeys

Useful narrower commands:

```bash
npm run verify:core
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm run test:e2e:ui
```

Do not report a change as verified if the relevant command did not execute. A GitHub Actions job that failed before obtaining a runner, with no executed steps, is infrastructure failure rather than a failed test result.

## Verification ladder

Use the smallest useful rung while developing, then run the full gate before considering the work complete:

1. Static checks for edited TypeScript/React.
2. Focused Vitest tests for the changed behavior.
3. Full coverage-gated Vitest suite.
4. Production build.
5. Deterministic Playwright browser journeys.
6. Live authenticated staging checks only when explicitly authorized and staging credentials already exist.
7. Manual browser inspection only for visual judgment that automated assertions cannot establish.

Every bug fix should gain a failing regression test first when practical. Never weaken an assertion or coverage threshold merely to make a branch green.

## Browser failure evidence

Playwright retains trace, screenshot, and video for failures. CI uploads `test-results/` and `playwright-report/` as a short-lived artifact when verification fails.

When describing verification evidence, name the command or CI run. Do not say that a browser flow passed based only on code review.

## Authentication and environment model

Supabase credentials are selected in `src/lib/supabase/env.ts`.

- Production project ref: `uziwdtkzofptihahfooo`
- Staging project ref: `brifeyypjauyusmkptkx`
- Runtime storage key: `debate-supabase-env`
- Auth storage is environment-specific.

The normal Playwright suite uses a deliberately fake localStorage session and mocks network behavior where a product journey needs backend output. That suite is safe for pull requests because it receives no privileged credential and does not mutate Supabase.

A real staging-authenticated suite, when present, is a separate opt-in verification path. It must never run on untrusted pull-request code with staging secrets.

## Supabase deployment boundary

Source files under `supabase/functions/` and `supabase/migrations/` may be reviewed and changed when a task requires it, but source control and deployment are separate operations.

**Do not perform any of these unless the user explicitly authorizes that exact operation:**

- `supabase db push`
- applying a migration to local/staging/production through a connected remote project
- `supabase functions deploy`
- `supabase secrets set`
- linking or relinking the repository to a different remote project for deployment
- modifying production or staging rows as a substitute for a test fixture

For the `feature/sparring-verification-retention-loop` work, all Supabase deployment and mutation is explicitly out of scope. Keep migrations/functions un-applied and use deterministic mocks for executable CI.

The existing `demo-code-login` endpoint is stateful: it reserves a demo-code use and may provision/update a user. Do not invoke it merely to prove a branch works when remote Supabase mutation is not authorized.

## Secrets

Never commit, print, paste into a PR comment, or expose in test artifacts:

- service-role keys
- provider API keys
- Stripe secrets
- demo-code pepper values
- plaintext reusable demo access codes

Public Supabase anon credentials are browser credentials, not server secrets, but still do not invent or rotate them casually.

## AI product rules

DebateLab is a debate-preparation and training product. User-facing AI behavior should preserve these invariants:

- Do not fabricate evidence, citations, statistics, quotations, or source metadata.
- Weak research sources are fallback context, not citation-quality evidence.
- Controls must be honest: a visible toggle must actually change the request or deterministic post-processing behavior.
- Typed Sparring cannot honestly judge vocal delivery, eye contact, speaking pace, or other audio-only qualities.
- Prefer transcript-specific feedback over unexplained numeric scores.
- Active Source Library items are factual grounding context; make that behavior visible rather than pretending a disabled control exists.

## Sparring architecture

Sparring deliberately avoids adding another feature branch to the large `supabase/functions/ai/index.ts` handler.

- Schema: `src/lib/ai/schemas/sparring.ts`
- AI orchestration: `src/lib/ai/sparring-client.ts`
- Local persisted history: `src/lib/stores/sparring-store.ts`
- UI: `src/components/features/sparring/` and `src/pages/SparringPage.tsx`
- Export: `src/lib/sparring-export.ts`

The first version is a four-speech loop: user opening, AI response, user rebuttal, AI response, then a qualitative scorecard. Completed sessions are local-first and must be cleared at auth boundaries so one browser account cannot inherit another account's transcripts.

## Roadmap authority

`plans/README.md` is the roadmap index, but the source tree is authoritative. Before implementing a plan, check whether the described files/behavior already exist. When a plan is substantially implemented, update the index so future agents do not repeatedly rebuild shipped work.

## Pull requests and merging

A draft PR may be used to obtain CI evidence. Do not merge a PR unless the user explicitly requests a merge. Do not enable auto-merge as a substitute for explicit authorization.
