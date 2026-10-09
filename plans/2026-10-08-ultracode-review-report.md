# Ultracode review: ranked report

**Status:** Review finished 2026-10-09 against `main` at `40738ea` (staging synced to the same commit). Nothing has been fixed yet. This is the work list for the fixes.

This is the output of the 2026-10-08 ultracode review plan. Ten reviewers each took one area. They read the code and used the real app on staging in headless Chromium: phones, tablets, dark mode, slow networks and a 4x slower CPU. The integrity reviewer used the local full stack, because billing and race repros need a fake Stripe and a database it can reset. Then separate verifiers re-ran every finding from scratch with their own sessions and screenshots, re-rated the severity and grouped findings that one fix covers.

## Summary

- **188 findings.** The verifiers grouped them into 159 distinct root causes, and the 17 workstreams below group those further by shared fix. A verifier checked every one of the 188 independently: 168 confirmed, 18 partly confirmed, 1 refuted and 1 that couldn't be checked without spending AI budget. Final severities: 15 high, 74 medium, 85 low and 13 nit.
- **Nothing is critical.** Data isolation holds. RLS is on for all 51 public tables, and probes with other accounts' tokens found no foreign rows. Every Edge Function checks the JWT and ownership, and every SSRF trick against URL import was blocked. Warm loads and in-app navigation are fast (30 to 170 ms).
- **The worst problems are about trust.**
  - Saves can quietly stay in the browser only while the app says they worked.
  - The next student on a shared computer sees the previous student's drafts.
  - Promo codes can take Pro away from paying users, and can be brute-forced.
  - Paying users are invited to buy Pro a second time.
  - Ask gets stuck when you leave the page mid-answer.
- **Speed problems are almost all first loads and phones.**
  - Every route waits for one 1.2 MB entry chunk (368 KB compressed) that holds all three languages and the whole signed-in app.
  - The Jam bug recorder loads another 772 KB for every visitor.
  - On a mid-range phone profile, content appears after 3.5 to 5 seconds.
  - Ask streaming re-renders the whole page every 30 ms.
- **Polish problems mostly come from one global CSS layer in `src/index.css`.** It holds the dashed-box jump you spotted, toasts that never stack, sticky hover after taps on phones, and inverted dark-mode tokens. Deleting most of that layer fixes a large share of the glitches.

## How to use this report

The workstreams below are ranked by impact. Each one is a root cause, with the findings it covers, the fix, the main files, and how to prove the fix. Each workstream is sized to be one PR, or a few small ones. Finding ids like `integrity-money-1` point into the detailed appendix, which has each finding's evidence, the verifier's independent check, and links to screenshots and measurements:

- [Data integrity, billing and quotas](2026-10-08-ultracode-review-report/integrity-money.md) (20 findings)
- [Security: Edge Functions and database](2026-10-08-ultracode-review-report/security.md) (29)
- [Speed: bundle, network and rendering](2026-10-08-ultracode-review-report/performance.md) (27)
- [Motion, theming and mobile layout](2026-10-08-ultracode-review-report/visual.md) (35)
- [Journeys, AI surfaces, accessibility and Hungarian](2026-10-08-ultracode-review-report/ux.md) (77)

The raw evidence (screenshots, videos, JSON measurements, repro scripts) is in `.verify/ultracode-review-2026-10-08/<area>/`, a git-ignored folder in the primary checkout. Before you start a fix, re-check its line numbers against current `main`.

Severity scale: **high** means a core flow is broken, data is lost or leaked, money is wrong, or the app is clearly slow or janky for most users. **Medium** is a noticeable glitch, friction or waste. **Low** is minor, and **nit** is tiny polish.

## Ranked workstreams

### 1. Writes that pretend to succeed (high)

**Findings:** integrity-money-1, journeys-1 (same bug found on staging), render-bundle-12, perf-runtime-3 (the getUser part).

Every write in `src/lib/stores/session-store.ts` asks the Auth server who the user is (`getUserId()` calls `supabase.auth.getUser()`, a network round trip). Any failure counts as "signed out", and the write then lands only in localStorage. On flaky school wifi, or with the auth endpoint returning 503, a student adds a source and sees "Source Added". The database never gets the row, and the source is gone after a reload. Both verifiers reproduced it: offline, and with only `/auth/v1/user` failing.

**Fix:** take the user id from the local session (`supabase.auth.getSession()`, or the id `AuthProvider` already has) and throw when there is none. Delete the local-only branches so a failed insert reaches the existing error toasts. This also removes 1 to 3 auth round trips per write, and the two `getUser()` calls that delay debate hydration in `debate-store.ts:127` and `sparring-store.ts:481`. While you're there, delete `saveCurrentAttack`, `saveCurrentBrainstorm` and `saveCurrentFactoids`: nothing calls them.

