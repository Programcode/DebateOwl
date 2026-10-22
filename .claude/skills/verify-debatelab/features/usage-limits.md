# Usage limits: weighted daily quota and weekly AI budget

The daily AI allowance counts units, not requests. An expensive model uses several units per request (Claude Opus 5.5 counts as 5, Sonnet 5.5 as 2, cheap models as 1), so a request that does not fit in what is left today is refused with a message that names the model's weight and the units left, while a lighter model still runs. Separately, once a user's AI spend for the current week (from Monday 00:00 UTC) reaches the weekly budget ($2 by default), every AI request is refused with its own dialog until Monday. Only `ai_requests.cap_cost_usd` counts: OpenRouter credit charges plus Exa and ElevenLabs; calls billed to our own BYOK key add only OpenRouter's fee. The weights, the budget and the tier defaults live in `supabase/functions/_shared/usage-limits.ts`; the reservation is `consume_ai_quota` in `supabase/migrations/20261022130001_weighted_quota_weekly_budget.sql`.

Crossfire and Sparring are charged per round, not per call: the round's first call reserves the model's units through `claim_ai_session_quota` (`supabase/migrations/20261022220000_ai_quota_sessions.sql`), and every later turn, reply, debrief and judge call in the same round is free. A round that passes its call cap or lifetime (`SESSION_QUOTA` in `usage-limits.ts`) pays again. Both setups ask the server what a round costs before Start (a `quotaCheck` request that reserves nothing) and show it in `session-cost`; a round the server would refuse never starts. A run that fails, is cancelled or is lost to a reload before the student saw `REFUND_MAX_DELIVERED_CHARS` of streamed output gets its units back, and the error says "You were not charged".

## Sub-features

- `usage-weighted`: with 4 units left, Opus is refused (`Daily Access Paused`, "This model counts as 5 uses, and you have 4 left today.") without a provider call or a counter change; switching to Claude Haiku 5.5 runs and uses 1 unit.
- `usage-weekly`: with `ai_requests.cap_cost_usd` for this week at or above the budget, the next request opens `Weekly AI Allowance Used` with an `OK` button and no upgrade offer, makes no provider call, and leaves the daily counter alone.

- `usage-weekly-sparring`: with the budget reached, the Sparring setup's `session-cost` shows the translated weekly message from the catalog (not the server's English reason) before Start, and Start opens `Weekly AI Allowance Used` without opening a round or calling the provider.
- `usage-session-sparring` (QB-01): with 1 request left of 5, a Lincoln-Douglas round on Claude Haiku 5.5 runs both opponent replies and the judge; the counter moves 4 to 5 once and `ai_quota_sessions` shows `calls_used: 3`.
- `usage-session-crossfire` (QB-05, MD-03): an AI-led Crossfire round with two answers and the debrief makes four calls and one charge; the setup hint is gone once the round runs.
- `usage-refund-reload` (QB-04, MD-13): reloading while Brainstorm streams logs the run `cancelled`/`aborted` and gives its units back. Fake mode only.
- `usage-ask-not-sent` (MD-01): an Ask question refused by the daily limit stays in the chat under a `Not sent: daily limit reached` alert with Retry; after the limit is raised, Retry sends it once.

## How to get to it (user POV)

- Any AI tool, for example `/app/generate`, once the day's allowance or the week's budget is used up. The dialog opens on submit.

## Driving it with verify.sh + Playwright

- `bin/verify.sh drive recipes/usage-limits` covers each sub-feature in its own test.
- The recipe sets `daily_limit_override: 7` on the demo user and inserts a `daily_usage_counters` row (`quota_key: "ai"`, today's UTC date, `request_count: 3`), then inserts an `ai_requests` row with `cap_cost_usd: 2` for the weekly step.
- End states are read from `daily_usage_counters.request_count`, `ai_quota_sessions`, `ai_requests` and the recorded provider calls.

## Gotchas

- Demo users are Pro with Claude Sonnet 5.5 as the default model, so every Generate in other recipes uses 2 units of their 999. The weighted step picks Opus itself.
- The weekly sum counts `cap_cost_usd` of every `ai_requests` row since Monday 00:00 UTC, including voice and Jev routing rows; NULL (unknown or logged before the column existed) counts as nothing, and `cost_usd` alone never counts. Cost is logged after the provider answers, so the cap can be passed by about one request.
