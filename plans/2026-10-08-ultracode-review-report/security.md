# Security (Edge Functions and database): findings

**Status:** Review evidence from 2026-10-08/09, for [the ranked report](../2026-10-08-ultracode-review-report.md). Not started.

29 findings: 2 high, 11 medium, 16 low. An independent verifier re-checked every one.

Each entry has the final severity, where the problem lives, what the reviewer saw, why it happens, a suggested fix, the independent check and links to the screenshots and measurements in `.verify/ultracode-review-2026-10-08/`. Line numbers are against main at 40738ea.

Not covered by the security-edge reviewer:

- demo-code-login live behaviour. The task forbids probing it, because every request records an attempt row. Whether the last X-Forwarded-For entry is really the client IP on Supabase's edge is unverified
- Production secrets and deploy state (off limits). SPARRING_INTEGRITY_SECRET was checked on staging only
- The OpenRouter error passthrough is reproduced locally only. Triggering it live would have spent AI quota
- Import-parser CPU blowup timed only in local Deno. The hosted runtime's CPU limit and its effect on other requests sharing the worker were not measured
- An authenticated voice request whose content-length exceeds 8000 (the null-return path that never reads the body). Not probed
- Billing functions (stripe-webhook, create-checkout, create-portal, redeem-promo): integrity-money agent
- workspace-invites internals (hidden). I only confirmed it is deployed and answers 401 on staging
- Sparring and crossfire prompt content, and the HMAC binding details of crossfire signal tokens. Skimmed only
- The admin grant-trial, promo and subscribers actions were read only as far as the shared admin gate
- Browser UI flows. No browser was launched, because this area is server-side

Not covered by the security-db reviewer:

- Production catalog: never touched. TRUNCATE, global_prompts and admin-RPC grants on production are unknown. Staging shows out-of-band hardening for some objects, so production may differ from both staging and the replay
- Staging TRUNCATE and REFERENCES grants: PostgREST cannot show these without catalog access
- PostgREST max_rows on staging: no seeded account has more than 1000 rows in any table, so the truncation finding rests on Supabase's documented default of 1000, not a live repro
- Write probes against staging: none run, by design. Write-policy claims come from migration text plus the throwaway replay
- The keepalive_heartbeat 'rpc-keepalive' row is touched in the same transaction as each event insert. That suggests a function or trigger that no migration contains, but its name could not be enumerated without catalog access
- Workspace tables and functions (about 2,500 lines of migrations) were inventoried for grants and SECURITY DEFINER ACLs only, not audited in depth (out of scope)
- Stripe webhook entitlement writes (grace_period_ends_at set to null on checkout, tier set to 'expired' on cancel, which also wipes promo or lifetime Pro) are noted under finding 1 but left to the integrity-money lane
- Local DB gate and pgTAP run: not run (held by the integrity-money agent)

### security-db-1: Promo redemption overwrites existing entitlements: a paying Pro user becomes trial, lifetime Pro becomes 30 days, a 200/day limit becomes 15

**Severity:** high · **Verdict:** confirmed · **Root cause:** `promo-redeem-overwrites-entitlements`

**Where**

- supabase/migrations/20260819000000_security_hardening.sql:117-142 (redeem_promo_code_atomic: each CASE branch does ON CONFLICT DO UPDATE SET subscription_tier/trial_ends_at/grace_period_ends_at/daily_limit_override = EXCLUDED.*)
- supabase/functions/_shared/entitlements.ts:47-125 (getSubscriptionInfo only consults subscriptions when tier === 'pro')
- src/components/features/subscription/PricingModal.tsx:25-48 (promo field)
- src/pages/SettingsPage.tsx:176-227 (promo-only Pro users get 'Set up billing', which opens PricingModal)
- src/pages/AttackPage.tsx:170-182 (and the other tool pages: LimitReachedModal -> PricingModal, so a Stripe Pro user who hits the daily limit also sees the promo field)

**What the reviewer saw**

Replay of all migrations, run as role authenticated with a JWT sub (replay-proofs.out.txt, block P1). Before: stripe-pro had tier 'pro', grace NULL and an active subscription row; lifetime had tier 'pro', grace 9999-12-31, limit 50; school-pro had tier 'pro', grace +300 days, limit 200. After redeeming SCHOOLTRIAL (extended_trial, 14 days), FREEMONTH (free_month, 30 days) and MORELIMIT (extra_limit, 15), all returning success=true:
 stripe-pro@example.test | trial | grace NULL | trial_ends 2026-10-22 | override NULL
 lifetime@example.test | pro | grace 2026-11-07 | ... | 50
 school-pro@example.test | pro | grace 2027-08-04 | ... | 15
With tier 'trial', getSubscriptionInfo returns the trial branch (5/day, no Pro models) and never looks at the active Stripe subscription. Once trial_ends_at passes, a paying subscriber reads as expired until the next customer.subscription.updated webhook, usually the renewal. The lifetime user's 9999 grace date is gone for good. Related, from the same single-column design (integrity-money lane): stripe-webhook sets grace_period_ends_at=null on checkout and tier='expired' on cancel/payment failure (stripe-webhook/index.ts:183-187, 241-246, 278-283), which also wipes promo or lifetime Pro.

**Why it happens**

Entitlement is stored as overwritable scalar columns on user_settings with several writers (promo RPC, Stripe webhook, admin grants), and the promo RPC writes absolute values instead of combining them with what the user already has.

**Suggested fix**

In a new migration, rewrite redeem_promo_code_atomic so it only ever adds. Never lower subscription_tier: if the user is already 'pro' (active subscription or grace in the future), extended_trial becomes a no-op or is refused with a clear message. Use GREATEST(existing, new) for trial_ends_at, grace_period_ends_at and daily_limit_override. free_month extends from GREATEST(now(), grace_period_ends_at). Add a pgTAP test covering Stripe Pro + extended_trial, lifetime + free_month and override 200 + extra_limit 15. Separately (integrity-money lane), stop the webhook from nulling a future grace_period_ends_at.

**Who it hits**

Any Pro user, paying or promo/lifetime, who redeems a school or partner code. They lose Pro features or daily quota, sometimes permanently, and a paying customer gets trial limits. Reachable from the UI and directly through PostgREST.

**Independent check**

Evidence: code, plus a browser screenshot of UI reach. Promo redemption on staging is forbidden. redeem_promo_code_atomic (20260819000000_security_hardening.sql:117-141; later migrations only re-grant) does unconditional ON CONFLICT DO UPDATE SET col = EXCLUDED.col. extended_trial writes subscription_tier='trial'. free_month writes grace = now()+days, which overwrites a 9999 lifetime date. extra_limit writes daily_limit_override = 15, below Pro's 50. getSubscriptionInfo checks subscriptions only when tier === 'pro' (entitlements.ts:82-103), so a Stripe subscriber set to 'trial' gets 5 a day without Pro models. Reach: the seeded pro account (lifetime Pro through a demo code) sees 'Set Up Billing' in Settings, which opens the PricingModal promo field (screenshot). LimitReachedModal always shows Upgrade, which opens the PricingModal promo field (AttackPage.tsx:170-182). So a Pro user who hits the limit and redeems an 'extra limit' code ends up with fewer requests. Extra defect seen in the same screenshot: the PricingModal marks 'Free' as 'Current' for a Pro account.

**Evidence files**

[replay-proofs.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.sql), [replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt), [db1-pro-settings-pricing-promo-field.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/db1-pro-settings-pricing-promo-field.png), [db1-promo-reach.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/db1-promo-reach.json)


### security-db-2: Promo codes can be brute-forced through PostgREST: no attempt limit, answers reveal which codes exist, and codes are admin-chosen words

**Severity:** high · **Verdict:** confirmed · **Root cause:** `promo-redeem-no-attempt-limit` · **Known in plan:** next-15 #2

**Where**

- supabase/migrations/20260819000000_security_hardening.sql:117-142
- supabase/migrations/20260820090000_advisor_security_cleanup.sql (GRANT EXECUTE ... redeem_promo_code_atomic(text) TO authenticated)
- supabase/functions/redeem-promo/index.ts:43-51 (no limit; logs the raw code and user id on every call, failures included, worded 'redeemed')
- supabase/functions/admin/index.ts:901-927 (create-promo accepts any string as the code, no length or entropy rule)

**What the reviewer saw**

Replay block P2, one authenticated attacker calling the RPC directly:
 NOPE1 -> 'Invalid or expired promo code'
 OLDCODE -> 'This promo code has expired'
 SCHOOLTRIAL -> 'Promo code applied!'
 SCHOOLTRIAL -> 'You've already redeemed this code'
The messages separate unknown, expired, already-redeemed and full codes, so dictionary guesses confirm real codes even when they can't be used. Nothing counts failures (no attempts table, no lockout). Any signed-in account, including a free trial or demo-code user, can POST /rest/v1/rpc/redeem_promo_code_atomic as fast as it likes. Codes are free text typed by the admin (AdminPage newPromo.code), e.g. school names. The lifetime_pro type exists. Still open as next-15 #2.

**Why it happens**

The rate limit was meant to live in SQL (the RPC is client-callable), but no per-user failure window was ever added, and the error messages give away whether a code exists.

**Suggested fix**

As next-15 #2 describes: add private.promo_redeem_attempts (user_id, created_at, success) and inside redeem_promo_code_atomic refuse after, say, 5 failures in 15 minutes, before the promo lookup. Return one generic message for unknown, expired, inactive and full codes. Keep 'already redeemed' only after the code is confirmed. Stop logging the raw code (log a hash or prefix). Optionally require at least 8 characters in create-promo, or offer a generate button like demo codes. Prove it with a pgTAP test: N failures lock the user, success resets, another user is unaffected.

**Who it hits**

Anyone with a free account can find and redeem trial, free-month or lifetime-Pro codes meant for specific schools, which is lost revenue and uses up max_redemptions for the real recipients.

**Independent check**

Known in plan: next-15 #2, still open. Evidence: code only. Wrong promo codes on staging are forbidden. redeem_promo_code_atomic returns four distinct messages (invalid, expired, already redeemed, usage limit; lines 123-126), so guesses confirm that a code exists. No attempts table or lockout exists anywhere in the migrations. EXECUTE is granted to authenticated (20260820090000:26-27), so any trial or demo account can call /rest/v1/rpc/redeem_promo_code_atomic directly. redeem-promo/index.ts:50 logs 'User X redeemed code CODE' with the raw code even when result.success is false. admin create-promo accepts free-text codes. I kept high because the lifetime_pro type exists and codes are guessable words. That is an inference, since production code entropy is not visible.

**Evidence files**

[replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt)


### security-edge-1: Unvalidated `feature` is written unbounded to ai_requests on every refused AI request (storage amplification, admin stats blow-up)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ai-feature-unvalidated-refusals-logged-unbounded`

**Where**

- supabase/functions/ai/index.ts:146 (feature cast, never checked against the Feature union)
- supabase/functions/ai/index.ts:188 (pre-auth log of feature)
- supabase/functions/ai/index.ts:218 + _shared/control-enforcement.ts:56-62 (ENUM_CONTROLS[feature] ?? {} lets unknown features pass)
- supabase/functions/ai/index.ts:506-525 (checkRateLimit then logUsage(userId, feature, ...,'rate_limited') on every refusal)
- supabase/functions/_shared/prompts/system.ts:61 (unknown feature throws only after the quota slot is consumed)
- supabase/migrations/20260129000000_init.sql:93-106 (ai_requests.feature text NOT NULL, no CHECK, no index on it)
- supabase/functions/admin/index.ts:273-290 (stats loads every ai_requests row in the window, feature included)

