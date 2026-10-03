# Staging that tracks main: audit and plan

**Status:** Plan, in progress. Written 2026-10-03 against `main` at `34d1573`. The sync, seed, and docs ship in the PR that adds this file. Previews ship in #95 and the staging spec fix in #100. The follow-ups at the end are open.

Goal (Adam, 2026-10-02): when an agent opens a PR, Adam can try the change within seconds on his phone, against a backend that matches, with realistic data, and nothing there can touch production.

## Audit of staging on 2026-10-02

Project `debate-trainer-staging` (`brifeyypjauyusmkptkx`), Free plan.

**Backend drift.** Staging lacked 1 migration and 11 Edge Function deploys from `main`. `workspace-invites` was also undeployed and stays that way, because the Workspace is hidden and production doesn't run it. The cause was process, not tooling: `docs/operations.md` required Adam's authorization for every staging migration or deploy, so nobody did them. The backlog was cleared on 2026-10-02, and `npm run backend:status -- --project-ref brifeyypjauyusmkptkx` showed nothing pending at `34d1573`.

**Secrets (names only).** Present: everything AI and research need. Missing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`.

**Auth.** The Site URL was `http://localhost:8080`. The redirect allowlist held localhost, the production domain, and tailnet previews, but no hosted staging frontend. The #95 thread has since set the Site URL to `https://debatelab-staging.vercel.app` and added the `debatelab-staging` preview and production hosts. Google is enabled on staging.

**How the frontend reached it.** There were two ways:
- An admin-only localStorage switch in Settings (#81), which clears local state across tabs on every flip.
- `npm run dev:preview` tailnet previews (#92).

Vercel PR previews used production, and production's Auth allowlist had no `vercel.app` host, so signing in on a preview landed on the live site.

**Data.** Nothing realistic. The newest source not written by a test was from 2026-05-27.

**What the docs promised versus what held.**
- `operations.md` said previews use production unless toggled. True, and that was the problem.
- It said every backend change goes to staging first and passes the staging suite before production. Not true in practice: staging lagged, so production was often ahead of it.
- It said `Protected staging E2E` runs after each successful main `Quality`. It ran, but it had failed on every real run since 2026-09-23. #72 disabled **Add Source** until a Current Debate exists, and the spec never starts one. #100 fixes the spec. The lagging backend was real but did not cause these failures.
- `testing.md`'s staging contract (unique data, deletes only its own, no captures) holds.

## Decisions

Adam answered these on 2026-10-02:

1. **The sync credential stays on the VPS.** A systemd timer uses the Supabase CLI token already there. Nothing new leaves the box. The cost is blast radius: that token reaches production, and the timer runs whatever `main` contains. See [docs/staging.md](../docs/staging.md#the-credential-and-its-blast-radius).
2. **Previews stay behind Vercel login,** with a Protection Bypass for Automation secret for CI and agents (`VERCEL_STAGING_BYPASS`, created 2026-10-03 on the `debatelab-staging` project).
3. **Staging is shared and equals `main`.** Per-PR database branches need the Pro plan, which is a billing change, so they are not adopted. A PR that changes `supabase/` gets a comment saying its backend reaches staging only on merge.
4. **Adam signs in with Google; agents use demo codes.**

## What ships

In this PR:
- `scripts/staging-sync.mjs`: refuses any ref but staging, applies migrations, deploys changed functions, rechecks, and reports. It sets a `staging-sync` commit status and manages a drift issue.
- `ops/staging-sync/`: the timer, the service, `run.sh` (a dedicated clone of `main`, no `npm install`), and `install.sh`. It has been installed on the VPS since 2026-10-03.
- `scripts/staging/seed.mjs` and `fixtures.mjs`: four seeded accounts on Pro, trial, and expired plans, plus Adam's account. Three invented debates with sources and saved results. Fixed ids, idempotent.
- `seed.mjs --session <account>` mints a session for agents to sign in as any seeded account, because a demo code turns its account into Pro. `--owner-tier` puts Adam's account on trial or expired until the next seed.
- `Protected staging E2E` gains a gate job that waits for `staging-sync` success on its commit and skips commits `main` has already moved past, so it never tests a stale or newer backend.
- `staging-preview-note.yml`: the PR comment from decision 3.
- `docs/staging.md`: the one way in. `operations.md` and `testing.md` point to it.

In #95: `VITE_SUPABASE_ENV` pins a build to a project, the `debatelab-staging` Vercel project builds every PR pinned to staging, and Edge Function CORS accepts its preview hosts on staging.

In #100: the staging spec starts and cleans up its own Current Debate.

## What to delete, not polish

- **The manual staging sync procedure** in `operations.md`. The timer replaces it, so this PR deletes it.
- **The admin localStorage switch in Settings and `e2e/staging-switch.spec.ts`.** Once #95 merges, `https://debatelab-staging.vercel.app` and per-PR staging previews cover every use. The switch shares persisted stores between two projects and needs cross-tab clearing to stay safe, which is a lot of code for a convenience. Remove it in a follow-up after #95 merges (both touch `src/lib/supabase/env.ts`). Keep the staging strip that pinned builds show.
- **Stripe and ElevenLabs on staging.** Not worth provisioning. Billing is proven in Stripe test mode and voice falls back to the browser voice. If account deletion ever needs proof on staging, it needs a Stripe test-mode key, and that is a new secret Adam must approve.

## Verification plan

1. Before merge: the sync's dry run against staging, the production-ref refusal (unit test plus a real run with `SUPABASE_PROJECT_ID` set to production), and two seed runs with identical seeded row counts.
2. On merge of this PR: the timer picks up the merge commit within 5 minutes, sets `staging-sync` to success, and reseeds.
3. On merge of #95: its `cors.ts` change reaches staging through the timer with nobody running a deploy. This is the proof for "the next merge syncs staging by itself". After that, open a `debatelab-staging` preview on a phone-sized viewport and sign in with the seeded Pro code.
4. On merge of #100: `Protected staging E2E` passes against the synced backend.

## Follow-ups

- Replace the classic token with a staging-scoped Supabase token (Adam creates it; the timer reads it as `SUPABASE_ACCESS_TOKEN`).
- Delete the Settings staging switch after #95.
- Make the unit's Node path survive nvm upgrades.
