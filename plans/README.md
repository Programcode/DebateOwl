# Plans

**Status:** Plan index. Plans describe intended work, not current implementation truth. Reconciled against `main` at `791ccb0` on 2026-10-02.

Every plan lives in this folder and opens with a `**Status:**` line; a plan listed under Shipped must say Shipped (`npm run docs:check` enforces both). When you split a plan across several agent threads, commit it first and put its path in each thread's prompt: an uncommitted plan exists only in one worktree. Before executing one, recheck its paths, assumptions, product decisions, and verification commands against current source.

## In progress

- **Pre-ship security pass.** A 25-item audit of the database, Edge Functions, client and hosting. The clear fixes shipped to production on 2026-10-17 (#148); the decisions for Adam remain. Plan and report: [2026-10-16 security pre-ship pass](2026-10-16-security-preship-pass.md).
- **Staging that tracks main.** Audit of staging, the VPS sync timer, the seed, and what to delete. Plan: [2026-10-03 staging loop](2026-10-03-staging-loop.md). Previews come from #95 and the staging spec fix from #100.

## Backlog

- **Native iOS app.** Replace the Capacitor shell with an Expo app for iPhone and iPad, with full parity, Sign in with Apple, in-app purchase, push, a share extension and a lock-screen timer. Built to the approved mocks by one Fable-led thread, tested on Adam's phone. Plan: [2026-10-08 native iOS app](2026-10-08-native-ios-app.md).
- **Next 15.** Security and data protection, operational safety, code health, and product polish, ordered by risk. Items 3, 5, 6, 8 and 13 have shipped; the plan lists the follow-ups they left. Plan: [2026-10-01 next 15](2026-10-01-next-15.md). Item 15 covers the PR #63 decision.
- **Leaner CI and two previews per PR.** Three-minute PR check, a staging Vercel project for per-PR staging previews, and Edge Function CORS for preview hosts. Plan: [2026-10-01 leaner CI and previews](2026-10-01-ci-and-preview-verification.md).

## On hold

- **Collaborative Workspace.** Hidden in production. Its plans were removed from the tree on 2026-10-29; git history keeps them.

## Shipped

Finished plans are removed from the tree and git history keeps them. Recent ones: Design audit (#124, #126), missing translation keys, Voice Sparring and Crossfire (#84), debate-aware AI modules (#75), and the Current Debate foundation (#72). The 2026-10-08 review report was removed on 2026-10-29; the security pre-ship pass under In progress tracks what is left.
