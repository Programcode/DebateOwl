# Data integrity, billing and quotas: findings

**Status:** Review evidence from 2026-10-08/09, for [the ranked report](../2026-10-08-ultracode-review-report.md). Not started.

20 findings: 5 high, 8 medium, 6 low, 1 nit. An independent verifier re-checked every one.

Each entry has the final severity, where the problem lives, what the reviewer saw, why it happens, a suggested fix, the independent check and links to the screenshots and measurements in `.verify/ultracode-review-2026-10-08/`. Line numbers are against main at 40738ea.

Not covered by the integrity-money reviewer:

- Real Stripe Checkout, the billing portal and checkout.session.completed / invoice.payment_succeeded handling (they call the Stripe API; the local key is a placeholder), so the account-deletion Checkout race is backed by code reading only
- Live model output (no --live run; nothing here needed real model text)
- ElevenLabs voice quota and cost rows
- Agentic e2e explorations (not run; scripted repros covered the area)
- Exact Chrome localStorage quota on Safari/iOS (only Chromium tested; Safari's limit is similar or lower)
- Debate create dialog losing a long motion on accidental close (seen in code as local state, not reproduced)
- Staging: deliberately not used (local stack only, as assigned)

### integrity-money-1: Saves silently become local-only when supabase.auth.getUser() fails (offline, flaky wifi, auth hiccup) and vanish on reload, while the UI says 'Source Added'

**Severity:** high · **Verdict:** confirmed · **Root cause:** `getuser-network-fallback-local-only-writes`

**Where**

- src/lib/stores/session-store.ts:288-291 (getUserId calls supabase.auth.getUser(), a network round trip)
- src/lib/stores/session-store.ts:505-512 (addSource: no user -> local-only item, returns success)
- src/lib/stores/session-store.ts:561, 592, 657, 693, 734, 796, 821, 858, 890, 922, 960, 994 (createSourceFolder, folder rename/delete, clearLibrary, saveCurrentCase/Attack/Brainstorm/Factoids/Chat, saveFlowchart: same 'if (!userId)' local-only branch)
- src/lib/stores/session-store.ts:1043, 1306 (updateRecordedResult, syncAskChatNow: silently return)
- route /app/library -> Add Source -> Save to Library

**What the reviewer saw**

Offline: signed in, debate started, filled Add Source, context.setOffline(true), clicked Save to Library. The source appeared in the list, the panel closed, no error toast. Back online for 3 s: sources table had [] for the user. After reload the source was gone (b5-offline.json). Auth hiccup only: routed /auth/v1/user to 503 while REST stayed up. The 'Source Added: Your source is now available for grounding.' toast appeared, the list showed 2 sources, the DB had only the first, and after reload it was gone (b6-getuser-fallback.json, b6-auth-hiccup-source-looks-saved.png, b6-after-reload-source-gone.png). A normal add made 3 /auth/v1/user network requests (b6 JSON 'authUserRequests':3).

**Why it happens**

Leftover signed-out mode: every write asks the Auth server for the user (getUser) and treats any failure as 'not signed in', then writes only to the persisted Zustand store. /app is auth-gated, so on the live app these branches only run when the network or auth server fails, and they turn that failure into fake success.

**Suggested fix**

In session-store.ts, get the user id from the local session (supabase.auth.getSession() or the id AuthProvider already passes to setActiveAccessToken) instead of getUser(), and throw when there is none. Delete the local-only branches so a failed insert surfaces through the existing error toasts. This also removes 1–3 auth round trips per write.

**Who it hits**

Students on school or mobile networks lose sources, saved results, flowcharts and folder changes with no warning. Whenever the auth call fails, every Library and Save action becomes a silent loss.

**Independent check**

Re-read session-store.ts:288-291 (getUserId = supabase.auth.getUser(), a network call) and the local-only branches; re-ran on the local stack. Auth hiccup (/auth/v1/user -> 503, REST up): 'Source Added: Your source is now available for grounding' toast, source in the list, no DB row, gone after reload. Fully offline: same false 'Source Added' toast (the 'Offline mode' pill shows too), sources table empty after going back online, gone after reload. One normal add made 3 /auth/v1/user requests. Correction to scope: recordResult (session-store.ts:1026) throws when there is no user, so AI tool results filed through recordResult are not silently lost. The silent paths are addSource, createSourceFolder, rename/deleteSourceFolder, updateSource/toggle, saveCurrentCase (GeneratePage), saveCurrentChat (AskPage), saveFlowchart, updateRecordedResult. saveCurrentAttack/Brainstorm/Factoids have no callers outside the store (dead code, worth deleting in the same fix). The suggested fix holds: take the user id from the local session and throw when it is missing.

**Evidence files**

[b5-offline.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b5-offline.json), [b5-offline-save-source.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b5-offline-save-source.png), [b6-getuser-fallback.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b6-getuser-fallback.json), [b6-auth-hiccup-source-looks-saved.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b6-auth-hiccup-source-looks-saved.png), [b6-after-reload-source-gone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b6-after-reload-source-gone.png), [b6-getuser.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b6-getuser.mjs), [f1-getuser.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f1-getuser.json), [f1-auth-hiccup-source-looks-saved.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f1-auth-hiccup-source-looks-saved.png), [f1-after-reload-source-gone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f1-after-reload-source-gone.png), [f1-offline.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f1-offline.json), [f1-offline-save-source.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f1-offline-save-source.png)


### integrity-money-2: Sign-out leaves the previous student's unsent drafts in localStorage, and the next student sees them on shared computers

**Severity:** high · **Verdict:** confirmed · **Root cause:** `signout-keeps-form-drafts`

**Where**

- src/lib/stores/session-store.ts:1221-1245 (resetLocalData does not clear generateForm/attackForm/brainstormForm/factoidsForm/pendingFlowchartData)
- src/lib/stores/session-store.ts:1247-1262 (clearSession clears them, but sign-out never calls it)
- src/lib/supabase/AuthProvider.tsx:249-258 and 365-371 (SIGNED_OUT handler and signOut call resetSessionStore only)
- localStorage key debate-trainer-storage

**What the reviewer saw**

User A typed into Attack 'Your Argument', Factoids 'Statement' and Brainstorm 'Motion' without submitting, then signed out in Settings. localStorage still held all three drafts. User B signed in on the same browser: /app/attack showed A's text 'ZZ-PRIVATE-A: my coach said my rebuttal on immigration is weak because of my family situation', and Factoids and Brainstorm were prefilled with A's text (b1-signout-leak.json, b1-userB-attack-shows-userA-draft.png).

**Why it happens**

Per-user draft state lives in the persisted session store, and the sign-out reset path resets results and lists but forgets the form drafts. Only the environment-switch path (discardLocalState) calls clearSession.

**Suggested fix**

Make resetLocalData also clear the four forms and pendingFlowchartData (or call clearSession from the SIGNED_OUT and user-change branches in AuthProvider). Better: key the persisted store by user id, as the Crossfire draft already does (crossfireStorageKey(ownerId)).

**Who it hits**

Most users are school students, often on shared lab or library computers. A student's private case text and arguments show up for the next student who signs in on that browser.

**Independent check**

Code: resetLocalData (session-store.ts:1221-1245) leaves generateForm/attackForm/brainstormForm/factoidsForm/pendingFlowchartData alone. clearSession clears them, but only discardLocalState (environment switch), Settings clearLocalData (delete paths) and the debate dialogs call it. AuthProvider SIGNED_OUT (249-258) and signOut (365-371) call resetSessionStore only. Reproduced locally: demo user A typed into Attack, Factoids and Brainstorm without submitting, then clicked Settings > Sign out. Auth keys were removed but the drafts stayed in debate-trainer-storage. Demo user B signed in through the Login page and got A's text prefilled in all three forms. High holds for a privacy leak between students on shared browsers. It is limited to unsent drafts, since saved results and lists are reset.

**Evidence files**

[b1-signout-leak.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b1-signout-leak.json), [b1-userB-attack-shows-userA-draft.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b1-userB-attack-shows-userA-draft.png), [b1-userB-brainstorm.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b1-userB-brainstorm.png), [b1-signout.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b1-signout.mjs), [f2-signout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f2-signout.json), [f2-userB-attack-prefilled-with-userA-draft.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f2-userB-attack-prefilled-with-userA-draft.png), [f2-userB-brainstorm-prefilled.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f2-userB-brainstorm-prefilled.png)


### integrity-money-3: The session store writes every debate's full sources and results to localStorage on every change; past ~5M chars every write throws and tool pages crash for good

**Severity:** high · **Verdict:** confirmed · **Root cause:** `session-store-persists-server-lists`

**Where**

- src/lib/stores/session-store.ts:1264-1294 (persist to localStorage; partialize keeps savedCases/Attacks/Brainstorms/Factoids/Chats/Flowcharts/Crossfires, autosaved*, sourceLibrary with full content)
- node_modules/zustand/esm/middleware.mjs:358-372 (persist calls storage.setItem inside set() with no try/catch)
- src/lib/source-file-import.ts:4 (file imports up to 120,000 chars); library-sources.md notes pasted sources up to ~250 KB
- src/components/features/attack/AttackForm.tsx:59, generate/GenerateForm.tsx:82 (form watch writes the store on every keystroke)
- route /app/brainstorm crashes with 'Unable to load this page'

**What the reviewer saw**

Seeded one demo user's debate with sources through admin. 45 sources × 120,000 chars (the file-import cap): the persisted string is 5,410,309 chars. Every keystroke in Attack threw a page error "Failed to execute 'setItem' on 'Storage': Setting the value of 'debate-trainer-storage' exceeded the quota". Opening /app/brainstorm then rendered 'Unable to load this page' (console: error in <BrainstormForm>, 'Route rendering failed'). Reloading does not help, because hydrate sets the same state again (b3-quota-pdf45.json, b3-pdf45-error.png; the same at 130 × 45k, b3-big-error.png). Below the limit, at 60 × 45k (2.7M chars), each keystroke re-serialized and rewrote 2,713,534 chars: setItem alone had a median of 10.8 ms per keystroke and caused 4 long tasks (226 ms) while typing 36 chars (single run, load average ~1–4) (b3-quota-mid.json).

**Why it happens**

Server-owned lists, re-fetched in full on every load anyway (hydrateFromServer selects * from all tables across all debates), are also cached in synchronous localStorage, and the whole blob is rewritten on every set(), including each form keystroke. Zustand's persist lets QuotaExceededError escape from set().

**Suggested fix**

Remove the server lists (saved*, autosaved*, sourceLibrary, sourceFolders) from partialize in session-store.ts and keep only drafts and the open result. Wrap the storage adapter in try/catch (createJSONStorage over a safe wrapper) so storage can never break set(). If an offline cache is wanted, move it to IndexedDB, scoped to the current debate and without full source content.

**Who it hits**

Heavy users, the most engaged students, break the app with no way back: about 42 max-size PDF imports, or ~20 large pasted sources, across all their debates. Every user also pays a full-store serialize on each keystroke, which grows with the library.

**Independent check**

Code: partialize (session-store.ts:1281-1293) keeps every saved*/autosaved* list and sourceLibrary with full content. zustand 5.0.15 persist (middleware.mjs:358-372) calls storage.setItem after set() with no try/catch, so the state applies and then the call throws. Reproduced locally with 45 sources x 120,000 chars seeded for one demo user: typing 17 chars in Attack threw 17 page errors ('Setting the value of debate-trainer-storage exceeded the quota'). /app/brainstorm showed 'Unable to load this page' (console: error in <BrainstormForm>, 'Route rendering failed'), and it was still broken after a reload. Below the limit (60 x 45,000), every keystroke rewrote about 2,713,700 chars: 22 writes for 22 keystrokes in each of 3 runs, setItem median 12.1/11.1/11.1 ms with JSON.stringify not counted, load average about 3. Severity is borderline. Only heavy libraries (about 5M chars across all debates) hit the crash, but nothing inside the app recovers from it, and every user pays the per-keystroke serialization. Note that the storage-sync half of integrity-money-13 is a separate cause.

**Evidence files**

[b3-quota-pdf45.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b3-quota-pdf45.json), [b3-pdf45-error.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b3-pdf45-error.png), [b3-quota-big.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b3-quota-big.json), [b3-big-error.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b3-big-error.png), [b3-quota-mid.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b3-quota-mid.json), [b3-quota.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b3-quota.mjs), [f3-quota-pdf45.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f3-quota-pdf45.json), [f3-pdf45-brainstorm-after-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f3-pdf45-brainstorm-after-reload.png), [f3-pdf45-brainstorm.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f3-pdf45-brainstorm.png), [f3-quota-mid.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f3-quota-mid.json)


### integrity-money-5: Paying subscribers are invited to buy Pro again and create-checkout lets them: double-subscription risk

**Severity:** high · **Verdict:** confirmed · **Root cause:** `paywall-unaware-of-active-subscription`

**Where**

- supabase/functions/create-checkout/index.ts:250-326 (no check for an existing active/trialing/past_due subscription before stripe.checkout.sessions.create)
- src/components/features/subscription/LimitReachedModal.tsx:41-47 ('Upgrade to Pro - $5/mo' regardless of tier)
- src/components/features/subscription/PricingModal.tsx:40-44 (Upgrade Now → redirectToCheckout with no isPro check; shows 'Free — Current')
- src/lib/stripe.ts:14 (successUrl ?checkout=success, which no code reads); src/pages/SettingsPage.tsx (no checkout param handling or polling)
- src/hooks/use-subscription.ts:27,132-140 (60 s staleTime, no refetch after checkout)

**What the reviewer saw**

An active Stripe Pro user (subscriptions row active, Settings showed 'Pro' + 'Manage Subscription') at 50/50 ran Brainstorm. The modal read 'You've used 50 of 50… Upgrade to Pro - $5/mo'. Clicking it opened PricingModal with 'Free — Current' and 'Upgrade Now', and clicking that fired POST /functions/v1/create-checkout (b13-pro-limit-upsell.json, b13-*.png). Calling create-checkout directly for an active subscriber with an allowed origin went straight on to Stripe (it failed only on the placeholder key: 'Invalid API Key provided') with no 'already subscribed' refusal (checkout-probe.json). Separately, opening /app/settings?checkout=success&session_id=… before the webhook showed 'Expired' and 'Upgrade to Pro' with no acknowledgement, and it still showed that 10 s after the webhook set tier pro (b9-checkout-return.json, b9-10s-after-webhook-no-reload.png).

**Why it happens**

Neither the server nor the paywall UI knows whether the caller already pays. The client never closes the gap between redirect and webhook, so right after paying the student is told their access has expired.

**Suggested fix**

create-checkout: before creating a session, query subscriptions (and Stripe by customer) for status in active/trialing/past_due and return 409 with a portal link. LimitReachedModal/PricingModal: read useSubscription(); for Pro show 'Limit resets at midnight UTC' and no upgrade button. SettingsPage: on ?checkout=success show 'Payment received, activating Pro…', poll subscription.refresh() every 2 s for up to 30 s, then strip the params.

**Who it hits**

Any Pro subscriber who hits the 50/day limit, and anyone who returns from Checkout before the webhook, is pushed toward a second $5/mo subscription. Duplicate subscriptions then also trigger the downgrade bug in integrity-money-7 when one is cancelled.

**Independent check**

Reproduced locally. The Stripe Pro subscriber (subscriptions row active; Settings shows Pro and Manage Subscription) had a 1/day limit. The second Brainstorm opened 'Daily Access Paused ... Upgrade to Pro - $5/mo'. Clicking it opened PricingModal with 'Free / Current' and 'Upgrade Now', and that fired POST create-checkout. Calling create-checkout directly for an active subscriber from an allowed origin went straight to the Stripe calls and failed only on the placeholder key. There is no 'already subscribed' refusal. Return path: /app/settings?checkout=success&session_id=... showed Expired and 'Upgrade to Pro' with no acknowledgement, and still did 10 s after the webhook set tier pro (useSubscription staleTime 60 s; nothing in src reads the checkout param). These are two sub-issues that could ship as separate PRs: (a) paywall and checkout ignore an existing subscription; (b) nothing acknowledges the payment or refetches after Checkout. (b) hits every buyer whose webhook lags the redirect.

**Evidence files**

[b13-pro-subscriber-limit-modal-upsell.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b13-pro-subscriber-limit-modal-upsell.png), [b13-pricing-modal-for-pro-user.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b13-pricing-modal-for-pro-user.png), [b13-pro-limit-upsell.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b13-pro-limit-upsell.json), [checkout-probe.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/checkout-probe.json), [b9-return-from-checkout-before-webhook.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b9-return-from-checkout-before-webhook.png), [b9-10s-after-webhook-no-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b9-10s-after-webhook-no-reload.png), [b9-checkout-return.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b9-checkout-return.json), [f5-prolimit.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-prolimit.json), [f5-pro-subscriber-limit-modal-upsell.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-pro-subscriber-limit-modal-upsell.png), [f5-pricing-modal-for-pro-subscriber.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-pricing-modal-for-pro-subscriber.png), [checkout-active-subscriber.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/checkout-active-subscriber.json), [f5-checkout-return.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-checkout-return.json), [f5-return-from-checkout-before-webhook.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-return-from-checkout-before-webhook.png), [f5-return-10s-after-webhook-still-expired.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-return-10s-after-webhook-still-expired.png)


### integrity-money-6: Leaving Ask while it is answering leaves it stuck: 'Typing' forever, input disabled, question unanswered

**Severity:** high · **Verdict:** confirmed · **Root cause:** `ask-request-tied-to-page-unmount`

**Where**

- src/pages/AskPage.tsx:53-57 (abortActiveRequest bumps the request id and aborts, but does not reset askLoading)
- src/pages/AskPage.tsx:65-67 (unmount cleanup calls abortActiveRequest)
- src/pages/AskPage.tsx:285-288 (finally only clears askLoading when isCurrentRequest(), which is now false)
- src/lib/stores/session-store.ts askLoading/askStreamingAssistant (global, not persisted)

**What the reviewer saw**

/app/ask: sent a question (ai-stream delayed 4 s), clicked the Library link 0.8 s later, waited 6 s, went back. The chat showed the question with a 'Typing|' bubble and the input was disabled (a Playwright fill on 'Ask your debate coach...' timed out: element is disabled), and it stayed that way. askMessages ended with the unanswered user message (b11-ask.json, b11-ask-back-after-navigating-away.png, b11-ask-input-disabled-after-return.png). In citation/non-stream mode the request is not aborted at all: it completes and is paid for, then dropped, because isCurrentRequest() is false.

**Why it happens**

Ask request lifetime is tied to the page component, but its loading flags live in the global store. The cleanup cancels the request without clearing the global flags, and the request's own finally then declines to clear them.

**Suggested fix**

Either keep the Ask request alive in the store (like the other tools do, so the answer lands when the user comes back), or have the unmount cleanup call setAskStreamingAssistant(null) and setAskLoading(false), and mark the dangling question as interrupted with a Retry action.

**Who it hits**

Students often check the Library or another tool while waiting for an answer. After that, Ask cannot be used until a reload or Clear, and the question gets no answer.

**Independent check**

Code matches: the unmount cleanup (AskPage.tsx:65-67) calls abortActiveRequest, which bumps the id but never resets the global askLoading/askStreamingAssistant, and finally (285-288) skips them because isCurrentRequest() is false. Reproduced locally (ai-stream held 4 s): sent, clicked Library at 0.8 s, went back after 6 s. The 'Typing' bubble stayed and the input was disabled 1.5 s and again 9.5 s later. askMessages ended with only the user message. The citation (non-stream) sub-claim also reproduced: the 'ask' provider call completed (quota +1, ai_requests success), the answer was dropped, and the chat stayed on 'Thinking...' with the input disabled. Clear or a full reload recovers, since askLoading is not persisted. Side note outside this finding: the Citations toggle was off again after coming back.

**Evidence files**

[b11-ask-back-after-navigating-away.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b11-ask-back-after-navigating-away.png), [b11-ask-input-disabled-after-return.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b11-ask-input-disabled-after-return.png), [b11-ask.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b11-ask.json), [b11-ask.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b11-ask.mjs), [f6-f11-ask.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f6-f11-ask.json), [f6-ask-back-after-navigating-away.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f6-ask-back-after-navigating-away.png), [f6-ask-still-stuck-8s-later.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f6-ask-still-stuck-8s-later.png), [f8-reload-and-f6-citation.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-reload-and-f6-citation.json), [f6-citation-mode-after-return.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f6-citation-mode-after-return.png)


### integrity-money-4: Stripe webhook idempotency is broken: replayed or out-of-order events are applied again and can give a cancelled user Pro

**Severity:** medium (reviewer said high) · **Verdict:** confirmed · **Root cause:** `webhook-dedupe-after-side-effects`

**Where**

- supabase/functions/stripe-webhook/index.ts:65-104 (handlers run first)
- supabase/functions/stripe-webhook/index.ts:106-129 (webhook_events insert and duplicate check run only after processing)
- supabase/functions/stripe-webhook/index.ts:300-334 (subscription.updated applies event state without comparing event.created or re-fetching)
- e2e/full-stack/billing.spec.ts:122-123 (the replay test only checks the response says duplicate:true)

**What the reviewer saw**

Signed with the local test secret from billing.spec.ts. Event E1 customer.subscription.updated(active) → tier pro, row active. E2 customer.subscription.deleted → tier expired, row canceled. Replaying E1 with the same event id returned {received:true,status:200,duplicate:true}, yet the user was back to tier pro with the subscription row 'active' and current_period_end 30 days out, which getSubscriptionInfo treats as Pro. With distinct ids, an older updated(active) delivered after deleted also reactivated the user (webhook-scenarios.json). The maintained billing spec passes because it only checks the duplicate flag.

**Why it happens**

The dedupe record is written after the side effects (to allow retries on failure), so a duplicate is never skipped, only labelled. Handlers trust the event payload's state instead of current Stripe state or event order.

**Suggested fix**

In stripe-webhook/index.ts, claim the event first (insert into webhook_events with a status column, then skip when it is already processed) and mark it processed after the handlers succeed. For subscription events, re-fetch stripe.subscriptions.retrieve(id) and write that state, or ignore events older than the row's last applied event.created (add a column). Make billing.spec.ts assert that the tier is still 'expired' after replaying E1 following the delete.

**Who it hits**

Stripe documents both duplicate deliveries and no ordering guarantee. Any slow response or retry around a cancellation can leave a cancelled customer with free Pro until another event happens to arrive.

**Independent check**

Code: stripe-webhook/index.ts:65-104 runs the handlers, and the webhook_events insert (106-129) only labels duplicates afterwards. handleSubscriptionUpdated (300-334) writes the payload state and sets tier pro with no event.created or re-fetch check. Reproduced locally with signed events: E1 updated(active) gave pro, E2 deleted gave expired/canceled. Replaying E1 returned {duplicate:true}, yet the tier went back to pro, the row to active, and a Claude Sonnet 5 call then returned 200. An older updated(active) with a new id, delivered after deleted, also re-activated the user. billing.spec.ts says 'a replayed event must be acknowledged, not reapplied' but only asserts the flag. Downgraded from high: it needs a retry or late delivery that lands after a cancellation (rare), and the harm is free Pro until the next event, not lost money from paying users.

**Evidence files**

[webhook-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/webhook-scenarios.json), [webhook.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/webhook.mjs), [20261008T161120Z-billing](/home/codex/Projects/DebateLab/.verify/artifacts/20261008T161120Z-billing), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-7: Promo codes and Stripe events overwrite one shared entitlement column: paying users lose Pro, limits drop, lifetime promos get erased

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `single-mutable-entitlement-tier`

**Where**

- supabase/migrations/20260819000000_security_hardening.sql:117-140 (extended_trial sets subscription_tier='trial'; extra_limit sets daily_limit_override, even below the plan default)
- supabase/functions/stripe-webhook/index.ts:183-188 and 320-325 (checkout/subscription.updated set grace_period_ends_at=null, erasing free_month/lifetime promos)
- supabase/functions/stripe-webhook/index.ts:241-246, 278-283 (payment_failed/deleted set tier 'expired' even with a lifetime promo or another active subscription)
- supabase/functions/_shared/entitlements.ts:59-120 (tier decides the branch, so 'trial'/'expired' ignore active subscriptions and a 9999 grace date)

**What the reviewer saw**

promo-scenarios.json: a paying Stripe Pro user called Claude Sonnet 5 → 200; redeemed an extended_trial code → tier 'trial'; the same call → 403 'This model requires a Pro subscription'. A Stripe Pro user (50/day) redeemed extra_limit (15) → override 15, and request 16 was refused 'You've used all 15'. A lifetime-promo user (grace 9999, override 50) redeemed extended_trial → tier trial, Pro models 403. webhook-lifetime-promo.json: lifetime user + subscription.updated(active) → grace_period_ends_at null; then deleted → tier 'expired'. webhook-scenarios.json S4: two active subscriptions, deleting one → tier 'expired' although the other is active.

**Why it happens**

Entitlement is one mutable tier plus grace and override columns that each billing source writes as if it were the only one. Nothing computes access as the best of the active grants (Stripe subscription, promo window, trial, admin override).

**Suggested fix**

Compute entitlements as the max over grants in getSubscriptionInfo (and its two client copies in use-subscription.ts and settings-store.ts): any active/trialing subscription → Pro; grace in the future → Pro; trial in the future → trial. Webhooks should then update only the subscriptions table, not subscription_tier or grace_period_ends_at. In redeem_promo_code_atomic, never lower tier or limits: use GREATEST for daily_limit_override, and leave tier unchanged for extended_trial when the user already has Pro.

**Who it hits**

Schools hand codes to whole classes, so paying students who redeem a trial or extra-limit code lose Pro features or get a lower limit. Lifetime-promo holders who ever subscribe lose lifetime access when they cancel. In each case the money paid no longer matches the access given.

**Independent check**

Reproduced locally through the real redeem-promo function and signed webhooks. A paying Stripe Pro user's Sonnet call returned 200. After redeeming extended_trial: tier 'trial', and the same call got 403 'requires a Pro subscription' while the subscription stayed active. A Stripe Pro user who redeemed extra_limit {limit:3} got override 3, and request 4 was refused 'used all 3' (was 50). For a lifetime-promo user (grace 9999, override 50), subscription.updated(active) set grace_period_ends_at null and a later deleted set tier 'expired' (lifetime Pro gone; the leftover override 50 still allows 50/day without Pro models). With two active subscriptions, deleting one gave tier 'expired' while the other stayed active. Code: security_hardening.sql:117-140 and stripe-webhook/index.ts:183-188, 241-246, 278-283, 320-325, entitlements.ts:59-120. Medium holds and borders on high, because it needs a second billing event on a paying account. This is a separate fix from integrity-money-4 (dedupe-first) and -17.

**Evidence files**

[promo-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/promo-scenarios.json), [webhook-lifetime-promo.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/webhook-lifetime-promo.json), [webhook-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/webhook-scenarios.json), [promo.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/promo.mjs), [webhook2.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/webhook2.mjs), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-8: AI quota is charged at request start and never refunded or deduplicated, so failures and retries cost students extra requests

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `quota-reserve-without-release`

**Where**

- supabase/functions/_shared/entitlements.ts:176 (consume_daily_quota before any provider work)
- supabase/functions/ai/index.ts:757-795 (error path logs usage but does not release the slot)
- src/pages/AskPage.tsx:215-228 (a stream failure with no text silently retries via askChat, a second paid request; this applies to 500s, 401s and 402s alike)
- src/lib/stores/sparring-store.ts + SparringRound (a restored round re-requests the opponent turn; respond has no claim, unlike score)

**What the reviewer saw**

quota-scenarios.json q2: forced a provider 500 on brainstorm → client got 500, daily_usage_counters went to 1; with limit 2 the next request succeeded and the third got 402. b11-ask.json: one Ask question with ask-stream forced to 500 → quotaUsed 2, providerCalls ['ask-stream','ask'], ai_requests ['ask:error:stream_error','ask:success']. b16-sparring-reload.json: reloading while the opponent speech was pending → quotaUsed 2 and 2 sparring provider calls for one speech. b4-submit.json: reloading mid-brainstorm → quota 3→4 and an ai_requests success row, but no brainstorms row (the paid result was discarded).

**Why it happens**

The atomic reservation (correct against over-spend) has no matching release, and client retries have no idempotency key, so every retry or reload is a new paid request.

**Suggested fix**

Add a release_daily_quota RPC (service_role only) and call it when the request fails before the provider returns usage, or when the provider errors with no tokens. Limit the Ask fallback to transport failures (network/TypeError, or a stream endpoint missing): never after an HTTP response from ai-stream. Give sparring respond an idempotency key per (session, turn) like the score claim.

**Who it hits**

Trial users have 5 requests a day. One provider hiccup or one reload during a sparring turn costs 2 of them, and the same goes for Pro users at a smaller scale.

**Independent check**

Reproduced locally. With a forced provider 500 on brainstorm, the client got 500, daily_usage_counters went to 1, and at limit 2 the second call succeeded and the third got 402. One Ask with ask-stream forced to 500: provider calls ['ask-stream','ask'], quota 2, ai_requests ask:error then ask:success. Reload mid-Brainstorm (response held 10 s, reload at 2.5 s): quota 0 to 1, an ai_requests success row, no brainstorms row, no result on screen (the paid result was discarded). Not re-run: the sparring reload sub-claim. The code agrees, since only the score action has a claim (ai/index.ts:464-500) and respond has none.

**Evidence files**

[quota-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/quota-scenarios.json), [b11-ask.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b11-ask.json), [b16-sparring-reload.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b16-sparring-reload.json), [b16-sparring-12s-after-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b16-sparring-12s-after-reload.png), [b4-submit.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b4-submit.json), [quota.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/quota.mjs), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json), [f8-f12.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-f12.json), [f8-ask-after-stream-failure.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-ask-after-stream-failure.png), [f8-reload-and-f6-citation.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-reload-and-f6-citation.json), [f8-after-reload-mid-brainstorm.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-after-reload-mid-brainstorm.png)