**What the reviewer saw**

Staging: an unauthenticated POST to ai with feature 'zz-review-unknown' got 401 'Authentication required', not 400. The unknown feature passes every pre-auth check (probe-auth.json). The code path after auth is as follows. readBoundedJsonBody allows 200,000 bytes, so `feature` can be about 199 KB. validateControlInput skips unknown features. For an expired or over-quota account, checkRateLimit returns not allowed, and line 525 inserts an ai_requests row whose feature column holds the whole string, with status 'rate_limited'. Nothing limits how many refused requests are logged. For an account with quota left, the unknown feature consumes one daily slot. buildSystemPrompt then throws 'Unsupported feature: <string>', which becomes a 500 and a second error row. The pre-auth log at line 188 also writes the string to function logs, with no session needed. ai_requests has no length CHECK and no index on feature (only idx_ai_requests_user_id), so 200 KB values are simply TOASTed and the insert succeeds. Admin `stats` pulls every row in its window, feature included, into the function's memory through collectAdminUsagePages.

**Why it happens**

Feature validation is implicit: it only happens when a handler or buildSystemPrompt rejects the value, which is after authentication, quota and logging. Refused requests are logged once each, and every client-supplied string goes in unbounded.

**Suggested fix**

In ai/index.ts, check `feature` against the 7-value Feature list (export it from _shared/prompts/common.ts) right after parsing, return 400 before logging, auth or quota, and delete the dead 'Fallback for any other feature' branch. Stop inserting one ai_requests row per rate-limited request; count refusals in the daily quota row or keep one counter per user per day. Add `CHECK (char_length(feature) <= 64)` (and similar caps on model and error_code) to ai_requests in a migration. Move the admin `stats` aggregation into a SQL RPC with GROUP BY.

**Who it hits**

Any signed-in account can do this: free trial, expired, demo-code or banned. A loop of about 10 requests a second adds roughly 2 MB/s, about 7 GB an hour, to ai_requests. That costs disk money and breaks the admin stats dashboard, which loads all rows. Legitimate users are unaffected until the database fills.

**Independent check**

Evidence: staging HTTP plus code. An unauthenticated POST ai with feature 'zz-review-unknown' returns 401, not 400, so the unknown feature passes every pre-auth check. End to end with a fresh expired session: POST ai with a 4,010-char feature returned 402 trial_expired. The account's own newest ai_requests row (readable through ai_requests_select_own) has status rate_limited, error_code trial_expired and featureLength 4010 (probe-api.json edge1_expired). Code: ai/index.ts:146 casts feature with no allowlist. validateControlInput uses ENUM_CONTROLS[feature] ?? {} (control-enforcement.ts:56). logUsage(..., 'rate_limited') runs on every refusal (index.ts:525), and logUsage inserts feature verbatim (entitlements.ts:200-240). The body cap is 200,000 bytes (request.ts:4). init.sql has no CHECK on feature, and no later migration adds one. model and error_code are already bounded (isModelSelection, fixed codes), so feature is the only unbounded column. Note for the fix: repetitive strings TOAST-compress to almost nothing, so the amplification needs random strings, which is easy. With model 'auto', an unknown feature on an account with quota would also trigger a paid router call before buildSystemPrompt throws.

**Evidence files**

[probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json), [probe-auth.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.mjs), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json), [probe-api.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/probe-api.mjs)


### security-edge-2: Seven Edge Functions never answer an unauthenticated POST over ~512 KB (#118 hold class), and ai's own reader is racy

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `edge-refuse-before-draining-request-body`

**Where**

- supabase/functions/voice/index.ts:63 (content-length over 8000 returns null without reading) and :113-119 (401 before the body is read)
- supabase/functions/ai-stream/index.ts:104-111 (401 before the body is read), :116 (unbounded req.json() after auth)
- supabase/functions/account/index.ts:115-117, admin/index.ts:98-105, announcements/index.ts:18, export-gdoc/index.ts:744-757 (refusal before the body is read)
- supabase/functions/ai/request.ts:116-121 (cancels at 200 KB without draining)
- supabase/functions/demo-code-login/index.ts:145 (unauthenticated, unbounded req.json())
- supabase/functions/workspace-invites (deployed on staging, same behaviour)

**What the reviewer saw**

Staging, unauthenticated POST with a 1,000,0xx-byte JSON body, 3 runs each, 75 s client timeout, load average 4.3 (probe-hold.json). admin, voice, ai-stream, announcements, account, export-gdoc and workspace-invites gave no response 3/3 (75,000 ms). The two #118-fixed functions answered quickly: share 401 in 92 ms median, import-source 401 in 149 ms median. ai at 300 KB: 413 at 161 ms, 413 at 172 ms, then no response once. The same functions answer 401 in under 1 s with a small body. Size threshold on voice (probe-threshold*.json): 401 in about 130 ms for 8-256 KB, 401 in 534 ms at 400 KB, no response within 40 s at 600 KB and 800 KB. ai-stream also accepted a 2 MB body from the expired account and answered 402 trial_expired. It parsed the body, so ai-stream has no size bound (probe-auth.json).

**Why it happens**

PR #118 added drain-before-refuse (discardRequestBody, readBoundedBody draining) only in share and import-source. The other functions read bodies with req.json() or private readers, and refuse before reading. The hosted runtime holds the response until the body has been consumed, roughly when it exceeds its buffer.

**Suggested fix**

Use one helper in every function: read the request with _shared/bounded-body.ts readBoundedBody(req, maxBytes, signal) before authenticating, or call discardRequestBody(req) before every early return (auth failure, 405, banned, quota). Replace ai/request.ts readBoundedJsonBody and voice's private readBoundedBody with the shared reader. Give ai-stream, account, admin, announcements, export-gdoc and demo-code-login explicit byte caps.

**Who it hits**

Anyone, with no account, can hold an Edge worker connection for up to the gateway's ~150 s with each ~1 MB request, instead of the ~100 ms a refusal should take. That is cheap resource exhaustion and invocation waste. Honest clients rarely send more than 512 KB, so normal users seldom see the hang.

**Independent check**

Evidence: staging HTTP. Unauthenticated ~1,000,010-byte POST, 60 s client timeout, load average 2.0-2.8. No response (60 s) from voice 3/3, ai-stream 3/3, account 3/3, admin 1/1, announcements 1/1, export-gdoc 1/1, workspace-invites 1/1. import-source answered 401 in 179 ms median (3/3). voice with a 1 KB body answered 401 (117 ms on the warm run). The ai function also holds: 300 KB got 413 3/3, 600 KB got no response 2/3 (one 413), 1 MB got no response 3/3. So ai's reader is size-dependent rather than racy: it cancels at 200 KB without draining (request.ts:116-121). Correction: share is verify_jwt=true on staging, because supabase/config.toml never lists it and the default applies, so its fast 401 comes from the gateway, not from #118's drain. import-source is the only function-level control. demo-code-login was deliberately not probed: any body records an invalid_format failure against the shared VPS IP. Code: voice/index.ts:63 returns null without reading when content-length > 8000, and auth runs before the read (113-119). ai-stream authenticates before req.json() and has no byte cap (104-116). account authenticates before readBody (119-120). share and import-source call discardRequestBody.

**Evidence files**

[probe-hold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-hold.json), [probe-threshold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-threshold.json), [probe-threshold-2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-threshold-2.json), [probe-hold.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-hold.mjs), [probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json), [probe-hold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-hold.json), [probe-hold-ai.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-hold-ai.json), [staging-functions-list.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/staging-functions-list.json), [probe-hold.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/probe-hold.mjs)


### security-edge-3: Raw upstream and runtime error text reaches students (OpenRouter bodies up to 16 KB, Deno fetch errors, JS RangeError), English-only

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `raw-error-messages-forwarded-to-users`

**Where**

- supabase/functions/ai/provider.ts:226 (throw new Error(`OpenRouter error: ${errorBody}`))
- supabase/functions/ai/index.ts:799 (returns err.message as {error} with status 500)
- supabase/functions/ai-stream/index.ts:282 (unbounded response.text() of the upstream error) and :359 (sent to the browser as an SSE error)
- supabase/functions/import-source/index.ts:339-342 (catch-all returns error.message)
- supabase/functions/export-gdoc/index.ts:863-887 (details: errorText from Google)
- supabase/functions/share/index.ts:170-175, admin/index.ts:750-762 (raw err.message on 500)
- src/lib/ai/client.ts:898-986 (isProviderErrorMessage matches only OpenAI|Anthropic|Google|Gemini, so the fallback is `AI service error: ${message}`)
- src/lib/ai/error-display.ts:60 (returns error.message verbatim)
- src/pages/LibraryPage.tsx:249-253 (import toast shows the raw message)

**What the reviewer saw**

Local repro (openrouter-error-passthrough.json): callAI against a stub server returning OpenRouter's 402 body throws `OpenRouter error: {"error":{"code":402,"message":"This request requires more credits... can only afford 3120... add more credits","metadata":{"provider_name":"Example"}},"user_id":"user_2zZZreviewEXAMPLE"}`. ai/index.ts:799 returns that string unchanged. mapAIError does not see 'OpenRouter' as a provider error, so the UI shows `AI service error: OpenRouter error: {...json...}. Please try again.` Staging import-source with the expired account (probe-auth.json): https://expired.badssl.com/ returned 400 `error sending request for url (https://expired.badssl.com/): client error (Connect): invalid peer certificate: Expired`. A public page containing &#99999999; returned 400 `Invalid code point 99999999`. LibraryPage shows both in a destructive toast. None of these strings is translated for Spanish or Hungarian users.

**Why it happens**

Functions forward exception messages as the user-facing error, and the client shows any error message it does not recognise.

**Suggested fix**

Server: catch upstream failures and return a fixed code plus a fixed English fallback: provider_unavailable, provider_quota, provider_rejected, source_unreachable, source_tls, source_parse_failed, google_update_failed. Log the raw body server-side, truncated, never in the response. Read ai-stream's error body with readResponseText and its byte cap. Client: map these codes to i18n strings in mapAIError, mapStreamingError and source-import, and never show a raw message from a 5xx.

**Who it hits**

Students see JSON blobs and runtime internals whenever OpenRouter errors, credits run low, or an imported site has a TLS problem. Each one also leaks operator state: credit balance, provider names, the OpenRouter user id.

**Independent check**

Evidence: staging HTTP, browser screenshot and code. Staging import-source with the expired account and https://expired.badssl.com/ returned 400 'error sending request for url (https://expired.badssl.com/): client error (Connect): invalid peer certificate: Expired'. In the real Library UI, the destructive toast 'Import Failed' shows that exact runtime string (screenshot). A page containing &#99999999; returned 400 'Invalid code point 99999999'. The OpenRouter path is code-only: provider.ts:226 throws 'OpenRouter error: ${errorBody}' (capped at 16,000 chars, research.ts:28), and ai/index.ts:799 returns it as a 500. Client: a 500 that does not match /OpenAI|Anthropic|Google|Gemini/ falls through to `AI service error: ${message}. Please try again.` (client.ts:976-984). The same branch produced the edge-4 toast, which proves the pass-through. Nuance: OpenRouter bodies that name a provider in metadata become AIProviderError and get the generic English mapping instead of raw JSON. ai-stream sends `await response.text()` of the upstream error, unbounded, as the SSE error (ai-stream:282, 351-353). Every fallback string is English-only.

