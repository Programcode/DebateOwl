# Plans

**Status:** Plan index. Plans describe intended work, not current implementation truth. Reconciled against `main` at `791ccb0` on 2026-10-02.

Every plan lives in this folder. Before executing one, recheck its paths, assumptions, product decisions, and verification commands against current source.

## In progress

Nothing is in progress.

## Backlog

- **Missing translation keys.** 88 literal `t()` keys are in no catalog, so Spanish and Hungarian users see English in toasts, dialogs and Library actions. Plan: [2026-10-02 missing translation keys](2026-10-02-missing-translation-keys.md).
- **Next 15.** Security and data protection, operational safety, code health, and product polish, ordered by risk. Items 3, 5, 6, 8 and 13 have shipped; the plan lists the follow-ups they left. Plan: [2026-10-01 next 15](2026-10-01-next-15.md). Item 15 covers the PR #63 decision.

## On hold

- **Collaborative Workspace.** Hidden in production. Plans: [debate workspace](2026-09-20_131317-debate-workspace.md) and [debate workspace, reduced scope](2026-09-21-debate-workspace-no-bs.md).

## Shipped

These plans are finished. Their files were removed; git history keeps them.

- Voice Sparring and Crossfire: #84. Plan kept as the record: [2026-10-01 voice sparring and crossfire](2026-10-01-voice-sparring-crossfire.md).
- Debate-aware AI and smaller modules: #75. Plan kept as the record: [2026-09-25 debate AI quality modules](2026-09-25_074255-debate-ai-quality-modules.md).
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
