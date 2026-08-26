# Plans

This folder tracks remaining DebateLab product work. The source tree is the authority: a plan is active only when it describes work that is not already present on the current branch.

## NOW

1. **Sparring v1** — turn DebateLab from a preparation toolbox into a repeatable training loop: motion → side → opponent exchange → qualitative scorecard → targeted next drill.
2. **Verification loop** — keep PR CI deterministic, add browser coverage for the critical product journeys, and prepare authenticated staging E2E without applying or deploying any Supabase changes from this branch.
3. **Post-remediation security validation** — verify the August security findings against current source and add regression tests around the remediated trust boundaries.

## NEXT

- [Ask and sitewide search quality](./search-quality.md): finish the remaining Exa domain-filter verification, handler-level integration coverage, and Factoids consulted-source UI.
- Sparring follow-ups driven by product data: format presets, richer drills, voice/live-round experiments, and longitudinal progress only after the core loop proves useful.
- Conversion and retention work based on measured activation and repeat usage.

## LATER

- [Admin announcements](./admin-announcements.md)
- [Animation polish](./animation-polish.md)
- [Rate-limit UI cleanup](./rate-limit-ui-cleanup.md)
- Further model/prompt experiments that are supported by evaluation data.

## Historical / substantially implemented

These files are kept for implementation history. Do not treat them as current instructions without checking the source tree first.

- [Streaming AI](./streaming-ai.md) — Ask streaming endpoint/client/tests are already present.
- [Source auto-import](./source-auto-import.md) — import endpoint, validation, schema, Library integration, and tests are already present.
- [Control honesty and deterministic toggles](./control-honesty.md) — core enforcement is implemented and tested.
- [Model cost accounting](./model-cost-accounting.md) — accounting helpers, audit metadata, and tests are present; remaining work is operational validation.
- [System prompt improvement](./system-prompt-improvement.md) — layered shared prompt architecture is present.
- [Quality & Truth release checklist](./release-checklist.md) — use as a release-history checklist, not a live roadmap.
- [Supabase staging](./supabase-staging.md) and [Agent verification loop](./agent-verification-loop.md) — still useful design references, but any migration/function/secret deployment is explicitly out of scope for this feature branch.

## Done

- [Bug and polish cleanup](./done/bugs.txt)
- [Admin trial gifts](./done/admin-trial-gifts.md)
- [Top users email fallback](./done/top-users-email-fallback.md)

## Planning rule

Every active plan should name scope, data ownership, rollout, automated verification, and what is deliberately not being changed. If implementation has landed, update this index in the same branch so agents do not repeatedly rediscover stale work.