**Evidence files**

[openrouter-error-passthrough.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/openrouter-error-passthrough.json), [openrouter-error.ts](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/openrouter-error.ts), [probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json), [edge3-library-import-tls-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/edge3-library-import-tls-toast.png), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json), [probe-hold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-hold.json), [browser-import-toast.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/browser-import-toast.mjs)


### security-edge-4: Prompt-injection regex rejects legitimate debate text ('you are now an adult', 'jailbreaking') with an accusatory error

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `prompt-injection-keyword-blocklist`

**Where**

- supabase/functions/ai/request.ts:7-24 (PROMPT_INJECTION_PATTERNS incl. /you\s+are\s+now\s+(a|an)\s+/i and /jailbreak/i)
- supabase/functions/ai/request.ts:26-73 (applied to every string field of input and every history item's content)
- supabase/functions/ai/index.ts:212-216 (400 'Suspicious content detected in <field>')

**What the reviewer saw**

Staging, unauthenticated, so no quota or AI was used (probe-auth.json). POST ai {feature:'attack', input:{argument:'At 18 you are now an adult, so you should be able to vote.'}} returned 400 {"error":"Suspicious content detected in argument"}. POST ai {feature:'generate', input:{motion:'This House would legalise jailbreaking smartphones'}} returned 400 {"error":"Suspicious content detected in motion"}. The client has no matching pre-check (grep of src finds none). mapAIError turns this into 'AI service error: Suspicious content detected in motion. Please try again.', and retrying can never succeed. A Current Debate whose motion contains one of these phrases breaks every non-streaming tool for that debate. ai-stream (streaming Ask) skips the list, so the same text works there.

**Why it happens**

A keyword blocklist stands in for a prompt boundary. Debate speeches address the audience as 'you', and motions can be about jailbreaking or AI safety.

**Suggested fix**

Delete PROMPT_INJECTION_PATTERNS and the rejection branch in sanitizePromptInput. Keep control-character and zero-width stripping, and the 50,000-character truncation. The real defence already exists: role-separated messages, UNTRUSTED_CONTENT_RULES, neutralizeStructureTags. ai-stream already runs without the list. Update ai tests that assert rejection.

**Who it hits**

Any student whose motion, opponent speech or question contains a listed phrase is blocked from Generate, Attack, Brainstorm, Factoids, non-streaming Ask, Sparring and Crossfire, and is told their content is suspicious.

**Independent check**

Evidence: staging HTTP and browser screenshot, at zero AI cost because the filter runs before auth (index.ts:212 vs requireUser at 279). Unauthenticated attack {argument:'At 18 you are now an adult...'} returned 400 'Suspicious content detected in argument'. generate {motion:'...legalise jailbreaking smartphones'} returned 400 '...in motion'. The control with 'you become an adult' returned 401. Real UI on the pro account: Attack page, a realistic speech containing 'At 18 you are now an adult', Find Weaknesses. The server answered 400 and the toast reads 'Attack Analysis Failed / AI service error: Suspicious content detected in caseText. Please try again.', which leaks the internal field name and invites a retry that can never succeed (screenshot). Correction to scope: the Current Debate motion loaded server-side through debateContext does not pass sanitizeInput. Breakage happens where the phrase is inside `input`: generate, brainstorm and sparring send motion, attack sends caseText, and crossfire uses sanitizePromptInput (crossfire-input.ts:31). Streaming Ask (ai-stream) has no blocklist.

**Evidence files**

[probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json), [edge4-attack-suspicious-content-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/edge4-attack-suspicious-content-toast.png), [edge4-attack-toast.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/edge4-attack-toast.json), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json), [browser-injection-toast.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/browser-injection-toast.mjs)


### security-edge-5: Share links survive 'Delete All My Data', cannot be revoked by owner or admin, and banned users can still publish

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `share-links-not-erased-or-revocable`

**Where**

- supabase/migrations/20260926090000_current_debates.sql:237-250 (latest clear_current_user_data deletes cases...debates but not shared_items)
- src/locales/en.json:478,483 ('permanently deletes all cases, attacks, brainstorms, factoids, chats, and sources' / 'All your saved data has been permanently removed.')
- supabase/functions/share/index.ts:51-181 (create only, with no delete or list action and no checkUserBanned)
- supabase/migrations/20260819000000_security_hardening.sql:55-57 (all privileges on shared_items revoked from anon/authenticated, so only the service role can delete)
- supabase/functions/share/index.ts:136 (title stored unvalidated: any JSON type, any length up to 512 KB)

**What the reviewer saw**

Code: shared_items rows are deleted only through the ON DELETE CASCADE on account deletion (20261001100000:21-24). 'Delete All My Data' (session-store.ts:1198 calls clear_current_user_data) leaves every share of a case, chat or source set publicly readable through get_shared_item until expires_at: 30 days by default, 90 if requested. Nothing in supabase/functions or src deletes from shared_items (grep), so a student who shares a chat by mistake cannot unshare it, and an admin cannot take a share down. share/index.ts never calls checkUserBanned, while import-source, ai and voice all do.

**Why it happens**

Share links were added as standalone capability rows, and the deletion and moderation paths never caught up.

**Suggested fix**

Add `DELETE FROM public.shared_items WHERE created_by = v_user_id;` to clear_current_user_data in a new migration, with a pgTAP assertion. Add a revoke action to the share function (POST {action:'revoke', shareCode}, checking created_by = caller) and a 'Shared links' list in Settings. Add the checkUserBanned gate before quota. Validate that title is a string of at most 200 characters.

**Who it hits**

Students, mostly minors in the EU, are told their data is gone while public copies stay live. There is no takedown path for abusive shares published under debate.pi-stack.org.

**Independent check**

Evidence: code only. The staging rules forbid Delete All My Data, and a share created on staging could not be deleted, which is the finding. The latest clear_current_user_data (20260926090000_current_debates.sql:219-255; no later redefinition) deletes 14 tables and not shared_items. Clients hold no privileges on shared_items (20260819:57; 20260923191320 grants it only to service_role). The share function is create-only, and grep finds no delete path in src or supabase/functions. Only the account-deletion cascade removes shares (20261001100000:21-24). Shares last 30 days by default, 90 at most (share/index.ts:12-13). share/index.ts never calls checkUserBanned, so banned users can still publish. title is stored as given (line 136) into a text column, bounded only by the 512 KB body. en.json deleteDialogDesc and deleteSuccessDesc promise everything is removed. security-db-4 is the same cause and fix.


### security-edge-6: Demo-code IP lockout counts its own refusals as failures, so a class behind one school NAT stays locked while it retries; IP source unverified

**Severity:** medium · **Verdict:** partly · **Root cause:** `demo-lockout-counts-own-refusals`

**Where**

- supabase/functions/demo-code-login/index.ts:84-116 (counts success=false rows for the IP and the fingerprint over 15 min)
- supabase/functions/demo-code-login/index.ts:148-150 (each rate_limited refusal is recorded as success=false)
- supabase/functions/_shared/demo-code.ts:29 (threshold 10)
- supabase/functions/demo-code-login/index.ts:47-58 (IP = last X-Forwarded-For entry)

**What the reviewer saw**

Code review only; the task forbids sending wrong codes to staging. A request is refused while 10 or more success=false rows for that IP exist in the trailing 15 minutes. invalid_format, not_found and rate_limited rows all count, and each refusal adds a rate_limited row. One student retrying cannot keep the lock alive. A classroom sharing one NAT IP can: about 10 typos across the class trips it, and while students keep trying, their own refusals keep 10 or more failures in the window, so everyone on that IP is locked out until the whole class stops for 15 minutes. Separately, getIpAddress trusts the right-most X-Forwarded-For entry. If Supabase's edge appends its own hop last, every caller shares one bucket and 10 failures anywhere lock demo login globally. I could not verify this read-only.

**Why it happens**

The brute-force counter counts its own refusals, and the IP bucket assumes one person per IP. School networks break that assumption.

**Suggested fix**

Exclude failure_reason='rate_limited' (and invalid_format, which reveals nothing about valid codes) from the failure count. Key the IP limit per (ip, code_hash), or raise it well above a class size, and keep a strict per-fingerprint limit. Codes have 40 bits of entropy, so a looser per-IP limit is still safe. In the PR, log the raw x-forwarded-for layout once from a test function to confirm which entry is the client.

**Who it hits**

Teachers onboarding a class with a demo code can find the whole class stuck on 'Too many attempts. Try again later.' If the XFF assumption is wrong, the lockout is global.

**Independent check**

Evidence: code only. Sending wrong or empty codes to staging is forbidden, and any POST to demo-code-login records a failure against the shared IP. Confirmed: rate-limited refusals are recorded as success=false with failure_reason 'rate_limited' (demo-code-login/index.ts:148-150). isRateLimited counts every success=false row per IP and per fingerprint over 15 minutes (84-116), with threshold >= 10 (_shared/demo-code.ts:29). So the lockout feeds itself. Correction: the reviewer says one student retrying cannot keep it alive, but a single client retrying 10 or more times per 15 minutes also keeps itself locked. The UI hint 'Enter the code provided by your event host' (en.json demoCodeHint) makes the shared-venue NAT case realistic. Not verified: whether the right-most X-Forwarded-For entry is the client or a Supabase hop. That would make the lockout global, and it cannot be tested within the rules.


### security-edge-13: Daily quotas are consumed by requests that never reach a model or that fail upstream

**Severity:** medium (reviewer said low) · **Verdict:** confirmed · **Root cause:** `quota-reserved-before-validation-never-released`

**Where**

- supabase/functions/ai/index.ts:506 (quota reserved before unknown-feature failure and before provider calls; no refund path)
- supabase/functions/_shared/control-enforcement.ts:166-172 (Generate throws on short contention count after the call)
- supabase/functions/import-source/index.ts:259-273 (import quota reserved before the body is read or the URL validated)

**What the reviewer saw**

Code: consume_daily_quota runs before the feature is validated and before the provider call. No code decrements it on a provider error, a timeout, or the 'Generate response returned N contentions' throw (grep for refund or release finds only voice, which keeps clips on purpose). Staging: each of my 8 refused import-source probes (file:, private IPs, redirects) used one of the expired account's 50 daily imports, because the quota is taken before validatePublicHttpUrl.

**Why it happens**

Quota is reserved at the top of the handler, and no handler gives it back.

**Suggested fix**

Validate the feature, controls and URL before reserving. For AI, decrement the slot when the provider returns an error with no billed usage, and on Generate post-validation failures. Or retry those once inside the same slot. For import, reserve after validatePublicHttpUrl.

**Who it hits**

A trial student (5 a day) can lose a day's requests to an OpenRouter outage or a short model reply, and sees a raw error each time (see security-edge-3).

**Independent check**

Evidence: code only. Forcing provider failures on staging would spend shared quota. checkRateLimit calls consume_daily_quota (entitlements.ts:172-175) at ai/index.ts:506, before feature validation, model routing and the provider call. A repo-wide grep for 'request_count - 1|release_daily|refund' in migrations and functions finds no release path. Generate throws after the call when contentions fall short (control-enforcement.ts:166-172), and the slot is spent. import-source reserves its quota (line 259) before reading the body or calling validatePublicHttpUrl (line 295). My 4 import probes each took an expired-account slot. With a trial limit of 5 a day, every upstream failure costs 20% of the day. Raised from low to medium because most students are on trial. security-db-6 is the same cause and fix for AI.