### integrity-money-9: Promo-code brute force is still open, and different error messages reveal expired or used-up codes

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `promo-redeem-no-attempt-limit` · **Known in plan:** next-15 #2

**Where**

- supabase/migrations/20260819000000_security_hardening.sql:117-142 (redeem_promo_code_atomic: no attempt counter; granted to authenticated)
- supabase/functions/redeem-promo/index.ts:44-53 (no limit; logs every attempted code as 'redeemed')

**What the reviewer saw**

promo-scenarios.json p4: one user made 40 wrong guesses through the redeem-promo function in 3,093 ms (all 'Invalid or expired promo code'), then a valid free_month code still worked. 20 more direct PostgREST rpc('redeem_promo_code_atomic') calls, bypassing the function, were also unlimited. An expired code returns 'This promo code has expired' and an exhausted one 'This promo code has reached its usage limit', both distinct from an unknown code.

**Why it happens**

next-15 #2 was not implemented: the limit has to live in SQL because the RPC is callable directly.

**Suggested fix**

As planned: a per-user failed-attempt window inside redeem_promo_code_atomic modelled on demo_access_attempts, one generic message for unknown, expired, exhausted and locked-out, plus a pgTAP test. Also stop logging raw codes on failure in redeem-promo.

**Who it hits**

Any free account (including demo-code users) can script guesses against human-chosen codes. lifetime_pro codes grant permanent Pro.

