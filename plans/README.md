# Plans

This folder tracks remaining DebateLab product work. The source tree is the authority: a plan is active only when it describes work that is not already present on the current branch.

## Current branch status

`feature/sparring-verification-retention-loop` implements the planned product/verification source work:

- Sparring v1: four-speech practice loop, transcript-grounded qualitative scorecard, retry recovery, local history, exports, analytics, and handoffs into Ask/Attack/Brainstorm/Factoids.
- Verification loop: one `npm run verify` gate covering lint, typecheck, coverage, build, and deterministic Playwright browser journeys with retained failure evidence.
- Authenticated staging E2E: prepared as a separate opt-in stateful suite, deliberately excluded from PR CI and not executed while remote Supabase mutation is prohibited.
- Post-remediation security validation: original August findings mapped to current source, regression tests strengthened, and branch-only backend hardening recorded under `security/reviews/`.
- Search Quality: first-class Exa domain/category filters, raw request tests, handler-boundary research coverage, and Factoids consulted-source provenance/UI are implemented in source.

No branch migration or Edge Function has been applied/deployed to Supabase.

## NEXT — data and authorized deployment, not another feature pile

- Run the full verification gate on an available runner and fix any executed failures.
- When explicitly authorized, review/apply the pending Supabase migrations and deploy changed functions to a controlled staging environment, then execute the separate stateful staging suite.
- Run a fresh official security scan against the deployment candidate after those backend changes are actually active.
- Measure Sparring activation, completion, rematch/revisit behavior, feedback-action usage, and conversion before expanding the training product.
- Choose follow-up Sparring work from evidence: format presets, richer drills, voice/live-round experiments, and longitudinal progress only if the core loop proves useful.
- Conversion/retention work should follow observed funnel behavior rather than assumed feature demand.

## LATER

- [Admin announcements](./admin-announcements.md)
- [Animation polish](./animation-polish.md)
- [Rate-limit UI cleanup](./rate-limit-ui-cleanup.md)
- Further model/prompt experiments supported by evaluation data.

## Historical / substantially implemented

These files are kept for implementation history. Do not treat them as current instructions without checking the source tree first.

- [Ask and sitewide search quality](./search-quality.md) — implementation record; formerly deferred domain filtering, handler coverage, and Factoids consulted-source UI are now present on this branch.
- [Streaming AI](./streaming-ai.md) — Ask streaming endpoint/client/tests are already present.
- [Source auto-import](./source-auto-import.md) — import endpoint, validation, schema, Library integration, and tests are present; this branch further hardens its network egress in source.
- [Control honesty and deterministic toggles](./control-honesty.md) — core enforcement is implemented and tested.
- [Debate sparring and streaming](./sparring-and-streaming.md) — original design record; Sparring v1 is implemented with a deliberately narrower four-speech loop.
- [Model cost accounting](./model-cost-accounting.md) — accounting helpers, audit metadata, and tests are present; remaining work is operational validation.
- [System prompt improvement](./system-prompt-improvement.md) — layered shared prompt architecture is present.
- [Quality & Truth release checklist](./release-checklist.md) — use as release history/checklist, not a live roadmap.
- [Supabase staging](./supabase-staging.md) and [Agent verification loop](./agent-verification-loop.md) — useful design references, but migration/function/secret deployment is explicitly outside the current branch execution boundary.

## Done

- [Bug and polish cleanup](./done/bugs.txt)
- [Admin trial gifts](./done/admin-trial-gifts.md)
- [Top users email fallback](./done/top-users-email-fallback.md)

## Planning rule

Every active plan should name scope, data ownership, rollout, automated verification, and what is deliberately not being changed. If implementation has landed, update this index in the same branch so agents do not repeatedly rediscover stale work.