**Evidence files**

[probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json)


### security-db-4: 'Delete All My Data' leaves the user's public share links live, and shares can't be revoked at all

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `share-links-not-erased-or-revocable` · **Same fix as:** security-edge-5

**Where**

- supabase/migrations/20260926090000_current_debates.sql:219-255 (clear_current_user_data: deletes 14 tables, not shared_items)
- supabase/migrations/20260819000000_security_hardening.sql:52-70 (shared_items: no client privileges; get_shared_item serves any unexpired code to anon)
- supabase/functions/share/index.ts:12-14,101-140 (30-day default, 90-day max, no delete action)
- src/locales/en.json:475-483 ('Permanently delete all your saved data' / 'All your saved data has been permanently removed.')

**What the reviewer saw**

Replay block P7: victim has 1 debate and 1 share (item_data is a copy of a case). After clear_current_user_data(): debates_left=0, shares_left=1, and as anon get_shared_item('code-1') still returns 'Shared case'. The share function has no delete or revoke path, clients hold no privileges on shared_items, and the Settings UI offers nothing, so a student who regrets sharing waits up to 30 or 90 days. Account deletion does cascade shares (FK changed to ON DELETE CASCADE in 20261001100000), so only the erase path and revocation are affected.

**Why it happens**

shared_items was left out when clear_current_user_data was extended, and shares were built create-only.

**Suggested fix**

Add DELETE FROM public.shared_items WHERE created_by = v_user_id; to clear_current_user_data in a new migration, and extend account_deletion_test or a clear-data pgTAP test to assert it. Add a 'Stop sharing' action: either a share function DELETE path that checks created_by, or a SECURITY DEFINER revoke_share(code) RPC. Optionally purge expired shares on a schedule.

**Who it hits**

Students (mostly minors) who erase their data still have full copies of their cases, chats or sources reachable by anyone with the link, which contradicts the success message and the privacy page.

**Independent check**

Evidence: code only (see security-edge-5). clear_current_user_data at 20260926090000:219-255 has no DELETE on shared_items, there is no revoke path, and get_shared_item serves any unexpired code to anon (20260819:59-70). Same fix as security-edge-5.

**Evidence files**

[replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt)


### security-db-5: Anyone holding the public anon key can write unbounded rows into keepalive_events and overwrite the heartbeat; client-writable tables have no size caps

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `keepalive-anon-table-writes-unbounded`

**Where**

- supabase/migrations/20260820070000_reconcile_prod_only_objects.sql:150-170 (keepalive_events_anon_insert WITH CHECK only on source; keepalive_heartbeat_anon_update; GRANT ALL TO anon)
- supabase/migrations/20260923191320_explicit_legacy_table_grants.sql:31 (anon USAGE on keepalive_events_id_seq)
- supabase/migrations/20260129000000_init.sql (cases/attacks/brainstorms/factoids input/output jsonb, sources.content, messages.content: no length CHECKs; only debates has them)

**What the reviewer saw**

Replay block P6: as anon, three rows with a 1 MB details payload each were accepted (2930 kB). The only check is source = 'external-keepalive-monitor', which any caller can send. There is no length CHECK on details, no rate limit and no pruning. Staging (staging-keepalive-anon-read.json): anon can read the table, it holds 554 rows (oldest 2026-06-20, newest 2026-10-08T12:25Z), and the external monitor still writes, so the anon path is live. Anon can also PATCH keepalive_heartbeat rows (policy keepalive_heartbeat_anon_update), so an outsider can fake the monitor's heartbeat or hide an outage. On staging, the 'rpc-keepalive' heartbeat touched_at equals the newest event's created_at to the microsecond. That points to a server-side function or trigger in the same transaction that no migration contains, so there is probably more unrecorded drift. Separately, any signed-up account can store unlimited bytes in cases, sources, messages and flowcharts, and the client re-downloads all of it on every load (security-db-7).

**Why it happens**

An uptime pinger was given direct anonymous table writes instead of a narrow RPC, and user-writable tables were never given size bounds.

**Suggested fix**

Replace both keepalive policies with one SECURITY DEFINER keepalive() RPC (EXECUTE granted to anon) that upserts a single heartbeat row with now() and stores no client payload, then REVOKE INSERT, UPDATE and DELETE on both tables from anon and authenticated (or drop keepalive_events entirely and keep only the heartbeat). Capture whatever function or trigger currently touches 'rpc-keepalive' in a migration. Add CHECK (octet_length(...) <= N) bounds on the large text and jsonb columns of client-writable tables (cases/attacks/brainstorms/factoids/crossfires input and output, sources.content, messages.content, flowcharts nodes and edges, user_settings.feature_configs and custom_system_prompt), sized to what the app can produce.

**Who it hits**

An unauthenticated script can fill the database disk, causing a read-only outage or paid disk growth, and can fake the uptime signal. Low effort, since the anon key ships in the JS bundle.

**Independent check**

Evidence: code plus staging anon reads. No writes were attempted. 20260820070000:150-170: keepalive_events_anon_insert checks only source = 'external-keepalive-monitor', details is unbounded jsonb, keepalive_heartbeat_anon_update lets anon rewrite heartbeat rows, and both tables get GRANT ALL TO anon. Sequence USAGE is granted to anon at 20260923191320:31. Staging anon SELECT works: 554 rows, id 1 at 2026-06-20T05:24Z to id 554 at 2026-10-08T12:25:27.079212Z, so the policies and grants are live there. The rpc-keepalive heartbeat touched_at equals the newest event's created_at to the microsecond (12:25:27.079212). That points to a server-side writer in the same transaction that no migration defines, which is more undocumented drift. The INSERT itself was not exercised (writes are forbidden). The policy is unambiguous. The sub-claim that client tables lack size CHECKs is plausible from init.sql, but I did not verify it table by table.

**Evidence files**

[replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt), [staging-keepalive-anon-read.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/staging-keepalive-anon-read.json), [staging-anon-table-probes.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/staging-anon-table-probes.json), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json)


### security-db-6: A reserved daily quota slot is never released, so provider failures and timeouts use up a trial user's requests

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `quota-reserved-before-validation-never-released` · **Same fix as:** security-edge-13

**Where**

- supabase/migrations/20260920125555_scope_daily_usage_counters.sql:18-55 (consume_daily_quota: increment only, no release counterpart)
- supabase/functions/_shared/entitlements.ts:172-193 (slot reserved before the provider call)
- supabase/functions/ai/index.ts:503-530 and supabase/functions/ai-stream/index.ts:177 (checkRateLimit runs before the model call; no decrement on failure)

**What the reviewer saw**

Every migration was searched: no function decrements daily_usage_counters. A grep of supabase/functions for request_count, refund and release_quota found only consume_daily_quota callers (entitlements.ts, import-source, share, voice, crossfire-input). The reservation happens inside checkRateLimit before any provider work, and logUsage records the failure as status 'error' without touching the counter. A trial user has a 5/day limit (entitlements.ts:111), so each upstream 5xx, timeout or parse failure costs 20% of their day.

**Why it happens**

Quota reservation was made atomic, but no compensating release was designed for requests that fail before they produce any billable output.

**Suggested fix**

Add release_daily_quota(p_user_id, p_quota_key), service_role only, which does UPDATE ... SET request_count = request_count - 1 WHERE user_id = p_user_id AND usage_date = CURRENT_DATE AND quota_key = p_quota_key AND request_count > 0. Call it from ai and ai-stream only when the provider returned an error before any tokens were billed (no usage object), and never for user aborts after streaming began. Add a pgTAP test covering release, the zero floor and the date boundary.

**Who it hits**

Trial and Pro users on flaky days see 'You've used all N of your daily requests' after failed attempts that gave them nothing, and that drives support tickets.

**Independent check**

Evidence: code only. consume_daily_quota only ever increments (20260819:25-45, re-scoped in 20260920125555), and grep finds no decrement or release in migrations or functions. ai (index.ts:506) and ai-stream reserve before the provider call and only log failures. Same fix as security-edge-13.


### security-db-7: Hydration reads every row of every table with no limit, so PostgREST's 1000-row cap silently drops data and a failed messages query blanks every chat

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `hydration-unbounded-whole-table-reads`

**Where**

- src/lib/stores/session-store.ts:1082-1092 (nine unbounded select('*') queries)
- src/lib/stores/session-store.ts:1118-1123 (messages .in('chat_id', allChatIds).order('created_at', ascending) across all chats)
- src/lib/stores/session-store.ts:1135-1153,1183 (a failed messages query leaves every chat with data: [] while chats are replaced)
- src/lib/stores/sparring-store.ts:487-497 (unbounded, then sets historyComplete: true)

**What the reviewer saw**

supabase/config.toml has no [api] section, so max_rows is Supabase's default of 1000 for hosted projects. A capped response returns the first 1000 rows of the ordered set without an error. Messages are ordered ascending across all chats, so a user past 1000 total messages loses the newest ones in the UI. sources and results (ordered descending) lose the oldest, and sparring history is then marked historyComplete. If the messages query fails (network, 5xx, or a 414 once hundreds of chat UUIDs at ~37 bytes each make the URL too long), messagesRes is null, every chat is rebuilt with data: [], savedChats is replaced, and the result is persisted to localStorage, although the comment says a failed list keeps its last state. serverHydration does not consider messages. Not reproduced live: no seeded account has more than 1000 rows.

**Why it happens**

Hydration assumes small accounts and fetches whole tables in one request, relying on RLS alone for filtering and on PostgREST returning everything.

**Suggested fix**

Scope hydration to the Current Debate plus Unsorted, select the list columns only (not content or output), and page with .range() until a short page comes back, or use count=exact and compare. Fetch messages per chat when a chat is opened, using an index on messages (chat_id, created_at). Treat a failed messages query like the other failed lists: keep each chat's previous data and mark hydration partial.

**Who it hits**

Heavy users, such as a student using Ask all term, see missing recent messages or sources with no error shown. Any transient failure makes their chat history look empty until the next reload.

**Independent check**

Evidence: browser repro, staging config and code. The blanking path reproduced on the pro account (4 chats, 10 messages) with /rest/v1/messages aborted in this browser only. History > Chats went from '2 messages' each to '0 messages' for all three chats in scope, and Resume opens an empty 'Start a conversation' view (screenshots). Code: settledData returns null on failure, messageRows becomes [], and savedChats is still replaced because chatsData is non-null (session-store.ts:1118-1123, 1135-1153, 1183). serverHydration ignores messages. The Management API shows staging PostgREST max_rows = 1000 (staging-postgrest-config.json), and all nine lists plus messages are unbounded select('*'), so the silent cap applies. Messages are ordered ascending across all chats, so the newest drop first. The 1000-row truncation itself is not reproduced live, since no account has more than 1000 rows.

**Evidence files**

[db7-history-chats-normal.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/db7-history-chats-normal.png), [db7-history-chats-messages-failed.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/db7-history-chats-messages-failed.png), [db7-ask-opened-chat-messages-failed.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/raw/db7-ask-opened-chat-messages-failed.png), [db7-messages-blank.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/db7-messages-blank.json), [staging-postgrest-config.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/staging-postgrest-config.json), [browser-messages-blank.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/browser-messages-blank.mjs)


