# Leaner CI and two previews per PR

**Status:** In progress 2026-10-01. Part 1's code is done in this branch; its Vercel and Supabase settings need Adam's go-ahead. Parts 2 and 3 are proposed. Numbers come from GitHub Actions runs 36903797758 and 36903797787 (PR #83) and a read-only query of both Supabase projects' Auth settings.

## Goal

Every PR push should give a fast yes or no in a few minutes and two links Adam or an agent can click to try the change signed in. Slow and paid checks run only when the PR touches what they test.

## Part 1. Two previews per PR

Each PR gets a production preview and a staging preview, and both rebuild on every push. Vercel builds take about 40 seconds, and no Actions minutes are used.

Why sign-in on a preview landed on the live site: the app asks Supabase to return to `<preview origin>/app`. Supabase only accepts return addresses on the project's redirect allowlist, and falls back to the Site URL otherwise. Production's allowlist has no `vercel.app` host and its Site URL is `https://debate.pi-stack.org`.

Done in this branch:

- `VITE_SUPABASE_ENV` (`production` or `staging`) pins a build to one project. A pinned build ignores the saved toggle and hides the switch controls. Documented in `docs/operations.md` under "Per-PR previews".

- Edge Function CORS and the demo-code sign-in redirect now accept both projects' preview hosts (`isAllowedOrigin()` in `supabase/functions/_shared/cors.ts`). Before this, previews could not call any function, so demo-code sign-in and AI failed there too.

Needs Adam's go-ahead (outside the repo):

0. Merge, then redeploy the Edge Functions on production and staging so the CORS change is live.

1. Create a second Vercel project, `debatelab-staging`, on the same repository with `VITE_SUPABASE_ENV=staging` for Production and Preview. Its name must not start with `debate-navigator-`, or production's allowlist pattern below would match it too.
2. Add `https://debate-navigator-*-adam-gaborjanis-projects.vercel.app/**` to production's redirect allowlist.
3. Add `https://debatelab-staging-*-adam-gaborjanis-projects.vercel.app/**` and `https://debatelab-staging.vercel.app/**` to staging's allowlist, and change staging's Site URL from `http://localhost:8080` to `https://debatelab-staging.vercel.app`.

Open items:

- Google sign-in on staging works only if the Google Cloud OAuth client lists `https://brifeyypjauyusmkptkx.supabase.co/auth/v1/callback`. Unchecked. Demo-code and email-code sign-in don't need it.
- Adam's staging account is not an admin until someone sets the role on staging.
- A production preview runs unmerged frontend code with real production sessions. That is the accepted trade for seeing real data.
- A staging preview of a PR that changes migrations or Edge Functions needs staging synced first.

## Part 2. Fewer, faster CI jobs

Today one PR push runs four jobs, about 62 runner-minutes and 26 minutes of wall time:

- `quality`, 5 minutes: lint, typecheck, Vitest with coverage (3 minutes), edge tests, build.
- `browser-tests`, 21 minutes, after `quality`: up to 5 minutes installing Chromium, then 16 minutes of Playwright against the Vite dev server, which compiles each lazy route on first visit.
- `database-tests`, 19.5 minutes: 2 minutes starting Supabase, 26 seconds of pgTAP, 14.6 minutes of full-stack Playwright on one worker.
- `Live provider E2E`, 17 minutes: a second Supabase stack, using the real OpenRouter and Exa keys on every push.

Changes:

1. **Live provider E2E** runs nightly, on demand, and on PRs that touch `supabase/functions/**`, `src/lib/ai/**`, `e2e/live/**` or the fake provider, as `model-matrix.yml` already does.
2. **Browser tests** run in the same job as lint and build, with the Playwright browser cache. One job, no second `npm ci` or runner setup. Done in this branch. Serving the built app instead of the dev server was tried and dropped: locally it took 9.3 minutes against 9.6, and two specs instrument dev-server source and cannot run on a build.
3. **Database gate** runs the full-stack specs on 2 or 3 workers. Each test already uses its own demo-code user; specs that change shared rows (`admin.spec.ts` announcements, billing, daily quota) stay serial. Then it runs only on PRs that touch `supabase/**`, `e2e/full-stack/**`, `src/lib/stores/**`, `src/lib/supabase/**` or `src/lib/ai/**`, and on every push to `main`.
4. **Docs-only PRs** run `npm run docs:check` and nothing else. `main` has no required status checks, so skipped jobs don't block merges.

Items 1, 2 and 4 are done in this branch. Item 3's path filter is done; the worker change is not, because it needs the database gate run to prove the shared-row specs stay serial.

The browser suite itself is the remaining cost. Locally it is 1,059 seconds of test time over 2 workers, and every spec runs on both desktop and mobile Chromium. `authed-pages.spec.ts` (227 seconds) renders every page in several locales to check for runtime errors, and `navigation-performance`, `quality-backlog` and `animation-polish` add another 350 seconds. Running mobile Chromium only on specs tagged `@mobile` would roughly halve the suite. That cuts coverage, so it needs Adam's yes.

Estimate for a frontend-only PR push after items 1 to 4: one job of about 15 minutes on CI, down from 26 minutes of wall time and about 62 runner-minutes. With the mobile cut, about 9 minutes. Estimates; measure on the first PR.

## Part 3. Three-minute PR check

Done in this branch, at Adam's request (2026-10-02):

- Unit tests cut from 112 files (1,140 tests) to 15 files (150 tests, 4 seconds). The kept files guard security boundaries, Current Debate isolation, project selection, stream parsing, source import, the Crossfire and Sparring rules, and the db-gate cleanup. The coverage gate is gone.
- Pull requests run 31 Playwright tests tagged `@smoke` on desktop Chromium (36 seconds locally) in a `browser-smoke` job beside `quality`. The full desktop and mobile suite (about 10 minutes locally, 16 on CI) runs nightly in `browser-nightly.yml`.
- `npm run verify` uses the smoke set and takes about 2 minutes locally; `npm run verify:full` adds the full suite.

Still slow: PRs that touch the backend also run the Database workflow (about 20 minutes), and PRs that touch AI code run Live provider E2E (about 17 minutes). Those run beside the 3-minute check rather than inside it.

## Separate bug

`Protected staging E2E` failed on `main` twice on 2026-10-01 (runs 36904139300 and 36907695367). `e2e/staging/authed-flows.spec.ts` times out on a click after 180 seconds on every retry. Not investigated.
