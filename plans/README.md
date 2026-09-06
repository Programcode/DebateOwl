# Plans

**Status:** Plan index. Plans describe proposed work, not current implementation truth.

Last reconciled against `origin/main` at `c7d3437` on 2026-09-06.

Before executing any plan, recheck its branch, commit, paths, assumptions, product decisions, and verification commands against current source. Do not treat an old line number or completed review as fresh evidence.

## Active plans

- [Email and demo-code sign-in](auth-email-and-demo-code-sign-in.plan)
- [Control honesty and deterministic toggles](control-honesty.md)
- [Model cost accounting](model-cost-accounting.md)
- [PR 11 salvage work](pr11-salvage.md)
- [Rate-limit UI cleanup](rate-limit-ui-cleanup.md)
- [Supabase staging](supabase-staging.md)
- [System prompt improvement](system-prompt-improvement.md)

## Backlog

- [Bug and polish cleanup](bugs.md), four items reverified on 2026-09-06.

## Shipped reference

The following work was removed from active plans after merged implementation was verified on `origin/main` at the time recorded:

- Admin announcements, PR 19, with deactivation and dismissal history in PR 26.
- Agent verification loop, PR 21, with CI gating in PRs 26 and 27.
- Analytics and error tracking, PRs 16, 18, 22, 23, 24, 25, and 28.
- Animation polish, PR 20.
- Ask and sitewide search quality, PR 17.

These entries are historical pointers. Inspect current source and GitHub before relying on their behavior or status.