### security-edge-7: import-source HTML parser: catastrophic regex backtracking with the deadline already cleared, and an out-of-range entity crashes the import

**Severity:** low · **Verdict:** confirmed · **Root cause:** `import-parser-regex-unbounded-and-entity-crash`

**Where**

- supabase/functions/import-source/index.ts:313 (deadline cleared before parsing) and :315 (stripHtml/normalizeText run with no time bound)
- supabase/functions/import-source/index.ts:125-126 (getMeta regex: [^>]* twice within one tag)
- supabase/functions/import-source/index.ts:141-160 (stripHtml lazy [\s\S]*? with backreferences)
- supabase/functions/import-source/index.ts:111-120 (decodeEntities String.fromCodePoint without a range check)

**What the reviewer saw**

Local Deno run over a copy of the parser functions, load average 8.7 (import-parser-timing.txt). Real pages truncated to the 1 MB cap parse fast: BBC 13-26 ms, Guardian 16-17 ms, two Wikipedia pages 25-38 ms. Crafted inputs: 320 KB of an unclosed `<meta  name='og:title'...` took 13.7 s; 750 KB of `<nav>` took 37.6 s; 1 MB of unclosed `<div class="content">` took 3.6 s. Staging: importing https://httpbin.org/base64/<html with &#99999999;> returned 400 'Invalid code point 99999999' (probe-auth.json). Any page with one malformed numeric entity cannot be imported at all.

**Why it happens**

Regex-based HTML extraction runs over attacker-chosen input, the 10 s deadline does not cover it, and the entity decoder trusts numeric values.

**Suggested fix**

In decodeEntities, return U+FFFD when code > 0x10FFFF or is a surrogate. Replace the regex extraction with a linear parser (deno-dom or linkedom, parsed once), or rewrite the patterns to scan tag-local text with no nested quantifiers. Keep the deadline running through parsing, and return 422 when it fires.

**Who it hits**

A hostile page stalls an import worker until the hosted CPU limit kills it, which can also delay other users' imports on that worker. Each attempt uses one of the attacker's 50 daily imports. Legitimate pages with a stray bad entity fail with a cryptic error.

**Independent check**

Evidence: staging HTTP plus local timing of my own copy of the parser (lines 105-233 of import-source/index.ts). Staging: importing an httpbin page with &#99999999; returned 400 'Invalid code point 99999999' (probe-hold.json edge7_import_bad_entity). My first attempt got 422 because httpbin rejected base64url, a probe error and not a refutation. Locally, the bad entity throws RangeError. getMeta on a repeated unclosed "<meta name='og:title' " is roughly cubic: 11 KB 1.3 s, 22 KB 8.2 s, 44 KB 63.7 s. The cap is 1 MB (resource-limits.ts:3). stripHtml on unclosed <nav> is quadratic: 100 KB 0.64 s, 200 KB 2.36 s. The reviewer's 320 KB space-padded meta case did not reproduce (6-10 ms) because spaces do not trigger it, but the repeated-tag form does. clearTimeout(deadlineTimer) runs at line 313, before parsing at 315. Load average was about 2 during timing.

**Evidence files**

[import-parser-timing.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/import-parser-timing.txt), [import-parser-timing.ts](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/import-parser-timing.ts), [import-parser-copy.ts](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/import-parser-copy.ts), [probe-auth.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-auth.json), [import-parser-timing.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/import-parser-timing.json), [import-parser-meta-timing.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/import-parser-meta-timing.json), [probe-hold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-hold.json), [parser-copy.ts](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/parser-copy.ts), [meta-timing.ts](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/scripts/meta-timing.ts)


### security-edge-8: Sparring, crossfire-signal and voice signing keys fall back to the service-role key; SPARRING_INTEGRITY_SECRET is unset on staging

**Severity:** low · **Verdict:** confirmed · **Root cause:** `signing-secrets-fallback-to-service-role`

**Where**

- supabase/functions/ai/runtime.ts:35-36
- supabase/functions/_shared/voice-token.ts:55-57
- supabase/functions/ai/features/crossfire-input.ts:223-233 (HMAC keyed with sparringIntegritySecret)
- supabase/functions/ai/index.ts:463-467 (also accepts tokens keyed with the raw service-role key)
- supabase/functions/_shared/demo-code.ts:52
- scripts/backend-status.mjs:26-29 (does not flag the missing secrets)

**What the reviewer saw**

`supabase secrets list --project-ref brifeyypjauyusmkptkx -o json | jq -r '.[].name'` (names only) shows DEMO_CODE_PEPPER but no SPARRING_INTEGRITY_SECRET. On staging, sparring transcript integrity, crossfire signal tokens and voice tokens are therefore all HMACs derived from SUPABASE_SERVICE_ROLE_KEY. docs/standards/security.md says: 'One secret, one purpose. Do not derive signing keys from the service-role key; rotating it would break every outstanding token (#13)'. supabase/README.md:175 documents the fallback. Production was not checked (off limits).

**Why it happens**

An optional secret with a silent fallback, which the drift check does not report.

**Suggested fix**

Set SPARRING_INTEGRITY_SECRET (and confirm DEMO_CODE_PEPPER) on staging and production; this needs Adam's authorisation. Then make both required: fail closed at module load, drop the service-role entry from the verify key list, and add both to EXPECTED_SECRETS in scripts/backend-status.mjs.

**Who it hits**

Rotating the service-role key silently invalidates in-flight sparring rounds and voice segments, and every demo code where the pepper is unset. The most powerful credential also does double duty as an HMAC key.

**Independent check**

Evidence: staging secret names only, plus code. `supabase secrets list --project-ref brifeyypjauyusmkptkx` shows DEMO_CODE_PEPPER present and SPARRING_INTEGRITY_SECRET absent. So sparring integrity (runtime.ts:35-36, derived from the service-role key), crossfire signal tokens (crossfire-input.ts:223-233) and voice tokens (voice-token.ts:55) all key off SUPABASE_SERVICE_ROLE_KEY on staging. ai/index.ts:463 also accepts MACs keyed with the raw service-role key. The fallback is documented on purpose (supabase/README.md:173; backend-status.mjs:26-29 deliberately leaves both names out of EXPECTED_SECRETS), but it contradicts docs/standards/security.md:18. Production not checked.

**Evidence files**

[backend-status-staging.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/backend-status-staging.txt), [staging-secret-names.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/staging-secret-names.txt)


### security-edge-9: Account delete and export need only a bearer token; every holder of a multi-use demo code is the same account

**Severity:** low · **Verdict:** partly · **Root cause:** `destructive-account-actions-no-reauth`

**Where**

- supabase/functions/account/index.ts:118-136 (the confirmation is the caller's own email or 'DELETE'; no recent-auth check)
- supabase/functions/demo-code-login/index.ts:244-256 (one auth user per code email; later uses sign into the same user)

**What the reviewer saw**

Code: an access token, valid for up to an hour, plus the account's email is enough to export everything or delete the account. The typed confirmation only gates the UI. demo-code-login maps a code to a single email and user. With max_uses > 1, every person who redeems the code is the same auth user. Any of them can read the others' chats and cases through 'Download my data' or the app itself, or delete the shared account; the next login recreates it empty.

**Why it happens**

Destructive account actions trust any live session, and demo codes model a shared login rather than one user per redemption.

**Suggested fix**

Require a fresh authentication for delete: reject when the JWT's auth_time or iat is older than about 10 minutes, or require a just-sent email OTP. Disable account delete and export for demo-code users (app_metadata.demo_access_code_id), or create one user per redemption. Show the shared nature in the admin demo-code form.

**Who it hits**

A leaked or shared-device token can wipe a student's account. If a teacher hands one demo code to a class, students see and can destroy each other's work.

**Independent check**

Evidence: code only. Delete or export of the account needs no live repro. Confirmed: account/index.ts:118-136 accepts any valid bearer token, and the confirmation is just user.email or 'DELETE' (deletionConfirmation, line 35). There is no recent-auth or auth_time check. That is common practice and low risk. Partly: one auth user per demo code, shared by every redemption (demo-code-login/index.ts:244-256), is documented design ('Existing demo accounts are reusable only when ... bound to that code', docs/architecture.md:121). The 'teacher gives one code to a class' scenario is a usage assumption, not a bug in the flow. A max_uses > 1 code does, however, mean every holder sees and can delete the same data, and the admin form does not say so.


### security-edge-10: CORS: export-gdoc allows any localhost/LAN origin in production; preview pattern trusts any matching *.vercel.app host; no Vary: Origin

**Severity:** low · **Verdict:** confirmed · **Root cause:** `cors-dev-origins-in-prod-path`

**Where**

- supabase/functions/export-gdoc/index.ts:733 (getCorsHeaders(origin, { allowDevOrigins: true }))
- supabase/functions/_shared/cors.ts:27-28 (VERCEL_PREVIEW_ORIGIN regex)
- supabase/functions/_shared/cors.ts:73-87 (origin echoed without Vary)

**What the reviewer saw**

Staging preflights (probe-cors.json). export-gdoc echoes Access-Control-Allow-Origin for http://192.168.1.5:8080 and http://localhost:4444. All 10 functions using the shared CORS helper echo https://debate-navigator-zz-review-probe-adam-gaborjanis-projects.vercel.app; workspace-invites has its own list and does not. https://evil.example and http://localhost.evil.com correctly get the fallback origin. Responses carry only 'Vary: Accept-Encoding'. Whether another Vercel account can claim a single-label name like debate-navigator-<x>-adam-gaborjanis-projects.vercel.app is unverified.

**Why it happens**

On-device testing flags were left on in the production code path, and the preview allowlist uses a broad pattern.

**Suggested fix**

Remove allowDevOrigins from export-gdoc, or read it from an env var that only local stacks set. Add 'Vary: Origin' to getCorsHeaders. Optionally tighten the preview regex to Vercel's generated hash segment (e.g. -[a-z0-9]{9}-adam-gaborjanis-projects).

**Who it hits**

Low today. Auth is bearer-only, so an allowed origin gains nothing without a stolen token. It does widen the trusted-origin set, which demo-code-login also reuses for magic-link redirectTo.

**Independent check**

Evidence: staging HTTP preflights. export-gdoc echoed Access-Control-Allow-Origin for http://192.168.1.5:8080 and http://localhost:4444. ai fell back to https://debate.pi-stack.org for the LAN origin and for https://evil.example. ai echoed the lookalike https://debate-navigator-zz-review-probe-adam-gaborjanis-projects.vercel.app. Every response carried only 'Vary: Accept-Encoding'. Code: export-gdoc/index.ts:733 passes allowDevOrigins:true, and cors.ts:27-28 is the broad preview regex. Impact stays low because auth is bearer-only. Missing Vary: Origin matters only if a cache sits in front, which is nit-level.

**Evidence files**

[probe-cors.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-cors.json), [probe-cors.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-cors.mjs), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json)


### security-edge-11: Web research page text enters prompts with no untrusted-content boundary

**Severity:** low · **Verdict:** confirmed · **Root cause:** `web-research-outside-untrusted-boundary`

**Where**

- supabase/functions/_shared/research.ts:575-598 (buildResearchContext concatenates Exa page text as plain text)
- supabase/functions/ai/features/generate.ts:79-84 (searchContext goes into the user message)
- supabase/functions/_shared/prompts/context.ts:16-21 (UNTRUSTED_CONTENT_RULES names only <current-debate> and <source>)
- supabase/functions/_shared/prompts/system.ts:79 (rules added only when sources or debate context are present)