**Independent check**

Known in plan: next-15 #2, still open. redeem_promo_code_atomic is only defined in 20260819000000_security_hardening.sql (20260820090000 only re-grants it) and has no attempt counter. Locally, 30 wrong codes through redeem-promo took 2,311 ms, all 200 'Invalid or expired promo code', and a valid code still worked after them. 10 direct PostgREST rpc calls all answered. Expired, exhausted and unknown codes return different messages. Also, redeem-promo/index.ts:49 logs 'User X redeemed code CODE' for every attempt, including failures, with the raw code.

**Evidence files**

[promo-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/promo-scenarios.json), [promo.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/promo.mjs), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-10: A result that arrives after a debate switch shows under the new debate, breaking the 'debates never mix' rule

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `tool-results-not-scoped-to-debate`

**Where**

- src/components/features/debate/DebateDialogs.tsx:20-36 (switch/create call clearSession() but do not cancel or scope in-flight requests)
- src/pages/BrainstormPage.tsx:37-47 (setBrainstormResult runs whatever the debate is now); same pattern in Generate/Attack/Factoids pages
- src/lib/stores/session-store.ts brainstormLoading/brainstormResult (one global slot per tool)

**What the reviewer saw**

Debate A current, Brainstorm started (ai response delayed 7 s); switched to debate B through the header while pending. The page kept 'Generating Ideas…', then rendered A's ideas next to B's motion field and B's 'Working in' strip with a 'Brainstorm complete' toast. The DB row was correctly filed in A (b2-switch.json, b2-result-after-switch.png). Switching after a result clears it correctly (b4 step 5), so only in-flight requests leak.

