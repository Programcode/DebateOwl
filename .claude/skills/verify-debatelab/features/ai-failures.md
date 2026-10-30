# AI failures: the reason and the next step

When an AI request fails, the tool says why in one plain sentence and offers the step that can work. A daily, weekly or plan limit opens the same plan dialog every tool uses, and a Pro-only model opens the upgrade dialog. When the server refuses the session (401, or a 403 that is not about the model), the error offers `Sign in again` instead of Retry, because sending again would be refused the same way. It signs the tab out and opens `/login` with `Your session expired. Sign in again.`, and signing in returns to the page. Timeouts, network failures, provider errors, malformed answers and server errors keep Retry. Crossfire and Sparring retries reuse the round's quota session, so a retry is not charged again. A request that is too large has no Retry. The mapping is `aiFailureRecovery` in `src/lib/ai/failure-reason.ts`, and the same file gives `ai_request_failed` its `error_code` and `stage`.

## Sub-features

- `fail-signin-tool`: Generate answered 401 shows `Sign-in required` with `Sign in again` and no Retry; the button lands on `/login` with the expired-session notice.
- `fail-network-ask`: an Ask question whose request never reached the server shows `Check your connection and try again.` with Retry; once the network is back, Retry answers it and the question appears once.
- `fail-signin-ask`: Ask answered 401 shows `Sign in again` in the chat, with no Retry.
- `fail-limit-tool`: Brainstorm with `daily_limit_override: 0` opens `Daily AI uses used up`.
- `fail-signin-sparring`: the opponent's turn answered 401 shows `The opponent could not answer` with `Sign in again` instead of `Retry opponent turn`.
- `fail-signin-crossfire`: the AI's first question in an AI-led round answered 401 shows `Sign in again` instead of `retry-ai`.

## How to get to it (user POV)

- Any AI tool when its request fails: `/app/generate`, `/app/attack`, `/app/brainstorm`, `/app/factoids`, `/app/ask`, `/app/sparring`, `/app/crossfire`.

## Driving it with verify.sh + Playwright

- `bin/verify.sh drive recipes/ai-failures` runs each sub-feature in its own test, on both viewports.
- The recipe forces each failure in the browser with `page.route`: a 401 JSON answer for `functions/v1/ai` (letting a round's `quotaCheck` through) or `functions/v1/ai-stream`, or `route.abort("internetdisconnected")` for a network failure. The limit step sets `daily_limit_override: 0` through `admin`.
- Provider failures with Retry are `gen-error` in `recipes/case-generation.spec.ts`; the Ask limit with Retry is `usage-ask-not-sent` in `recipes/usage-limits.spec.ts`.

## Gotchas

- A real 401 from a function makes the client refresh the session once (`verifySessionAfterRejection`). On this stack the refresh succeeds, so the tab stays signed in until `Sign in again` is clicked.
- A timeout needs the 200-second client budget to pass, so no recipe forces one. Its message mapping lives in `src/lib/ai/failure-reason.ts`.