**What the reviewer saw**

Code: up to 5 fetched pages × 4,000 characters, plus search snippets from arbitrary websites, are inserted under '=== WEB RESEARCH RESULTS ===' with no delimiting tags, no neutralizeStructureTags, and no rule saying this text is data and never instructions. A Generate request with no Library sources and no debate context gets no untrusted-content rules at all, even though research ran.

**Why it happens**

The untrusted-content boundary was designed for student material, and third-party web text was never brought inside it.

**Suggested fix**

Render each search result and page inside <web-result url=... quality=...> blocks passed through neutralizeStructureTags (and add web-result to STRUCTURE_TAG). Add a line to UNTRUSTED_CONTENT_RULES covering web results, and include the rules whenever researchContext is set.

**Who it hits**

A page crafted for Exa's index can steer case or factoid output: false framing, or instructions to drop citations. The impact is limited to misleading content shown to the student; no data crosses users.

**Independent check**

Evidence: code only. buildResearchContext (research.ts:573-596) concatenates search results and up to 4,000 chars of each page as plain text, with no tags and no neutralizeStructureTags. UNTRUSTED_CONTENT_RULES (prompts/context.ts:16-21) names only <current-debate> and <source>. buildSystemPrompt adds those rules only when sources or debateContext exist (system.ts:79). RESEARCH_RULES (common.ts:50-54) cover citation quality only, not 'treat this as data'. Most tool runs happen inside a Current Debate, so the rules are usually present. They just do not cover web text.


### security-edge-12: export-gdoc returns success with an empty Google Doc when batchUpdate fails

**Severity:** low · **Verdict:** confirmed · **Root cause:** `gdoc-batchupdate-failure-swallowed`

**Where**

- supabase/functions/export-gdoc/index.ts:903-930

**What the reviewer saw**

Code: after the document is created, a failed batchUpdate (`!batchUpdateResponse.ok`) is only console.error'd. The function then returns 200 {success:true, documentUrl}, so the student opens a blank document titled 'Debate Case' or similar.

**Why it happens**

Content insertion failures are logged and never returned to the caller.

**Suggested fix**

Return 502 {code:'GOOGLE_DOC_UPDATE_FAILED'} with a localized client message. Optionally delete the empty document through the Drive API (needs drive.file scope), or return its URL marked as partial.

**Who it hits**

Students who rely on Google Docs export for class submissions occasionally get an empty doc with a success toast.

**Independent check**

Evidence: code only. Google export needs real OAuth, which is not available. export-gdoc/index.ts:902-918: when batchUpdate returns !ok, the function only calls console.error, then returns 200 {success:true, documentUrl} (920-929).


### security-edge-14: Student debate text is written to Edge Function logs

**Severity:** low · **Verdict:** confirmed · **Root cause:** `student-content-in-function-logs`

**Where**

- supabase/functions/_shared/research.ts:442,468,488,304,326 (claim, seed and follow-up queries, failed Exa queries and URLs)
- supabase/functions/ai/features/generate.ts:37 (motion)
- supabase/functions/ai/request.ts:33 (first 200 characters of rejected input)
- supabase/functions/ai/index.ts:188 (pre-auth feature string)

**What the reviewer saw**

Code: console.log/warn writes the student's motion, research claims and generated queries, plus 200-character snippets of inputs the injection filter rejected, into Supabase function logs on every research run. docs/standards/security.md forbids user content in telemetry; logs are the same data with a different sink.

**Why it happens**

Debug logging kept from development.

**Suggested fix**

Log request ids, lengths and counts only. Delete the motion, claim and query interpolations and the rejected-input snippet.

**Who it hits**

Minors' debate content sits in operator-visible logs outside the export and deletion paths.

**Independent check**

Evidence: code only. research.ts:443 logs the claim, 471 the seed query, 483 follow-up queries, and 285/297/318/325 failed queries and URLs. generate.ts:37 logs the motion. request.ts:33 logs 200 chars of rejected input. ai/index.ts:188 logs the raw feature string before auth.


### security-edge-15: Admin: user list stops at the first 50 accounts with 4 queries each; stats loads every ai_requests row; NaN days gives 500

**Severity:** low · **Verdict:** confirmed · **Root cause:** `admin-aggregation-in-js-library-defaults`

**Where**

- supabase/functions/admin/index.ts:383 (listUsers() with no page or perPage, so the GoTrue default page of 50, then .slice(0, 100))
- supabase/functions/admin/index.ts:386-410 (4 sequential queries per user)
- supabase/functions/admin/index.ts:273-286 (parseInt(days) unchecked; collectAdminUsagePages loads every row in the window)

**What the reviewer saw**

Code: users never shows account 51 onwards, so an admin cannot find a later user to change their role or limit. Each load issues about 200 database queries. days=abc produces an Invalid Date, toISOString throws, and the endpoint returns 500 'Invalid time value'. stats pages through every ai_requests row since `since` into memory, which security-edge-1 makes far worse.

**Why it happens**

Admin endpoints aggregate in JS and rely on library defaults.

**Suggested fix**

Paginate users with an email search, and join usage, roles and settings in one SQL RPC. Clamp days to 1..90. Move the stats aggregation into SQL with GROUP BY.

**Who it hits**

Only Adam and other admins notice. The dashboard grows slower and less complete as the user base and ai_requests grow.

**Independent check**

Evidence: code only. The admin endpoint is off limits. admin/index.ts:383 calls listUsers() with no page or perPage, so it gets GoTrue's default page of 50, then .slice(0,100). Correction: the 4 queries per user are sequential within a user, but users run under Promise.all, so a page load is a burst of about 200 concurrent queries, not 200 sequential ones. stats: parseInt(days) is unchecked (272-274). NaN gives an Invalid Date, toISOString throws RangeError, and the endpoint returns 500. collectAdminUsagePages loads every row in the window into memory (278-287).


### security-edge-16: Hidden Workspace backend is still live: workspace-invites is deployed and reachable, and ai accepts workspaceContext

**Severity:** low · **Verdict:** partly · **Root cause:** `hidden-workspace-backend-still-deployed`

**Where**

- supabase/functions/workspace-invites/index.ts (deployed on staging)
- supabase/functions/ai/index.ts:234-262, 394-457 (workspaceContext handling and start/complete_workspace_thread_generation RPCs)

**What the reviewer saw**

npm run backend:status against staging reports 15/15 functions deployed, workspace-invites included. An unauthenticated POST to workspace-invites returns 401 (probe-hold.json), so the endpoint is reachable. It also shows the >512 KB hold (security-edge-2). The production ai function still parses body.workspaceContext and runs the workspace RPCs for members. Production deploy state was not checked.

**Why it happens**

The Workspace UI was hidden behind VITE_COLLABORATION_URL, but its backend stayed deployed and wired into ai.

**Suggested fix**

Where Workspace is off, undeploy workspace-invites (operations step, needs authorisation). In ai/index.ts, reject workspaceContext with 400 unless a server-side flag (e.g. WORKSPACE_ENABLED) is set. That also lets the workspace branches move out of the hot path.

**Who it hits**

Extra attack surface and code in the main AI request path, for a feature no production user can reach.

**Independent check**

Evidence: staging HTTP plus function list. workspace-invites is deployed on staging (version 1, created and last updated 2026-10-02T20:45Z), and an unauthenticated POST returns 401, so it is reachable. It also shows the 1 MB hold from edge-2. That contradicts docs/staging.md:50, which says workspace-invites is 'never deployed', so this is undocumented staging drift from a hand deploy. The function itself is the out-of-scope hidden Workspace. The in-scope part is ai/index.ts:381-457, which parses workspaceContext on the main request path. Membership is checked (loadAuthorizedWorkspaceContext), so there is no auth hole, just dead surface. Production deploy state is unknown.

**Evidence files**

[backend-status-staging.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/backend-status-staging.txt), [probe-hold.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-edge/probe-hold.json), [staging-functions-list.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/staging-functions-list.json), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json)


### security-db-3: Client-role grants drift by environment: replay gives anon TRUNCATE on 28 tables, SELECT on global prompts and admin RPCs, while staging was hardened out of band

**Severity:** low (reviewer said medium) · **Verdict:** partly · **Root cause:** `client-role-grants-rely-on-platform-defaults` · **Known in plan:** next-15 open follow-ups from #80

**Where**

- supabase/migrations/20260204000000_admin_improvements.sql:63-67 (rate_limits_select_own includes user_id IS NULL; global_prompts_select_all USING (true), roles {public})
- supabase/migrations/20260204000000_admin_improvements.sql:151-153 (GRANT EXECUTE get_daily_usage/get_usage_by_user/get_active_rate_limits TO authenticated; PUBLIC EXECUTE never revoked)
- supabase/migrations/20260923191320_explicit_legacy_table_grants.sql (grants what clients need but revokes nothing extra)
- supabase/migrations/20260820070000_reconcile_prod_only_objects.sql:49,115,154,170 (explicit GRANT ALL TO anon on curated_sources, evidence_cards, keepalive_*)

**What the reviewer saw**

Fresh replay catalog (replay-catalog/final-table-grants.txt): anon and authenticated hold DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE on 28 public tables, from Supabase default privileges. That list includes cases, sources, debates, messages, subscriptions, user_roles, user_settings (TRUNCATE, TRIGGER, REFERENCES), promo_codes and global_prompts. Replay P8b: as anon, TRUNCATE public.cases removed another user's row (count went from 1 to 0, rolled back). RLS does not apply to TRUNCATE. Replay P9: anon sees global_prompts rows and global rate_limits rows. final-functions.txt: get_daily_usage, get_usage_by_user and get_active_rate_limits are EXECUTE for PUBLIC and anon (guarded inside by require_admin). Staging (staging-probes.json) differs: global_prompts and promo_codes return 42501 for both anon and authenticated, and get_daily_usage returns 42501 even for authenticated, which 20260204 explicitly granted. So someone tightened staging by hand and recorded it nowhere. rate_limits anon SELECT still returns 200 on staging (0 global rows exist today). The #80 PR found the TRUNCATE leak on six tables; it actually covers 28. PostgREST cannot issue TRUNCATE today, so that part is defense in depth. Production grants are unverified.

**Why it happens**

Tables and functions created by the postgres role inherit Supabase's default privileges for anon and authenticated (ALL on tables, EXECUTE on functions), and migrations never revoke what clients don't need. Hand fixes on hosted projects don't flow back into migrations, so CI, db reset, verify stacks, staging and production each end up with different grants, and backend:status can't detect it.

**Suggested fix**

One migration that: REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated; revokes every privilege on server-only tables (global_prompts, promo_codes, daily_usage_counters, rate_limits for anon) and anon SELECT on user_settings and similar; DROP POLICY global_prompts_select_all and narrow rate_limits_select_own to TO authenticated USING (user_id = (select auth.uid())); REVOKE EXECUTE ... FROM PUBLIC, anon on the three admin RPCs (or drop the two unused ones, see security-db-11); and ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES/FUNCTIONS FROM anon, authenticated so new objects start closed. Add a pgTAP check that no client role holds TRUNCATE, TRIGGER or REFERENCES on any public table and that anon has EXECUTE only on get_shared_item. Then confirm production's ACLs with a read-only catalog query (Adam's call).