**Why it happens**

Result and loading state are per-tool globals with no owning debate id. clearSession wipes them at switch time, but the pending promise writes into the slot afterwards.

**Suggested fix**

Store the debate id with each tool result (for example brainstormResult: {debateId, output}). Render it only when it matches the current scope and show 'Result saved to <debate A>' otherwise. Reset the *Loading flags in clearSession.

**Who it hits**

Students see one motion's arguments presented as another's. Follow-up buttons (Discuss, Open in Crossfire) then carry A's content into B.

**Independent check**

Reproduced locally. Debates A and B existed with A current. Brainstorm started (ai response held 7 s), then the header switch moved to B. The page kept 'Generating', then rendered the ideas next to B's motion field with a 'Brainstorm complete' toast. The brainstorms row was filed under A, which is correct. Code: DebateDialogs.tsx:20-36 calls clearSession at switch time, and BrainstormPage.tsx:37-47 calls setBrainstormResult with no scope check afterwards.

**Evidence files**

[b2-switch.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b2-switch.json), [b2-switch-midrequest.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b2-switch-midrequest.png), [b2-result-after-switch.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b2-result-after-switch.png), [b2-switch.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b2-switch.mjs), [f10-switch.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f10-switch.json), [f10-switch-midrequest.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f10-switch-midrequest.png), [f10-result-after-switch.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f10-result-after-switch.png)


