# Usage limits: weighted daily quota and monthly AI budget

The daily AI allowance counts units, not requests. An expensive model uses several units per request (Claude Opus 5.5 counts as 5, Sonnet 5.5 as 2, cheap models as 1), so a request that does not fit in what is left today is refused with a message that names the model's weight and the units left, while a lighter model still runs. Separately, once a user's logged AI spend for the current UTC month reaches the monthly budget ($3 by default), every AI request is refused with its own dialog until the 1st of next month. The weights, the budget and the tier defaults live in `supabase/functions/_shared/usage-limits.ts`; the reservation is `consume_daily_quota` in `supabase/migrations/20261022120001_weighted_quota_monthly_budget.sql`.

## Sub-features

- `usage-weighted`: with 4 units left, Opus is refused (`Daily Access Paused`, "This model counts as 5 uses, and you have 4 left today.") without a provider call or a counter change; switching to Claude Haiku 5.5 runs and uses 1 unit.
- `usage-monthly`: with `ai_requests.cost_usd` for this month at or above the budget, the next request opens `Monthly AI Allowance Used` with an `OK` button and no upgrade offer, makes no provider call, and leaves the daily counter alone.

## How to get to it (user POV)

- Any AI tool, for example `/app/generate`, once the day's allowance or the month's budget is used up. The dialog opens on submit.

## Driving it with verify.sh + Playwright

- `bin/verify.sh drive recipes/usage-limits` covers both sub-features in one test.
- The recipe sets `daily_limit_override: 7` on the demo user and inserts a `daily_usage_counters` row (`quota_key: "ai"`, today's UTC date, `request_count: 3`), then inserts an `ai_requests` row with `cost_usd: 3` for the monthly step.
- End states are read from `daily_usage_counters.request_count` and from the recorded provider calls.

## Gotchas

- Demo users are Pro with Claude Opus 5.5 as the default model, so every Generate in other recipes uses 5 units of their 999.
- The monthly sum counts every `ai_requests` row of the month with a known cost, including voice and Jev routing rows. Cost is logged after the provider answers, so the cap can be passed by about one request.