**Who it hits**

Today it mainly leaks operator prompts and limits, and it means the security posture can't be read from the repo. Any future SQL-injection or SECURITY INVOKER mistake would let a client TRUNCATE every user's data, bypassing RLS.

**Independent check**

Known in plan: next-15 open follow-ups from #80. Evidence: staging HTTP plus code. Staging grants differ from what the migrations produce. authenticated gets 42501 'permission denied for function get_daily_usage' (and get_usage_by_user), although 20260204:151-152 grants EXECUTE to authenticated and 20260819:84 uses CREATE OR REPLACE, which keeps the ACL. anon holds SELECT on user_settings and rate_limits (200 []), which no migration grants to anon, but gets 42501 on global_prompts and promo_codes, which platform defaults would also have granted. So hand changes on staging are real and undocumented. rate_limits_select_own still allows user_id IS NULL rows to anon (staging has 0 such rows). Not verifiable without a replay DB, which I did not run: the '28 tables with anon TRUNCATE' count. Repo fact: 20260820070000 explicitly runs GRANT ALL TO anon on curated_sources, evidence_cards, keepalive_events and keepalive_heartbeat. That gives anon TRUNCATE on those everywhere (sparring_sessions was later revoked, 20260830:44), and no migration revokes TRUNCATE. PostgREST cannot issue TRUNCATE, so it is defense in depth. Production unverified.

**Evidence files**

[final-table-grants.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/final-table-grants.txt), [final-functions.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/final-functions.txt), [replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt), [staging-probes.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/staging-probes.json), [staging-anon-table-probes.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/staging-anon-table-probes.json), [probe-api.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-1/probe-api.json)


### security-db-8: Judged sparring rounds are saved with no debate; a separate client call files them, and it is skipped if the student leaves during judging

**Severity:** low · **Verdict:** confirmed · **Root cause:** `sparring-claim-insert-missing-debate-id`

**Where**

- supabase/migrations/20260830000000_complete_sparring_sessions.sql:98-106 (claim INSERT has no debate_id)
- supabase/functions/ai/sparring-persistence.ts:530-547,550-565 (payload has no debate_id)
- src/pages/SparringPage.tsx:230-239 (attachSessionToDebate runs only if the same session is still on screen)
- src/lib/stores/sparring-store.ts:456-469

**What the reviewer saw**

The server already receives the debate (the debateContext of the score request) but claim_sparring_score_session inserts the row with debate_id NULL. The client then calls attach_to_debate('sparring', ...) in .then(), only if judgeRequestRef and currentSession still match. If the student reloads or navigates away while the judge runs (tens of seconds with a real model), or the attach call fails (toast 'Could not save this result to the debate'), the judged round stays in Unsorted. This breaks the 'every saved result belongs to one debate' rule until the student files it by hand.

**Why it happens**

Debate assignment was added after sparring persistence and implemented as a second, non-atomic client step.

**Suggested fix**

Pass the validated debate id in the claim payload and set debate_id (and side) in claim_sparring_score_session's INSERT. The composite FK (user_id, debate_id) already guarantees ownership. Remove the client-side attach for sparring.

**Who it hits**

Students who don't wait on the Sparring page find their judged round missing from the debate and sitting in Unsorted.

**Independent check**

Evidence: code only. A judge round costs AI, and the shared pro account should not get a stray round. claim_sparring_score_session inserts without debate_id (20260830000000:98-106), and no later migration redefines it. The sparring-persistence payload has no debate_id. SparringPage.tsx:230-239 calls attachSessionToDebate only inside .then, guarded by judgeRequestRef and the current session id, so a reload or navigation during judging skips it. Hydration (sparring-store.ts:487-497) does not re-attach.


### security-db-9: Sixteen legacy policies call bare auth.uid() with roles {public} instead of (select auth.uid()) TO authenticated

**Severity:** low · **Verdict:** confirmed · **Root cause:** `legacy-rls-bare-auth-uid`

**Where**

- supabase/migrations/20260129000000_init.sql:150-197 (user_settings_*, cases_all, attacks_all, brainstorms_all, factoids_all, chats_all, messages_* x4, sources_all, source_files_all, api_keys_all)
- supabase/migrations/20260206103000_create_flowcharts.sql:17-29 (flowcharts_* x4)
- supabase/migrations/20260521000001_source_folders_table.sql:23-24 (source_folders_all)

**What the reviewer saw**

replay-catalog/final-policies.txt shows qual '(user_id = auth.uid())' with roles {public} on these policies, while newer tables use (SELECT auth.uid()) TO authenticated. The messages policies run an EXISTS subquery on chats for every message row. Supabase's advisor rule auth_rls_initplan flags this pattern because hosted auth.uid() parses the JWT claims per evaluation. Honest scale note: on the replay image (where auth.uid() is a simple current_setting), EXPLAIN of SELECT count(*) FROM messages as authenticated over 20k rows used a hashed subplan and took about 4 ms, so the cost is modest at today's sizes. Policies for {public} are also evaluated for anon requests that the grants allow.

**Why it happens**

Init-era policies predate the project's later convention.

**Suggested fix**

One migration that drops and recreates these policies as TO authenticated USING/WITH CHECK (user_id = (select auth.uid())). For messages, use EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = (select auth.uid())). Existing owner_scoped pgTAP tests cover behavior.

**Who it hits**

Small CPU cost on every list query that grows with history size. Mostly a consistency and advisor-noise fix.

**Independent check**

Evidence: code only. Correction: 20 policies, not 16. 15 survive from init.sql (user_settings select/insert/update, cases/attacks/brainstorms/factoids/chats _all, messages x4, sources_all, source_files_all, api_keys_all; ai_requests_all and user_settings_delete were dropped in 20260819). Add 4 flowcharts policies (20260206103000:18-29) and source_folders_all (20260521000001:24). All use bare auth.uid() with no TO clause, so roles {public}. None were recreated later. The performance impact is modest at current sizes. This is mostly consistency and advisor noise.

**Evidence files**

[final-policies.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/final-policies.txt), [replay-explain-auth-uid.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-explain-auth-uid.txt)


### security-db-10: Items can be moved between the owner's own debates by direct UPDATE, and pins are never cleaned up when their item is deleted or moved

**Severity:** low · **Verdict:** confirmed · **Root cause:** `debate-id-reassignment-unguarded`

**Where**

- supabase/migrations/20260129000000_init.sql:157-175 (cases_all etc.: FOR ALL with no column restriction)
- supabase/migrations/20260926090000_current_debates.sql:89-104 (require_source_debate only blocks detaching; attach_to_debate only attaches from NULL)
- supabase/migrations/20260927170000_debate_context_pins.sql:6-18 (item_id has no FK; no cleanup trigger)

**What the reviewer saw**

Replay block P5: as the owner, UPDATE cases SET debate_id = <debate B> on a case in debate A succeeded. After DELETE of the case, the pin row remained (pins_left_after_item_delete = 1). attach_to_debate deliberately allows only NULL -> debate, and the sources trigger forbids detaching, but nothing stops A -> B for results or sources. Cross-user moves are blocked by the composite FK (P4), so this is integrity, not security. The client hides dangling pins with resultKeys and the edge loader filters them, so the visible effect is only stale rows plus 'unavailable' counts if a client sends them.

**Why it happens**

Debate membership is guarded on attach and detach but not on reassignment, and pins reference polymorphic items without referential cleanup.

**Suggested fix**

Add a BEFORE UPDATE OF debate_id trigger on the nine debate-scoped tables that raises when OLD.debate_id IS NOT NULL AND NEW.debate_id IS DISTINCT FROM OLD.debate_id (extend private.require_source_debate). Add AFTER DELETE (and AFTER UPDATE OF debate_id) triggers on the result tables, chats and sparring_sessions that delete matching debate_context_pins rows, or purge pins whose item no longer exists in their debate when loading.

**Who it hits**

Small. Today no UI path moves items, but the database doesn't enforce the 'nothing crosses debates' invariant it documents, and pin rows pile up.

**Independent check**

Method (applies to all four): a throwaway public.ecr.aws/supabase/postgres:17.6.1.165 container (verify-sec2-pg on 127.0.0.1:55497). This is not the Supabase CLI stack and uses no shared ports or db-gate lock. All 39 migrations applied cleanly (replay-migrations.log). storage.objects was stubbed because the plain image lacks storage-api. The image ships the legacy auth.uid()/auth.role(), which read request.jwt.claim.sub/role, so those settings stood in for PostgREST claims. Staging was probed read-only only, so every write path below was tested on the replay, not on staging. Results: as the owner, UPDATE cases SET debate_id = B on a case in debate A returned UPDATE 1 (P10a). The same worked for sources (P10b), which only blocks setting debate_id to NULL (P10c, 23514). Moving into another user's debate fails on the composite FK (P10d, 23503). attach_to_debate refuses an item already in a debate (P10e). Messages can also cross debates: UPDATE messages SET chat_id = <own chat in debate B> succeeded (replay-db10-messages.out.txt), because messages_update has no WITH CHECK and only checks chat ownership. Grants show authenticated can UPDATE debate_id on cases, attacks, brainstorms, factoids, chats, flowcharts, crossfires and sources. sparring_sessions has no client UPDATE grant. So the scope is 8 tables plus messages, not nine; the fix should cover messages.chat_id too. Pins: after the case moved, its pin stayed in debate A. After DELETE, pins_left_after_item_delete = 1 (P10f). A pin can also be inserted for an item id that never existed (P10g): item_id has no FK. User-visible effect is nil. No UI path updates debate_id (the only client .update calls touch other columns). src/lib/debate/context.ts:158-161 drops dangling pins from resultKeys, DebateContextControl.tsx:139 passes resultKeys whenever hydration is complete, and the edge loader (_shared/debate-context-loader.ts:109-111) re-filters by user_id + debate_id. The pin-limit lockout only happens if hydration failed (serverHydration 'partial'). The pro account's debate_context_pins on staging had 0 rows, so no real dangling pin was observed. Rated low because the documented invariant is unenforced in the DB; the pin-cleanup half alone is a nit. The suggested fix stands: a BEFORE UPDATE OF debate_id guard on the 8 tables plus a chat_id guard on messages, and pin cleanup on delete.

**Evidence files**

[replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt), [replay-db10-db11.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-db11.sql), [replay-db10-db11.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-db11.out.txt), [replay-db10-messages.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-messages.sql), [replay-db10-messages.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-messages.out.txt), [replay-migrations.log](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-migrations.log), [staging-probes.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/staging-probes.json)


### security-db-11: Unused but client-writable tables and dead admin RPCs widen the attack surface; source FKs are not owner-scoped

**Severity:** low · **Verdict:** confirmed · **Root cause:** `dead-prototype-schema-objects`

**Where**

- supabase/migrations/20260129000000_init.sql (api_keys, source_files)
- supabase/migrations/20260820070000_reconcile_prod_only_objects.sql:18-49,94-115 (curated_sources GRANT ALL TO anon; evidence_cards GRANT ALL TO anon, source_id REFERENCES sources(id))
- supabase/migrations/20260819000000_security_hardening.sql:85-108 (get_daily_usage, get_usage_by_user read auth.users emails)

**What the reviewer saw**