### integrity-money-11: Ask throws away the student's text: 'Message is too large — shorten it' appears with an empty box, and refused questions are cleared

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ask-optimistic-input-clear`

**Where**

- src/components/features/ask/AskChat.tsx:402-408 (setInput('') right after calling onSend, before validation or the result)
- src/pages/AskPage.tsx:145-151 (size check toasts 'shorten your question' after the input is gone)
- src/pages/AskPage.tsx:153-154 (the question is added to the chat before the request; on a 402 it stays as an unanswered bubble)

**What the reviewer saw**

Pasted 54,400 chars into Ask and clicked Send: toast 'Message is too large — Remove some attachment text or shorten your question before sending', input length 0, no provider call (b12-asksize.json, b12-ask-too-large-input-cleared.png). At the daily limit, the typed question was cleared from the box and left in the chat as a sent message with no answer, behind the limit modal (b12-ask-limit-reached.png).

**Why it happens**

An optimistic clear happens in the child, and validation and refusal happen later in the parent, with no path to put the text back.

**Suggested fix**

Make onSend return a promise or boolean, and clear the input only once the message is accepted (validated and the request started). On a size error or a 402/403 refusal, restore the text and remove the optimistic user bubble. Optionally persist the Ask draft like the other tool forms.

**Who it hits**

Students pasting evidence into Ask lose the whole paste. At the limit they lose the question they typed.

**Independent check**

Code: AskChat.tsx:402-408 calls setInput('') right after onSend. AskPage.tsx:145-151 validates later and 153-154 adds the user bubble before the request. Reproduced locally: pasted 54,900 chars and clicked Send. The toast said 'Message is too large', the input length was 0, and no bubble or provider call happened. At the daily limit, the typed question was cleared from the box, left as a sent bubble with no answer, and the 'Daily Access Paused' modal opened. askMessages = ['user'].

**Evidence files**

[b12-ask-too-large-input-cleared.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b12-ask-too-large-input-cleared.png), [b12-ask-limit-reached.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b12-ask-limit-reached.png), [b12-asksize.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b12-asksize.json), [b12-asksize.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b12-asksize.mjs), [f6-f11-ask.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f6-f11-ask.json), [f11-ask-too-large-input-cleared.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f11-ask-too-large-input-cleared.png), [f11-ask-at-limit-question-left-unanswered.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f11-ask-at-limit-question-left-unanswered.png), [f11-ask-at-limit-after-closing-modal.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f11-ask-at-limit-after-closing-modal.png), [f5-prolimit.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-prolimit.json)


### integrity-money-12: The trial allowance cannot finish one Crossfire round, and the unfinished round is thrown away

**Severity:** medium · **Verdict:** partly · **Root cause:** `per-request-quota-for-multi-turn-practice`

**Where**

- supabase/functions/_shared/entitlements.ts:104-111 (trial = 5/day; each Crossfire answer and the debrief consume 1)
- src/pages/CrossfirePage.tsx:405-419 (the round is recorded only after a debrief completes)

**What the reviewer saw**

A trial user (5/day) started Crossfire (question-the-AI) and asked questions. 5 answers used 5 slots (quota 5, 5 crossfire provider calls). The 6th question ended the round with 'Could not build the debrief — You've used all 5 of your daily requests… Retry debrief', and the round was not filed (b15-crossfire-limit.json, b15-crossfire-limit-midround.png).

**Why it happens**

Per-request quota pricing makes multi-call practice modes cost far more than single-shot tools, and the round only persists once a paid debrief succeeds.

**Suggested fix**

Count a Crossfire round (and a Sparring round) as one quota unit: reserve at start and give its turns a round-scoped token, like the signal token already does. Or warn up front ('this round uses about N of your 5'). Save the transcript when the round ends even if the debrief is refused, and let the debrief be generated later.

**Who it hits**

A trial user's first try at Crossfire, a headline feature, ends in an error and loses the practice they just did.

**Independent check**

Reproduced locally with a trial user (5/day) in question-the-AI mode. Five answers used all 5 slots (5 crossfire provider calls). The 6th question ended in 'Could not build the debrief: You've used all 5 of your daily requests' with 'Retry debrief', and no crossfires row was filed. Correction: the round is not thrown away. After a reload the transcript and 'Retry debrief' are still there (per-user crossfire draft), so it can be finished once quota is back. 'Cannot finish one round' is also overstated: rounds are 180 s and timed, so a student who asks 4 or fewer questions still gets a debrief. Real defects: the 5/day trial budget is gone after about 5 Crossfire questions, and a refused question is shown as a debrief failure.

**Evidence files**

[b15-crossfire-limit-midround.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b15-crossfire-limit-midround.png), [b15-crossfire-limit.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b15-crossfire-limit.json), [b15-crossfire-limit.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b15-crossfire-limit.mjs), [f8-f12.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f8-f12.json), [f12-crossfire-trial-limit.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f12-crossfire-trial-limit.png), [f12-crossfire-after-end.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f12-crossfire-after-end.png), [f12-crossfire-after-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f12-crossfire-after-reload.png)


### integrity-money-13: The initial data load overwrites edits made while it is in flight, and cross-tab sync replaces the whole session store while the Current Debate stays per-tab

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `hydrate-overwrites-concurrent-writes`

**Where**

- src/lib/stores/session-store.ts:1082-1192 (hydrateFromServer replaces every list with its snapshot; no write counter)
- src/lib/stores/debate-store.ts:111-140 (the debate store does have a debateWrites guard, so the two stores are inconsistent)
- src/hooks/use-session-storage-sync.ts:10-22 (useSessionStore.setState(payload.state) from any tab's write; the debate store is not synced)

**What the reviewer saw**

Hydrate race: delayed only the sources list response of the initial load by 5 s, added a source during it. The source was visible immediately (1), then vanished when the snapshot landed (0); the DB had the row (b14-hydrate-overwrite.json, b14-source-vanished-after-hydrate.png). A re-add creates a duplicate. Two tabs: tab 1 showed a Brainstorm result in debate A; tab 2 switched to B. Tab 1's result disappeared, synced through storage, while tab 1's header still read debate A (b8-tabs.json, b8-tab1-after-tab2-switch.png).

**Why it happens**

Server snapshots replace local lists without checking for writes that happened after the snapshot started. Cross-tab sync is all-or-nothing for one store and absent for the other.

**Suggested fix**

Copy debate-store's write-epoch guard into session-store hydrateFromServer: count writes, and re-run or merge by id when one landed mid-load. Narrow the storage sync to drafts (or drop it, once integrity-money-3 removes the lists from storage), and either sync the debate store too or have every tab re-hydrate debates on the storage event.

**Who it hits**

On slow school wifi, sources or results saved right after opening the app disappear until reload, which leads to duplicates. Two-tab users see their results vanish next to the wrong debate header.

**Independent check**

Hydrate race reproduced locally. The initial GET sources?select=* was held 6 s, and a source was added during it: visible at once (1), gone after the snapshot landed (0), while the DB had the row. Code: hydrateFromServer (session-store.ts:1082-1192) replaces lists with no write counter, while debate-store.ts:111-140 has the debateWrites guard. Two tabs: tab 1 showed a Brainstorm result in debate A, and tab 2 started debate B. Tab 1's result vanished through the storage event (use-session-storage-sync.ts setState of the whole payload) while tab 1 stayed in debate A ('Using 1 source and 1 saved result'). These are two sub-causes. The cross-tab half is not covered by integrity-money-3's fix, because brainstormResult and the forms stay persisted. Give it its own fix (narrow or remove the storage sync, and sync or re-hydrate the debate store).

**Evidence files**

[b14-hydrate-overwrite.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b14-hydrate-overwrite.json), [b14-source-vanished-after-hydrate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b14-source-vanished-after-hydrate.png), [b8-tabs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b8-tabs.json), [b8-tab1-after-tab2-switch.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b8-tab1-after-tab2-switch.png), [b14-hydrate.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/scripts/b14-hydrate.mjs), [f13-hydrate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f13-hydrate.json), [f13-source-visible-before-hydrate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f13-source-visible-before-hydrate.png), [f13-source-vanished-after-hydrate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f13-source-vanished-after-hydrate.png), [f13-tab1-after-tab2-new-debate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f13-tab1-after-tab2-new-debate.png)


### integrity-money-14: Auto Fast gives trial users GLM-5.3 Flash, a model the catalog marks Pro-only and refuses when picked directly

**Severity:** low · **Verdict:** confirmed · **Root cause:** `auto-router-ignores-pro-only`

**Where**

- supabase/functions/_shared/model-catalog.ts:27 (z-ai/glm-5.3-flash isProOnly: true)
- supabase/functions/_shared/auto-model-router.ts:20-25, 76 (Auto Fast candidates and fallback include glm-5.3-flash)
- src/lib/stores/settings-store.ts:353 (client migration moves glm-5.3-flash off manual selection)

**What the reviewer saw**

quota-scenarios.json q3, trial user: model z-ai/glm-5.3-flash → 403 'requires a Pro subscription'; model auto-fast → 200 with meta.resolvedModel 'z-ai/glm-5.3-flash' (provider calls: jev, then research-queries and brainstorm on glm-5.3-flash).

**Why it happens**

The router's candidate list ignores the catalog's isProOnly flag.

**Suggested fix**

Decide the policy. Either drop isProOnly from glm-5.3-flash (and update PricingModal copy, which lists 'GLM Flash' as a Pro feature), or filter FAST_CANDIDATES and the fallback by canAccessProModels in resolveModelSelection.

**Who it hits**

The plan boundary is inconsistent: Pricing says GLM Flash is Pro, yet trial users get it by default through Auto Fast. Cost impact is small.

**Independent check**

Locally, a fresh trial user picking z-ai/glm-5.3-flash directly got 403 'requires a Pro subscription'. auto-fast returned 200 with meta.resolvedModel z-ai/glm-5.3-flash (provider calls: jev, research-queries and brainstorm on glm-5.3-flash). Code: model-catalog.ts:27 isProOnly true; auto-model-router.ts:20-25 and 75-76 skip the check for auto candidates. The UI is inconsistent too: en.json autoFastDescription 'Fast routing, usually GLM' against pricing 'All 10 models, including ... GLM Flash' as a Pro feature.

**Evidence files**

[quota-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/quota-scenarios.json), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-15: Usage rows are uneven: every refused ai request inserts an ai_requests row (unbounded), ai-stream logs none, and admin stats count refusals as errors

**Severity:** low · **Verdict:** confirmed · **Root cause:** `refusals-logged-as-usage-rows`

**Where**

- supabase/functions/ai/index.ts:525 (logUsage 'rate_limited' on every refusal)
- supabase/functions/ai-stream/index.ts:177-185 (no log on refusal)
- supabase/migrations/20260819000000_security_hardening.sql:84-92 (get_daily_usage errors = status != 'success')

**What the reviewer saw**

quota-scenarios.json q4: 1 success, then 10 refused calls produced 10 'rate_limited' rows. q5: ai-stream refused (402) and logged nothing. In get_daily_usage, rate_limited and cancelled rows count as errors and as requests.

**Why it happens**

Refusals are logged into the usage-and-cost table instead of a counter.

**Suggested fix**

Stop inserting a row per refusal (or rate-limit that logging, for example one per user per day per code). Make ai and ai-stream behave the same. Exclude rate_limited from 'errors' in get_daily_usage.

**Who it hits**

A client that loops after hitting its limit grows ai_requests without bound and inflates admin error rates.

**Independent check**

Locally, 1 success and 6 refused ai calls left 6 'rate_limited:limit_reached' rows (ai/index.ts:525). An ai-stream refusal (402) logged nothing (ai-stream/index.ts:177-185). Location correction: get_daily_usage has no consumers in src or supabase/functions (dead RPC). The live admin stats path is supabase/functions/admin/index.ts: successRate at :293 counts refusals as failures, and the daily breakdown at :318 adds them to errors. That path also pages through every ai_requests row, so unbounded refusal rows slow the admin stats too.

**Evidence files**

[quota-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/quota-scenarios.json), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-16: useSubscription runs an exact count(*) on ai_requests on every fetch for dailyUsed/dailyLimit, values no component reads

**Severity:** low · **Verdict:** confirmed · **Root cause:** `unused-daily-usage-count-query`

**Where**

- src/hooks/use-subscription.ts:114-125 (count query), 144-158 (returned)
- grep: dailyUsed and dailyLimit from this hook have no consumers (SettingsPage and ModelSelector use tier/isPro/hasStripeBilling only)

**What the reviewer saw**

rg 'dailyUsed' src → only src/hooks/use-subscription.ts. The count would also be wrong if shown: it counts refusals, errors and jev_model_router/jev_source_ranking rows (one Auto request = 2 rows), not daily_usage_counters.

**Why it happens**

A leftover usage meter.

**Suggested fix**

Delete the count query and the dailyUsed/dailyLimit fields. If a meter is wanted later, read daily_usage_counters (quota_key 'ai') through an RPC.

**Who it hits**

One wasted database round trip per Settings visit or ModelSelector mount (60 s stale time).

**Independent check**

grep: dailyUsed/dailyLimit from useSubscription have no readers outside use-subscription.ts. SettingsPage uses the hook, and ModelSelector reads only isPro/loading. On staging (pro account, /app/settings) the page sent HEAD /rest/v1/ai_requests?select=*&user_id=eq.<id>&created_at=gte.<today> with Prefer count=exact. The cost is small (60 s staleTime), so low is fair. It could arguably be a nit.

**Evidence files**

[staging-settings.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/staging-settings.json)


### integrity-money-17: invoice.payment_failed cuts access on the first failed renewal attempt, and a failed downgrade write is still recorded as processed

**Severity:** low · **Verdict:** confirmed · **Root cause:** `payment-failed-immediate-downgrade`

**Where**

- supabase/functions/stripe-webhook/index.ts:219-252 (status past_due + tier 'expired'; userError only logged, not thrown)
- supabase/functions/_shared/entitlements.ts:84-101 (past_due is not active, so access ends regardless)

**What the reviewer saw**

webhook-scenarios.json S3: an active Pro user + invoice.payment_failed → tier 'expired', row past_due, right away. grace_period_ends_at exists but Stripe paths never set it.

**Why it happens**

A 'downgrade immediately per spec' choice, with no grace for Stripe's smart retries.

**Suggested fix**

Product call for Adam. If grace is wanted, treat past_due as Pro until current_period_end + N days in getSubscriptionInfo and stop writing tier from payment_failed. Either way, throw on userError so Stripe retries.

**Who it hits**

A card glitch locks a paying student out until Stripe's retry succeeds and a subscription.updated arrives.

**Independent check**

Locally, an active Pro user plus a signed invoice.payment_failed left tier 'expired' and the row 'past_due' at once, with a 200 response. Code: stripe-webhook/index.ts:219-252; userError is logged but not thrown at 241-248, and the same goes for handleSubscriptionDeleted at 278-286. Extra detail from code reading, not run because it calls stripe.subscriptions.retrieve: handlePaymentSucceeded (199-217) only sets the subscriptions row active and never restores the tier. A recovered payment therefore restores access only once a customer.subscription.updated(active) arrives. Grace or no grace is a product call.

**Evidence files**

[webhook-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/webhook-scenarios.json), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-18: Account-deletion Checkout race: stripe-webhook still has no backstop for subscriptions with no live account

**Severity:** low · **Verdict:** confirmed · **Root cause:** `checkout-completed-no-missing-user-backstop` · **Known in plan:** next-15 open follow-up from #83 (Checkout during account deletion)

**Where**

- supabase/functions/stripe-webhook/index.ts:143-198 (checkout.session.completed upserts subscriptions for metadata.user_id; FK to auth.users fails for a deleted user → throw → 500 → Stripe retries for days, and the subscription is never canceled)
- supabase/functions/stripe-webhook/index.ts:254-290 (deleted/updated for an unknown subscription: silent 200)

**What the reviewer saw**

Code reading: subscriptions_user_id_fkey REFERENCES auth.users ON DELETE CASCADE (checked in the local DB), and no handler cancels the Stripe subscription when the user is missing. Locally, customer.subscription.deleted for an unknown subscription returned 200 and did nothing (webhook-scenarios.json S6). checkout.session.completed cannot run locally: it calls the Stripe API.

**Why it happens**

The planned backstop was never built. The account function closes most of the window by expiring open sessions, but not a session completed during deletion.

**Suggested fix**

In handleCheckoutCompleted, if auth.admin.getUserById(metadata.user_id) finds no user, cancel the subscription in Stripe (stripe.subscriptions.cancel), record the event and return 200. Add a Deno test.

**Who it hits**

Rare, but when it happens a parent or student keeps being billed with no account.

**Independent check**

Known in plan: the next-15 open follow-up from #83. Code reading only, because checkout.session.completed calls stripe.subscriptions.retrieve and cannot run locally with the placeholder key. handleCheckoutCompleted (stripe-webhook/index.ts:138-197) has no missing-user branch. The upsert to subscriptions (FK to auth.users) would throw and return 5xx for Stripe to retry, and nothing cancels the Stripe subscription. Locally, customer.subscription.deleted for an unknown subscription returned 200 and changed nothing.

**Evidence files**

[webhook-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/webhook-scenarios.json), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-19: create-checkout returns raw Stripe errors and price config to the browser, and 'discount' promos are 'noted' but never applied

**Severity:** low · **Verdict:** confirmed · **Root cause:** `checkout-leaks-stripe-errors-discount-unwired`

**Where**

- supabase/functions/create-checkout/index.ts:111-121 (AppError details include recurringPriceIds, configuredPriceId, configuredLookupKey)
- supabase/functions/create-checkout/index.ts:339-347 (raw Stripe message + type/code/param returned)
- supabase/functions/create-checkout/index.ts:300-323 (discount promo only sets allow_promotion_codes; the code is not attached)
- supabase/migrations/20260819000000_security_hardening.sql:133 (discount: 'Discount code noted! Apply it at checkout', not recorded anywhere)

**What the reviewer saw**

checkout-probe.json: the browser-facing error was 'Invalid API Key provided: sk_test_***…used'. promo-scenarios.json p5: a discount code returns success 'Discount code noted!', but nothing stores it, and Checkout only shows a generic promotion-code field.

**Why it happens**

Debug detail passes through to clients, and discount promos are half-wired.

**Suggested fix**

Return generic errors to the client and log the details server-side. For discounts, map the promo to a Stripe promotion_code id and pass discounts: [{ promotion_code }] in sessionParams, or remove the 'discount' type.

**Who it hits**

Students who enter a discount code in the app reach Stripe without the discount and have to type it again. A minor information leak.

**Independent check**

Locally, create-checkout for a signed-in user from an allowed origin returned 400 {error:'Invalid API Key provided: sk_<masked by Stripe>', details:{type:'W',statusCode:401}}: the raw Stripe message plus a minified class name (create-checkout/index.ts:330-347). A discount promo through redeem-promo returned success 'Discount code noted!', but no user_promos row was written (the RPC returns before the insert) and settings were unchanged. create-checkout:300-323 only sets allow_promotion_codes when the code is passed, and never attaches a discount.

**Evidence files**

[checkout-probe.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/checkout-probe.json), [promo-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/promo-scenarios.json), [checkout-active-subscriber.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/checkout-active-subscriber.json), [backend-scenarios.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/backend-scenarios.json)


### integrity-money-20: Settings says 'Signed in with Google' for demo-code and email accounts

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `settings-account-copy-assumes-google`

**Where**

- src/locales/en.json settings.accountDesc ('Signed in with Google. API keys are managed securely on the server.')
- route /app/settings, Account card

**What the reviewer saw**

b9-10s-after-webhook-no-reload.png: a demo-code account (zz-review-…@fullstack.test) shows 'Signed in with Google'.

**Why it happens**

Static copy written when Google was the only sign-in.

**Suggested fix**

Use the session's app_metadata.provider for the wording, or drop the provider sentence, in en, es and hu.

**Who it hits**

Confusing for the many students who sign in with an email code or demo code.

**Independent check**

The local demo-code account and the staging seeded email account (seed-pro@staging...) both show 'Signed in with Google. API keys are managed securely on the server.' (SettingsPage.tsx:297, settings.accountDesc). The same claim is in es.json:456 and hu.json:456.

**Evidence files**

[b9-10s-after-webhook-no-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/integrity-money/b9-10s-after-webhook-no-reload.png), [f20-staging-settings-account-card.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f20-staging-settings-account-card.png), [staging-settings.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/staging-settings.json), [f5-return-10s-after-webhook-still-expired.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-integrity-1/f5-return-10s-after-webhook-still-expired.png)

