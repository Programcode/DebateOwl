# Plans

**Status:** Plan index. Plans describe intended work, not current implementation truth. Reconciled against `main` at `0bda733` on 2026-09-27.

Every plan lives in this folder. Before executing one, recheck its paths, assumptions, product decisions, and verification commands against current source.

## In progress

- **Debate-aware AI and smaller modules (PR 2).** Every feature gets server-loaded Current Debate context with a visible Review control, each feature gets its own prompt module, and the 88 KB `supabase/functions/ai/index.ts` is split into per-feature handlers behind the same endpoints. Plan: [2026-09-25 debate AI quality modules](2026-09-25_074255-debate-ai-quality-modules.md).

## Backlog

- **Leaner CI and two previews per PR.** A PR push costs about 62 runner-minutes and real provider spend, and preview sign-in lands on the live site. The pinned-build code is done; the second Vercel project and the Supabase allowlist changes need Adam's go-ahead. Plan: [2026-10-01 leaner CI and previews](2026-10-01-ci-and-preview-verification.md).
- **Admin staging switcher.** `src/lib/supabase/env.ts` already resolves staging from the `debate-supabase-env` localStorage key, but no admin UI sets it. Staging migration and function sync remain operations that need Adam's authorization.
- **Document portability PR.** [Programcode/DebateLab#63](https://github.com/Programcode/DebateLab/pull/63) adds Workspace import and export. Workspace is on hold and the PR has open P1 review findings, so decide whether to close or park it.

## On hold

- **Collaborative Workspace.** Hidden in production. Plans: [debate workspace](2026-09-20_131317-debate-workspace.md) and [debate workspace, reduced scope](2026-09-21-debate-workspace-no-bs.md).

## Shipped

These plans are finished. Their files were removed; git history keeps them.

- Current Debate foundation: #72. Plan kept as the record: [2026-09-25 current debate foundation](2026-09-25_074255-current-debate-foundation.md).
- Email OTP and demo-code sign-in: #40, #41.
- AI control enforcement at the edge: #32, #42.
- System prompt improvement and prompt evaluation: #42.
- Model cost accounting: #46; the direct-provider pricing table was later removed because OpenRouter reports the charge.
- Separate source-import quota (PR #11 salvage): #50.
- Startup and navigation performance: #49, #51, #57.
- Hungarian parity and Jev decisions: merged together before the Workspace release.
- Rate-limit UI cleanup: Settings no longer shows the numeric daily limit.
- Bug backlog of 2026-09-06: the stale source date, the Factoids save label, and Flowchart node-delete feedback are fixed; the nav-versus-heading mismatch went away when the header dropped feature links.
- Earlier: admin announcements (#19, #26), agent verification loop (#21, #26, #27), analytics and error tracking (#16, #18, #22–#25, #28), animation polish (#20), Ask and search quality (#17).