No code in src/, supabase/functions or scripts references api_keys, source_files, evidence_cards, curated_sources or keepalive_*. get_daily_usage and get_usage_by_user have no caller (only get_active_rate_limits is used, by admin/index.ts:785). Yet all of these are writable by clients under RLS, and the two RPCs are SECURITY DEFINER readers of auth.users.email, executable by authenticated (and by PUBLIC/anon on replay). Replay P3: a user inserted an evidence_card and a source_file pointing at another user's source_id; a random id fails with 23503, so the insert also tells you whether a source id exists (a nit given v4 UUIDs). When the victim deletes the source, the attacker's rows cascade or have their reference set to null. The tables are also covered by export, clear-data and pgTAP code, which is upkeep with no product value.

**Why it happens**

Prototype and production-only objects were brought into migrations as they were, and the features that would use them never shipped or were removed.

**Suggested fix**

After confirming the production row counts are empty (Adam's call), drop api_keys, source_files, evidence_cards and curated_sources, and DROP FUNCTION get_daily_usage and get_usage_by_user, along with their lines in clear_current_user_data and the tests. If any of them stays, give the source FK (user_id, source_id) -> sources(user_id, id) as debates already does, and revoke anon grants.

**Who it hits**

Less code and fewer grants to audit. Removes a cross-user reference path and two dead email-reading definer functions.

**Independent check**

Confirmed as dead-schema cleanup. It is not an exploitable surface. No src/, supabase/functions or scripts code references api_keys, source_files, evidence_cards or curated_sources, apart from clear_current_user_data, the export/deletion SQL, pgTAP tests and docs/architecture.md:106 (source_files). The only RPCs called from code are listed by grep; get_daily_usage and get_usage_by_user have no caller. Replay: as user B, INSERT evidence_cards and INSERT source_files with user A's source_id both succeeded (P11a/P11b), even though B cannot SELECT that source. A random source_id fails with 23503 (P11c), an existence oracle that is a nit against v4 UUIDs. When A deletes the source, B's evidence_card.source_id is set to NULL and B's source_file cascades away (P11e). Corrections: (1) the anon GRANT ALL on curated_sources and evidence_cards is moot. Their policies are TO authenticated, so anon reads 0 rows and its inserts fail RLS (replay P11g; staging: anon GET on both returns 200 with 0 rows). (2) Both RPCs are gated by require_admin. On the replay, authenticated and anon get 'administrator access required'. On staging, anon (401) and trial (403) both get 42501 'permission denied for function', and so does get_active_rate_limits. So staging's function ACLs differ from what the migrations produce. The cause is unknown and it is harmless, because admin/index.ts:19 uses the service role. (3) curated_sources is writable only by admins. api_keys, source_files and evidence_cards are writable by any authenticated user for their own rows (trial GET on each returns 200, 0 rows). Fix caveats: keepalive_events and keepalive_heartbeat are written by an external uptime monitor by design (comment in 20260820070000_reconcile_prod_only_objects.sql:139) and must stay out of any DROP list. Dropping source_files also touches docs/architecture.md:106, supabase/tests/legacy_table_grants_test.sql, account_deletion_test.sql and owner_scoped_tables_rls_test.sql. Production row counts are Adam's call.

**Evidence files**

[replay-proofs.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-proofs.out.txt), [final-table-grants.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/final-table-grants.txt), [replay-db10-db11.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-db11.sql), [replay-db10-db11.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db10-db11.out.txt), [staging-probes.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/staging-probes.json)


### security-db-12: Index hygiene: duplicate and redundant indexes on hot write tables, plus a few unindexed foreign keys

**Severity:** low · **Verdict:** confirmed · **Root cause:** `redundant-indexes-unindexed-fks`

**Where**

- supabase/migrations/20260208000000_stripe_schema.sql + 20260520000000_payment_correctness.sql (idx_subscriptions_stripe_customer and idx_subscriptions_stripe_customer_id are identical; idx_subscriptions_stripe_sub duplicates the UNIQUE key)
- supabase/migrations/20260204000000_admin_improvements.sql:42-45 (idx_user_roles_user_id, idx_global_prompts_feature, idx_rate_limits_user_id duplicate unique keys)
- supabase/migrations/20260129000000_init.sql:120-127 (idx_{cases,attacks,brainstorms,factoids,chats,sources}_user_id are prefixes of the *_user_debate_idx composites added in 20260926090000)
- supabase/migrations/20260926090000_current_debates.sql:35 (current_debates_user_debate_idx is redundant with the PK on user_id); 20260927170000_debate_context_pins.sql:20 (debate_context_pins_debate_idx is unused because every query and the cascade lead with user_id)

**What the reviewer saw**

replay-catalog/all-indexes.txt, by inspection. Exact duplicates: subscriptions (stripe_customer_id x2, stripe_subscription_id x2), promo_codes.code (idx_promo_codes_code plus promo_codes_code_key), global_prompts.feature, user_roles.user_id, demo_access_codes.email (email_idx plus email_key), user_promos.user_id and source_folders.user_id (prefix of a unique key). Prefix-redundant: seven single-column user_id indexes on result tables, each also covered by (user_id, debate_id, created_at DESC). Unindexed FKs (replay-catalog/unindexed-fks.txt): shared_items.created_by (scanned on every account deletion), user_promos.promo_code_id, source_files.source_id and user_id. Missing for the edge loader's 'last 6 messages per chat': messages (chat_id, created_at). My automated redundancy query returned 0 rows because of an int2vector slicing bug, so this list comes from reading the dump by hand.

**Why it happens**

Indexes were added migration by migration without pruning the ones newer composites or constraints made obsolete.

**Suggested fix**

One migration that drops the duplicates and prefix-redundant single-column user_id indexes (check pg_stat_user_indexes.idx_scan on production first), replaces idx_messages_chat_id with (chat_id, created_at), and adds an index on shared_items (created_by).

**Who it hits**

Every saved result, source and message write maintains one or two unnecessary indexes. Account deletion scans shared_items. Small at today's scale.

**Independent check**

Checked with catalog queries on the replay, not by hand (replay-indexes.sql/.out.txt). There are 6 exact duplicate pairs: subscriptions has idx_subscriptions_stripe_customer and idx_subscriptions_stripe_customer_id (identical), plus idx_subscriptions_stripe_sub and subscriptions_stripe_subscription_id_key. The others are promo_codes (idx_promo_codes_code / promo_codes_code_key), global_prompts (idx_global_prompts_feature / global_prompts_feature_key), user_roles (idx_user_roles_user_id / user_roles_user_id_key) and demo_access_codes (email_idx / email_key). Correction: idx_rate_limits_user_id is not an exact duplicate. It is prefix-redundant under UNIQUE (user_id, limit_type). Prefix-redundant single-column user_id indexes, each a prefix of (user_id, debate_id, created_at DESC): cases, attacks, brainstorms, factoids, chats, sources and flowcharts. idx_user_promos_user_id and idx_source_folders_user_id are prefixes of unique keys. current_debates_user_debate_idx and debate_context_pins_debate_idx are redundant with their PKs. The PKs are on user_id and (user_id, debate_id, ...), and loadPins gets user_id from RLS. I did not EXPLAIN them, so call them 'redundant', not 'unused'. Unindexed FKs confirmed: shared_items.created_by, user_promos.promo_code_id, and source_files.source_id and user_id. Not in the finding but the same fix: api_keys.user_id, promo_codes.created_by, global_prompts.created_by, curated_sources.created_by and demo_access_codes.created_by. All of them make the auth.users cascade scan on every account deletion. (Workspace FKs also show up but are out of scope.) messages has only idx_messages_chat_id, with no (chat_id, created_at) index for the loader's 'last 6 messages' query. The replay is schema-only: production may differ, and checking idx_scan on production before dropping anything is Adam's call. Impact is small at today's scale; low is generous but fair.

**Evidence files**

[all-indexes.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/all-indexes.txt), [unindexed-fks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/security-db/replay-catalog/unindexed-fks.txt), [replay-indexes.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-indexes.sql), [replay-indexes.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-indexes.out.txt)


### security-db-13: PII outlives the account: demo-code email kept after deletion and left out of export; demo login IPs and expired shares never purged

**Severity:** low · **Verdict:** confirmed · **Root cause:** `no-operational-data-retention`

**Where**

- supabase/migrations/20260820070000_reconcile_prod_only_objects.sql:55-87 (demo_access_codes.email has no FK; demo_access_attempts stores ip_address and browser_fingerprint)
- supabase/migrations/20261001100000_account_deletion_and_export.sql:118-123 (export skips demo_access_codes; prepare_account_deletion doesn't touch it)
- supabase/functions/demo-code-login/index.ts:67-73 (inserts every attempt; nothing deletes)
- src/locales/en.json privacy p6 ('Deleting your account permanently removes it and all data stored with it')

**What the reviewer saw**

When a demo-code user deletes their account, the demo_access_codes row keeps their email, the admin label (often a name or school), use_count and last_used_at. The export doesn't include it (v_skipped lists demo_access_codes). demo_access_attempts keeps IP addresses and browser fingerprints forever, though the limiter only reads 15 minutes back (demo-code-login/index.ts:78). Expired shared_items and old daily_usage_counters rows are never deleted. No pg_cron jobs or cleanup functions exist in migrations.

**Why it happens**

No retention policy or scheduled cleanup exists for operational tables, and the demo-code record is keyed by email instead of user id.

**Suggested fix**

Add a service-role-only private.purge_expired_operational_data() that deletes demo_access_attempts older than 30 days, shared_items expired more than 30 days ago and daily_usage_counters older than 90 days. Schedule it with pg_cron or call it from an existing edge job. In the account function, disable the demo code and blank its email when the matching demo user deletes their account, or document that the admin's record is kept.

**Who it hits**

Small privacy and compliance gap for an EU student audience. The privacy page promises full removal on deletion.

**Independent check**

Replay (replay-db13.out.txt): deleting a demo-code user's auth.users row, which is the last step of account deletion, leaves the demo_access_codes row with its label ('Example School, Year 10' in the test) and email. It also leaves demo_access_attempts with IP 203.0.113.7 and the browser fingerprint, linked through code_hash. Expired shared_items and old daily_usage_counters do cascade with the account (shared_items FK made ON DELETE CASCADE in 20261001100000:21-24). So only the two demo tables outlive the account. For shares and counters, 'never purged' is true only while the account exists. That is retention hygiene, not data outliving deletion. Code confirms: demo-code-login/index.ts:66-75 inserts every attempt. The limiter reads back only 15 minutes (index.ts:78). Nothing deletes from demo_access_attempts (grep plus the pg_proc scan). No pg_cron extension exists, and no purge function in public or private. export_account_data's v_skipped lists demo_access_codes (20261001100000:112), because its ownership column created_by is the admin. The account function has no demo handling. Corrections: the locale key is privacyPage.p6 in src/locales/en.json (line 1738), and the Settings copy deleteAccountSuccessDesc (line 503) also says 'all of its data'. The demo email is admin-supplied or a generated demo-<uuid>@debate.pi-stack.org address (admin/index.ts:457, 523), so the PII is mostly the admin label, any real email the admin entered, and IP addresses. The privacy page never mentions IP logging. Functional consequence that supports the 'disable the code on deletion' fix: the surviving code recreates a fresh account the next time it is used (demo-code-login/index.ts:207-250, where findUserByEmail returns null and createUser runs). Low is right.

**Evidence files**

[replay-db13.sql](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db13.sql), [replay-db13.out.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-security-2/replay-db13.out.txt)