**Prove it:** route `/auth/v1/user` to 503 in Playwright, add a source, and expect an error toast and no fake success. Then reload and confirm the database matches what the screen shows.

### 2. The persisted session store (high)

**Findings:** integrity-money-2, integrity-money-3, integrity-money-13, render-bundle-3, perf-runtime-4.

`session-store` writes almost everything to localStorage on every `set()`: drafts, every saved case, chat and flowchart, and the full text of every source. That causes four separate problems:

- **Privacy leak on shared computers.** Sign-out calls `resetLocalData`, which leaves the Generate, Attack, Brainstorm and Factoids drafts behind. The next student who signs in on that browser gets them prefilled. Reproduced with two demo users.
- **Permanent crash for heavy users.** Past about 5M characters (about 45 maximum-size imports across all debates), every write throws `QuotaExceededError`. Zustand's persist has no try/catch, so tool pages show "Unable to load this page", and a reload doesn't fix it.
- **Typing lag that grows with the library.** Each keystroke in a tool form serialises the whole store. By the end of the review the shared pro account had grown to 188 KB per keystroke, with 39 long tasks while typing 41 characters on the phone profile.
- **Lost edits and cross-tab mixing.** `hydrateFromServer` overwrites edits made while it's in flight. Cross-tab sync replaces another tab's whole session store while that tab's Current Debate stays different.

**Fix:**
1. Keep only drafts and the open result in `partialize`. Drop `saved*`, `autosaved*`, `sourceLibrary` and `sourceFolders`, since hydration replaces them anyway.
2. Wrap the storage in try/catch and debounce it, as `sparring-store` already does.
3. Key persisted drafts by user id (Crossfire's draft already does this), or clear them in `resetLocalData`.
4. Copy debate-store's write-epoch guard into `hydrateFromServer`.
5. Narrow the cross-tab sync to drafts, and re-hydrate debates on the storage event.

**Prove it:** sign out as user A with unsent drafts, sign in as B, and expect empty forms. Fill localStorage, type, and expect no page error. Hold the sources GET for 6 s, add a source meanwhile, and expect it to survive. Each of these is worth a regression test.

### 3. Entitlements and billing (high)

**Findings:** security-db-1, integrity-money-7, integrity-money-5, integrity-money-4, integrity-money-17, integrity-money-18, integrity-money-19, integrity-money-14.

Three sources write one mutable `subscription_tier` column plus the grace and override columns: the promo RPC, the Stripe webhook and admin grants. Each one writes as if it were the only one. The verifiers reproduced, through the real functions:

- **Promos take access away.** A paying Stripe subscriber who redeems an `extended_trial` code becomes `trial` and loses Pro models while still paying. An `extra_limit` code drops a Pro user from 50 a day to 3. A `free_month` code cuts lifetime Pro to 30 days (`20260819000000_security_hardening.sql:117-142`). Pro users reach the promo field through Settings > Set Up Billing and through the limit modal.
- **Stripe events wipe promos.** A later `subscription.updated` nulls the lifetime grace date. Cancelling one of two subscriptions sets the user to `expired`.
- **Webhook replays are applied again.** The dedupe row is written after the handlers run (`stripe-webhook/index.ts:65-129`). A replayed `updated(active)` arriving after a cancellation gives the cancelled user Pro again, while the response says `duplicate: true`. Verified as medium: it needs a late or retried delivery.
- **Paying users are sold Pro twice.** At the daily limit, a Pro subscriber sees "Upgrade to Pro - $5/mo". PricingModal shows "Free / Current" and calls `create-checkout`, which never checks for an existing subscription. Coming back from Checkout, Settings ignores `?checkout=success` and shows "Expired" for up to 60 s.
- **Smaller billing issues.** `invoice.payment_failed` downgrades on the first failed retry. A Checkout that completes after account deletion has no backstop. `create-checkout` returns raw Stripe errors, and the `discount` promo type is never applied. Auto Fast gives trial users a model the catalog marks as Pro-only.

**Fix:**
1. Compute access as the best active grant (an active or trialing subscription, a future grace date, a future trial or an admin override) in `getSubscriptionInfo` and its two client copies.
2. Have webhooks write only the `subscriptions` table.
3. Rewrite `redeem_promo_code_atomic` so it only adds: `GREATEST` for dates and limits, and never lowering the tier.
4. In the webhook, claim the event first (insert with a status), then process it and mark it done. Re-fetch subscription state, or ignore events older than the last one applied.
5. `create-checkout`: return 409 with a portal link when a subscription is already active.
6. In the limit and pricing modals, show "resets at midnight UTC" to Pro users.
7. In Settings, handle `?checkout=success` by polling until the tier flips.
8. Decide whether a failed renewal gets a grace period before the downgrade. That is a product call for you (integrity-money-17).

**Prove it:** pgTAP tests for Stripe Pro + `extended_trial`, lifetime + `free_month`, and override 200 + `extra_limit` 15. A Deno test that replays an event after a cancellation and checks the tier stays expired. `billing.spec.ts` currently checks only the `duplicate` flag.

### 4. Ask: stuck, lossy and heavy (high)

**Findings:** integrity-money-6, mobile-visual-1, render-bundle-1, integrity-money-11. Also see the AI-surfaces findings in workstream 15.

Ask is the tool with the most problems:

- **Stuck after leaving.** Leave Ask while it's answering, come back, and it shows "Typing" forever with the input disabled. The unmount cleanup aborts the request but never clears the global `askLoading` flags (`AskPage.tsx:53-67`, `285-288`).
- **No room on phones.** The card has a fixed height, and its control footer is taller than the card. The message area is 0 px on iPhone SE and iPhone 14 and 62 px on a Pixel 7, and the composer overlaps the page footer (`AskChat.tsx:517`, `545`, `582`).
- **Streaming saturates the main thread.** Every 30 ms the whole page re-renders, every past message's markdown is re-parsed, a smooth `scrollIntoView` restarts, and the store rewrites localStorage. That was 110 long tasks for one answer on the phone profile. The auto-scroll also stops readers from scrolling back up.
- **Typed text gets thrown away.** The input is cleared before validation, so "Message is too large" leaves an empty box, and a refused question vanishes from the input.

**Fix:**
1. Keep the request in the store like the other tools, or clear the flags on unmount and mark the question as interrupted with Retry.
2. Use selectors instead of `useSessionStore()`.
3. Give the streaming bubble its own component, and memoize `Markdown`.
4. Auto-scroll only when the reader is near the bottom.
5. On phones, let the card grow to `100dvh` minus the header, and move the toggles into a "More options" sheet.
6. Have `onSend` return whether the message was accepted, and clear the input only then.

**Prove it:** fake an SSE stream in Playwright (the verifier's script is in the evidence folder) and count long tasks before and after. Navigate away mid-answer and back. Screenshot Ask on iPhone SE.

### 5. First load: entry chunk and Jam (high)

**Findings:** perf-runtime-1, render-bundle-5, render-bundle-6, perf-runtime-2, render-bundle-2.

- **One render-blocking entry chunk.** It's 1,204 KB raw and 376 KB brotli, and it's the only script before anything renders: i18next plus all three catalogs (324 KB), react-dom, auth-js, zod (88 KB), the stores, unused Supabase realtime and storage (84 KB), and Capacitor. The route's own chunk is only requested after the entry has executed. On the mobile profile (4x CPU, fast 4G), the `/app` h1 appears at 3.3 s and LCP at 3.6 s.
- **Jam for everyone.** `src/bootstrap.ts:13` loads the Jam recorder for every visitor, signed out too: 9 requests and about 772 KB. A/B on the phone profile: script time 2.9 s vs 1.6 s without Jam, and JS heap 16.7 vs 9.8 MB. It wraps `window.fetch`, keeps a request open forever and tags recordings with the user id.

**Fix:**
1. Bundle `en` only. Load `es` and `hu` with `import()` before first render, reading the saved language in `bootstrap.ts`.
2. Lazy-load the protected app shell (`AppLayout`, `DebateDialogs`, `InactiveDebateGate`) and the store hydrators, so `/` and `/login` skip them.
3. Take zod out of the entry by loading the announcement and sparring parsers lazily, or validating those by hand.
4. Import Capacitor only when `isNativeApp()`.
5. Call `preloadRoute(location.pathname)` before `mountApp()`.
6. Load Jam only on demand, for admins, behind `?jam=1`, or from a "Report a problem" action. Tighten the CSP to match.
7. Add an entry byte budget to `scripts/check-build-boundaries.mjs`.

**Prove it:** the entry chunk size in the build output, plus 3 cold mobile runs with the harness before and after (the h1 time and the request waterfall).

### 6. Phone layout breaks (high)

**Findings:** mobile-visual-2, mobile-visual-3, mobile-visual-7, mobile-visual-8, mobile-visual-14, mobile-visual-9, mobile-visual-10, mobile-visual-12, mobile-visual-15, mobile-visual-16. Overlaps journeys-24 and a11y-i18n-16 and -22.

- **The Current Debate dashboard scrolls sideways on every phone.** Implicit grid tracks plus `min-width: auto` let a long `truncate` title set the card width. With the shared debate's long source titles, the page rendered at 49% zoom (scrollWidth 800 at 390 px wide). Factoids has the same bug.
- **Dialogs have no max height.** "Start new debate" and Flowchart "Add Node" have their Close, Cancel and Submit buttons off-screen on landscape phones (`dialog.tsx:41`).
- **Library titles are cut to 22 to 114 px on phones, mid-letter.** `truncate` on a flex anchor never draws the ellipsis (`LibraryPage.tsx:88`). The 28 px delete icon sits 8 px from the switch and deletes without confirmation.
- **The mobile menu is a plain disclosure.** The page scrolls under it, taps outside go through to the page, and in landscape Settings sits below the screen edge.
- **Smaller issues.** Tap targets of 16 px (dialog and sheet close buttons), 20 px footer links, a 110 px two-row sticky header, nested fixed-height scroll lists, a cramped Flowchart (`minZoom` 0.5), and no safe-area padding or `theme-color` on the web.

**Fix:**
1. Add `grid-cols-1` (or `min-w-0` on grid children) wherever a grid only defines `md:`/`lg:` columns. A grep rule in CI stops this coming back.
2. Add `max-h-[calc(100dvh-2rem)] overflow-y-auto` and a gutter to `dialog.tsx` and `alert-dialog.tsx`.
3. Wrap the Library title in `<span class="truncate">`, allow two lines on phones, and move delete into a menu.
4. Turn both mobile menus into a Radix Sheet.
5. Pad the close buttons to 40 px.

**Prove it:** the harness overflow scan at 320, 390 and 412 px, plus landscape 915x412, with screenshots.

### 7. The global CSS motion layer (medium; this is your dashed-box bug)

**Findings:** motion-polish-4, ai-surfaces-11, motion-polish-2, mobile-visual-5, motion-polish-3, motion-polish-5, motion-polish-8, motion-polish-9, motion-polish-10, motion-polish-11, motion-polish-12, motion-polish-15, motion-polish-16, motion-polish-17, motion-polish-18, motion-polish-19.

- **Your example.** `.border-dashed:hover` (`index.css:472-511`) sets the `animation` shorthand to "marching ants". That replaces the element's `.motion-swap` entrance animation. When the pointer leaves, the entrance restarts from frame 0: the box drops 10 px, blurs and fades back in over about 280 ms. It hits the "Ready to Generate" box and the empty states on Generate, Attack, Brainstorm and Factoids, History and Current Debate. Hovering also turns the rounded 2 px dashed border into square-cornered 1 px lines, and the app has no drop zones.
- **Toasts never stack, expand or leave.** `[data-sonner-toast] { animation: … both !important }` (`index.css:644-646`) pins the transform, so several toasts sit on top of each other and dismissing seems not to work.
- **Sticky hover on phones.** Hover rules aren't gated by `(hover: hover)`, and Tailwind's `hoverOnlyWhenSupported` is off. After a tap, buttons stay raised with a near-black background.
- **No scroll reset between routes.** A new page opens at the old page's scroll position, for example Library with its h1 165 px off-screen.
- **Smaller issues.** Attribute-selector animations restyle every Radix widget and replay on mount. Every route fades and slides in over about 350 ms. A hover lift is applied to almost everything, including non-clickable cards. A global `!important` rule replaces the input focus ring with a faint 2:1 glow. Focus rings are clipped inside "More options". The Generate button shimmers forever. Spinners freeze under reduced motion. The Review sheet takes 500 ms to open. `MotionConfig` pulls framer-motion into the entry chunk.

**Fix:**
1. Delete the `.border-dashed:hover` block and `@keyframes marching-ants`.
2. Delete the toast animation override, the attribute-selector micro-interactions and the global input-focus rule.
3. Wrap the remaining custom `:hover` rules in `@media (hover: hover) and (pointer: fine)`, and set `future.hoverOnlyWhenSupported` in `tailwind.config.ts`.
4. Add a `ScrollToTop` (`useLayoutEffect` on the pathname, `behavior: 'instant'`, skipping POP navigations).
5. Limit the hover lift to primary buttons.
6. Drop route-level entrance animations, or make them CSS-only and at most 150 ms.

This is mostly a deletion PR.

**Prove it:** run the harness's `trackMovement` on the Generate empty state while hovering and leaving, and expect 0 px movement. Show three toasts and expect them to stack. Tap a button on the Pixel 7 profile and expect no lingering hover.

### 8. Debate scoping and hydration order (medium)

**Findings:** integrity-money-10, motion-polish-1, perf-runtime-3, motion-polish-7, perf-runtime-10, perf-runtime-5, security-db-7.

- **A result can show up under the wrong debate.** A result that arrives after a debate switch renders under the new debate, which breaks the "debates never mix" rule. The database row is filed correctly.
- **Pages paint "no debate" first.** On every sign-in, signed-in pages first show "No current debate" with a live "Start debate" button, zero counts and the default model, then flip. Cold `/app/debate` scores a CLS of 0.30 ("poor"). Only `DebateDialogs` reads the stores' `hydrated` flag.
- **Hydration downloads everything.** Every full load runs 14 REST queries: nine unbounded `select=*` across every debate, including the full text of every source, then messages after chats. PostgREST's 1000-row cap silently drops the newest messages for heavy users, and a failed messages query blanks every chat in History.

**Fix:**
1. Store the debate id with each tool result, render a result only when it matches the current debate, and reset the loading flags in `clearSession`.
2. Add a `useDebateReady()` selector and same-size skeletons until hydration finishes.
3. Hydrate only the Current Debate, with list columns only, and page the rest.
4. Embed messages in the chats query, or load them when a chat opens. Keep the old messages when that query fails.
5. Run `use-subscription`'s three queries in parallel.

### 9. Quotas that charge for nothing (medium)

**Findings:** integrity-money-8, security-db-6, security-edge-13, integrity-money-12, security-edge-1, integrity-money-15, integrity-money-16.

- **Slots are never refunded.** `consume_daily_quota` reserves a slot before any validation or provider call, and nothing gives it back. A provider 500, a short Generate reply or a reload mid-request each cost a trial student 1 of their 5 daily requests. When an Ask stream fails, a second paid non-streaming request is sent silently. A trial user's 5 requests are gone after about 5 Crossfire questions, and the refusal is shown as a debrief failure.
- **Refused requests grow the database.** The `ai` function never validates `feature`, and writes it (up to about 200 KB) into `ai_requests` on every refused request. Any account, even an expired one, can grow the table without limit, and the admin stats page loads every row. Reproduced on staging with a 4,010-character feature.

**Fix:**
1. Add a service-role `release_daily_quota` RPC, called when the provider fails before any billed usage.
2. Limit the Ask fallback to transport errors.
3. Give sparring `respond` an idempotency key.
4. Count a Crossfire round as one unit, or warn about the cost up front.
5. Validate `feature` against the 7 known values before logging, auth or quota.
6. Stop inserting a row per refusal, and add length CHECKs to `ai_requests`.
7. Delete the unused exact count in `use-subscription`.

### 10. Promo brute force, still open (high, known as next-15 #2)

**Findings:** security-db-2, integrity-money-9.

`redeem_promo_code_atomic` has no attempt limit. EXECUTE is granted to every authenticated user, so it can be called directly through PostgREST. It answers differently for unknown, expired, used-up and already-redeemed codes, and codes are admin-chosen words. Locally, 30 wrong codes took 2.3 s and a valid code still worked afterwards. `redeem-promo` also logs every attempted code as "redeemed".

**Fix:** as next-15 #2 describes. Add a per-user failure window inside the SQL function (for example 5 failures in 15 minutes), return one generic message, stop logging raw codes, and optionally require 8 or more characters in `create-promo`. Add a pgTAP test. Ship this together with workstream 3's promo rewrite.

### 11. Edge Function hardening (medium)

**Findings:** security-edge-2, security-edge-3, security-edge-4, security-edge-5, security-db-4, security-edge-6, security-edge-7 to -12, security-edge-14 to -16.

- **Seven functions hang on large unauthenticated bodies.** voice, ai-stream, account, admin, announcements, export-gdoc and workspace-invites never answer an unauthenticated POST of about 1 MB (no response after 60 s, reproduced on staging). `ai` hangs above about 600 KB. This is the class #118 fixed only in share and import-source. **Fix:** use `readBoundedBody` or `discardRequestBody` before every early return.
- **Raw error text reaches students.** Users see OpenRouter bodies (up to 16 KB), Deno TLS errors ("invalid peer certificate: Expired" in the Import Failed toast) and "Invalid code point 99999999", always in English. **Fix:** fixed error codes on the server, mapped to i18n strings on the client, and never show a raw 5xx message.
- **The prompt-injection blocklist rejects real debate text.** "At 18 you are now an adult" and "legalise jailbreaking smartphones" are refused with "Suspicious content detected in caseText" (staging, real UI). **Fix:** delete `PROMPT_INJECTION_PATTERNS`. The role-separated prompts and `UNTRUSTED_CONTENT_RULES` are the real defence, and `ai-stream` already runs without the list.
- **Share links can't be removed.** They survive "Delete All My Data", can't be revoked by the owner or an admin, and banned users can still publish. **Fix:** delete `shared_items` in `clear_current_user_data`, add a revoke action with a list in Settings, and add the ban check.
- **The demo-code IP lockout counts its own refusals.** A class behind one school NAT can stay locked out while it retries. **Fix:** exclude `rate_limited` and `invalid_format` from the count, and key the limit by IP and code.
- **Low items:**
  - The import parser has catastrophic regex backtracking and crashes on out-of-range entities.
  - Signing keys fall back to the service-role key. `SPARRING_INTEGRITY_SECRET` is unset on staging; setting it needs your authorisation.
  - Account deletion needs no re-authentication.
  - `export-gdoc` allows LAN origins in production.
  - Web research text enters prompts without an untrusted-content boundary.
  - `export-gdoc` reports success with an empty doc when the update fails.
  - Student debate text is written to function logs.
  - The admin user list stops at 50 users, and stats load every row.
  - The hidden Workspace backend is still deployed and reachable.

### 12. Deploys break open tabs, and other load waste (medium)

**Findings:** perf-runtime-6, perf-runtime-7, render-bundle-10, perf-runtime-8, render-bundle-7, render-bundle-8, render-bundle-11, render-bundle-13, render-bundle-15, perf-runtime-9, render-bundle-9, motion-polish-14, perf-runtime-11, perf-runtime-12.

- **Open tabs break after every deploy.** A missing old chunk returns the SPA shell as `200 text/html` with a one-year immutable header (`vercel.json`). The service worker caches that HTML as JavaScript, and nothing reloads. Every student with a tab open across a deploy gets "Unable to load this page" on their next route. **Fix:**
  1. Change the rewrite source to `/((?!assets/).*)`.
  2. In `sw.js`, cache only responses whose content-type matches.
  3. Version `CACHE_VERSION` with the build id.
  4. Add a `vite:preloadError` handler that reloads once.
- **The first visit precaches 768 KB of images.** That's a 1024×1024 favicon twice (`.png` and `.ico`) plus the og:image, downloaded while the page's own data loads. **Fix:** a 32 px favicon, proper 192 and 512 px manifest icons, and a shorter `APP_SHELL`.
- **Route chunks carry dead weight.**
  - Generate pulls in reactflow and d3 (41 KB) for one enum. Use `'arrowclosed'`, and fix the `check-build-boundaries.mjs` regex, which misses `@reactflow/*`.
  - Sparring loads recharts (95 KB) before a round starts. Lazy-load the scorecard.
  - The landing page loads the full framer-motion. Use `LazyMotion` or CSS.
  - The hidden Workspace and Capacitor code still ship to the web.
  - About 50 chunks are under 1.5 KB. Set `experimentalMinChunkSize`.
- **Fonts.** Google Fonts loads through chained `@import`s, and Lora is never used. Self-host Inter with a size-adjusted fallback, which removes the text reflow when the font arrives.
- **Smaller items.** The landing h1's opacity-0 entrance holds LCP back about 0.8 s. Sentry and PostHog load their full bundles if production sets their keys.

### 13. Render cost while typing (medium)

**Findings:** render-bundle-4, plus the Ask part of workstream 4.

Thirteen components call `useSessionStore()` or `useSettingsStore()` with no selector. The forms call `watch()` on the whole form and push every keystroke into the store. On the phone profile a Generate keystroke takes 72 ms, against 40 ms for the local-state Ask input. That figure includes the persist cost from workstream 2. **Fix:** selectors or `useShallow`, `useWatch` on the displayed fields, `React.memo` on `SourceRow` and the flowchart node, stable ReactFlow handlers, and an isolated 500 ms Crossfire clock.

### 14. Theme tokens and dark mode (medium)

**Findings:** mobile-visual-6, motion-polish-6, mobile-visual-4, mobile-visual-11, motion-polish-13, mobile-visual-13. Overlaps a11y-i18n-2, -9, -11, -12 and -24.

- **The dark tokens are inverted.** Dark `--muted` is a mid-grey slab, behind the whole 404 page and every tab bar. Dark `--accent` is darker than the page, so every ghost or outline hover becomes a near-black hole.
- **"Muted" text isn't muted.** `--muted-foreground` equals `--foreground` in both themes, so the 377 uses of `text-muted-foreground` render as full-strength body text.
- **Light hovers are invisible.** Light `--accent` equals `--card`.
- **Flowchart was never themed for dark mode.** It shows a white minimap, white controls with invisible icons and a white attribution box.
- **Theme switching is staggered.** The page snaps, cards fade over 260 ms and the body over 420 ms.
- **Hard-coded colours fail contrast.** The Flowchart legend and nodes, and the Settings tier badge.

**Fix:** retune the tokens in `index.css` so muted and accent are surface steps just above the card, and add a real muted-text token. Map React Flow's classes to the theme tokens. Disable transitions for one frame during a theme swap. Then re-run the contrast checks from workstream 15.

### 15. Ease of use, AI surfaces, accessibility and Hungarian (medium)

**Findings:** 77 in [the UX appendix](2026-10-08-ultracode-review-report/ux.md). The two highs there (journeys-1 and ai-surfaces-1) are the same bugs as workstreams 1 and 4. ai-surfaces-13 (a misplaced Sparring radar chart, seen once) was refuted.

Translation coverage is strong. The Hungarian and Spanish catalogs have full key parity with English, no untranslated catalog strings showed up on any route, `html[lang]` switches, and the AI answered in Hungarian when asked. The problems are elsewhere:

- **AI tools give no control or recovery.**
  - No tool has a Stop button. Ask's only way out is Clear, which wipes the conversation (ai-surfaces-2).
  - Failures show only in a 4-second toast, and the results panel quietly goes back to "Ready to Generate" (journeys-13).
  - Error text is raw, English-only and offers no Retry, and the client and server timeouts disagree (ai-surfaces-8, a11y-i18n-7; same fix as workstream 11).
  - **Fix:** pass an `AbortController` into the existing `signal` option for Stop, keep the error in the results panel with a Retry button, and use the error-code mapping from workstream 11.
- **Results wait for bookkeeping.**
  - After the AI answers, about 16 database writes run one after another before "Generate complete" appears (ai-surfaces-4).
  - Every run auto-saves about 5 sources with no de-duplication (ai-surfaces-5, journeys-14).
  - "Regenerate section" re-runs the whole deep research and the whole case, then keeps one section (ai-surfaces-6).
  - **Fix:** render as soon as the response parses, save in the background with one bulk insert, de-duplicate by URL, and send the section to the server.
- **Saved work is hard to manage.**
  - Saving a case reopened from History creates an unscoped copy that can't be deleted where it shows up (journeys-2).
  - There is no way to delete the Current Debate, the last debate, or saved brainstorms, attacks, factoids, chats or crossfires (journeys-3). Crossfire debriefs can't be reopened (ai-surfaces-12).
  - The Library row trash and the saved-flowchart delete act instantly with no confirmation or undo (journeys-4).
  - A recorded Generate result loses its History link after a reload (ai-surfaces-7).
  - The Flowchart canvas, a running Timer and source-sheet edits are thrown away on navigation without a warning (journeys-9).
- **Interaction glitches.**
  - Closing "Start new debate" flashes a full "Switch debate" dialog for about 200 ms (journeys-6). The dialog content is keyed on store state that turns null while the dialog animates out.
  - Selecting a Flowchart node pushes the canvas down 127 px under the cursor, which makes double-clicks miss (journeys-7).
  - The dashed loading card drops 10 px and blurs on every tool submit (ai-surfaces-11). This is a second cause of your dashed-box bug: `motion-swap` runs when the empty state swaps to the loading state. Keep one dashed container and crossfade only its content.
  - On phones, tapping the highlighted button in the first tour step skips the step (journeys-10).
  - Discuss shows its summary as a code block with literal `**` (ai-surfaces-10).
- **Keyboard and screen readers.**
  - The Timer's global key handler resets a running speech on Escape (even when Escape only closes a select) and takes Space from focused buttons (a11y-i18n-1, journeys-8).
  - Library rows nest a link and a switch inside a `role=button` (a11y-i18n-5).
  - Flowchart nodes can't be edited from the keyboard (a11y-i18n-6).
  - The inactive-debate gate opens with focus on `<body>` (a11y-i18n-4).
  - Select triggers, the Factoids slider and the Timer progress bar have no accessible name (a11y-i18n-3).
  - The Timer re-announces itself every second (a11y-i18n-10).
  - `document.title` is "DebateLab" on every route and overwrites the landing page's SEO title (a11y-i18n-8).
- **Contrast.** In light mode, `--primary` gives 3.86:1 on primary buttons and 3.75:1 on links (a11y-i18n-2), and the focus ring is 1.89:1 (a11y-i18n-11). **Fix:** darken `--primary` to about `hsl(200 98% 32%)` and keep `--ring` in sync.
- **Low items:**
  - No skip link, and no focus move or announcement on route change.
  - Focus isn't returned after dialogs close (next-15 #14).
  - Raw "strong / moderate / weak" enums in every language.
  - 194 Hungarian strings copy English Title Case.
  - No language switcher on `/login`, and first visits ignore the browser language.
  - "1 sources" (missing plural forms).
  - Expired users get no warning before they submit.
  - Inconsistent export file names, and missing export sections.
  - Settings says "Signed in with Google" to everyone and offers "Set Up Billing" to Pro users.

### 16. Database hygiene (medium to low)

**Findings:** security-db-5, security-db-3, security-db-8, security-db-9, security-db-10, security-db-11, security-db-12, security-db-13.

- **Anonymous table writes.** Anyone with the public anon key can insert unbounded rows into `keepalive_events` and overwrite the heartbeat (`GRANT ALL TO anon`; 554 rows readable on staging). User-writable text and jsonb columns have no size caps. **Fix:** a narrow `keepalive()` RPC, revoke the table writes, and add `octet_length` CHECKs. The heartbeat is written by something no migration defines, so capture it in a migration.
- **Low items:**
  - Client-role grants depend on platform defaults; a replay gives anon TRUNCATE on 28 tables.
  - Judged sparring rounds are saved with no debate id.
  - 16 legacy policies use bare `auth.uid()` with roles `{public}`.
  - Items can be moved between your own debates by direct UPDATE, and pins outlive their items.
  - Dead tables and admin RPCs (`api_keys`, `source_files`, `evidence_cards`, `curated_sources`, `get_daily_usage`, `get_usage_by_user`) can be dropped once you've checked production row counts.
  - Redundant indexes, and unindexed foreign keys.
  - Nothing purges demo login IPs, expired shares or old usage counters.

### 17. Code worth deleting

Deletion appears throughout the workstreams above. Collected in one place:

- `src/index.css`: marching ants, the toast override, the attribute-selector micro-interactions, the global input-focus rule and most of the global hover lift (workstream 7).
- The `session-store` local-only branches and the three uncalled `saveCurrent*` actions (workstream 1).
- `PROMPT_INJECTION_PATTERNS` and its rejection branch (workstream 11).
- Jam outside on-demand use (workstream 5).
- The hidden Workspace branches in the tool pages and `ai`, the deployed `workspace-invites` function, and Capacitor in the web bundle (render-bundle-13, security-edge-16).
- The Lora font, the unused subscription count query, `MotionConfig` in `App.tsx`, and the dead prototype schema objects (security-db-11).
- next-15 #12 leftovers: server-only dependencies in client `dependencies`, three copies of a sanitizer, and knip gaps (render-bundle-14).

## Suggested order

1. **Quick, high-value deletions (a day).**
   - Delete marching ants, the toast override and the global focus rule.
   - Gate hover with `(hover: hover)` and turn on `hoverOnlyWhenSupported`.
   - Add `ScrollToTop`.
   - Delete the prompt-injection blocklist.
   - Load Jam on demand.
   - Use `grid-cols-1` on the phone grids, and give dialogs a max height.
2. **Trust fixes (workstreams 1, 2 and 4).** These are the bugs where students lose work or see someone else's.
3. **Money (workstreams 3, 10 and 9).** One migration for promos, entitlements and quota release, plus the webhook ordering fix and their tests. The production migration and function deploys need your authorisation as usual.
4. **First load (workstreams 5 and 12).** The entry split, the deploy-safe service worker and the chunk weight.
5. **Everything else:** in severity order within each appendix file.

## What this review did not cover

- Real phones, Safari or WebKit, and Firefox. Mobile numbers come from Chromium emulation with a 4x CPU throttle on a shared VPS, so timing claims lead with structural evidence: request counts, bytes and long-task counts.
- Production. It was never touched, so production grants, secrets and whether Sentry or PostHog keys are set are unknown.
- Real Stripe Checkout, the billing portal, ElevenLabs voice, Google Docs export and Google sign-in.
- Real screen readers. Accessibility findings come from axe-core, DOM and ARIA, and live-region measurements.
- Write probes against staging security. The write-policy claims rest on the migration text plus a throwaway local Postgres replay.
- The hidden Workspace and the iOS shell, except where their code still ships to the web app.

Each reviewer's own "not covered" list is at the top of its appendix file.
