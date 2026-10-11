# Motion, theming and mobile layout: findings

**Status:** Review evidence from 2026-10-08/09, for [the ranked report](../2026-10-08-ultracode-review-report.md). Not started.

35 findings: 2 high, 11 medium, 17 low, 5 nit. An independent verifier re-checked every one.

Each entry has the final severity, where the problem lives, what the reviewer saw, why it happens, a suggested fix, the independent check and links to the screenshots and measurements in `.verify/ultracode-review-2026-10-08/`. Line numbers are against main at 40738ea.

Not covered by the motion-polish reviewer:

- AI-driven states (AI budget was 0): loading boxes while streaming (code shows the same dashed replay), message-enter, streaming caret and glow, Crossfire and Sparring phase swaps, Sparring Scorecard tooltips, regenerate overlay
- Mobile and tablet devices (other agents' lane). Swipe-to-dismiss toast breakage is inferred from code only
- A full dark-mode hover sweep. Dark was spot-checked with screenshots and computed colours on /app/generate only
- Spanish and Hungarian label widths in the header and tabs (the pro account is English, and the trial account belongs to the i18n agent)
- The onboarding tour (skipped by the harness)
- Scroll lock with other scrollbar widths or OS overlay settings: tested one classic width (10px) only
- Toasts with different texts or variants stacked together (tested three identical 'Copied to clipboard' toasts only)
- The toast exit animation being suppressed is code-derived: the identical toast behind hides it in the filmstrip
- Admin, workspace and iOS surfaces (out of scope)
- Hand-off for other areas: Settings shows 'Set Up Billing' next to the Pro badge for the Pro seed account. The staging banner covers the Review sheet header, but that is staging-only and was ignored

Not covered by the mobile-visual reviewer:

- Safari-only behaviour (iOS input zoom, safe-area insets, 100vh vs dvh, standalone PWA back gesture) can only be shown in WebKit on a real device. Reported from code evidence only.
- Live AI flows (streaming Ask, Crossfire or Sparring rounds, Generate output while streaming): AI budget was 0. Crossfire and Sparring were checked on their setup screens only, and results only through saved items loaded locally.
- Toast layout on phones: no safe way to trigger one without a write or AI call.
- PricingModal, Library source-detail sheet editing, Switch debate dialog and Settings delete dialogs were not opened, to avoid any risk to the shared pro account.
- Signed-in Spanish and Hungarian UI: language is server-side on shared accounts. Hungarian was checked only on signed-out public pages at 320.
- The 'Ask auto-scroll moves the window' hypothesis was not confirmed (an isolated reproduction did not scroll the window), so it is not reported.
- Real touch-gesture scroll chaining inside nested lists and the flowchart canvas. Reported from geometry, not from real swipes.

### mobile-visual-1: Ask chat has no room for messages on phones: the composer overflows the card and covers the page footer

**Severity:** high · **Verdict:** confirmed · **Root cause:** `ask-chat-fixed-height-card-on-phones`

**Where**

- src/components/features/ask/AskChat.tsx:517 (Card h-[calc(100vh-14rem)] min-h-[400px] max-h-[800px])
- src/components/features/ask/AskChat.tsx:545 (messages CardContent flex-1 overflow-hidden)
- src/components/features/ask/AskChat.tsx:582 (footer div shrink-0 with mode tabs, 4 toggles, model, reasoning, context strip, composer)
- /app/ask on every phone

**What the reviewer saw**

Measured card / header / messages area / footer heights in px (dark, staging): iPhone SE 320x568 400/156/0/555; iPhone 14 390x664 440/136/0/463; Pixel 7 412x839 615/112/78/423; landscape 915x412 400/92/0/307; iPad 810x1080 800/92/353/353 (fine). Because the footer is shrink-0 and taller than the fixed-height card, it overflows the card's bottom border. On iPhone 14 the page footer ('DebateLab / Terms / Privacy') is drawn on top of the 'Using 3 sources…' box and the composer sits below the page footer. The empty state's 48 px MessageCircle icon is clipped to an arc that looks like a stuck spinner on Pixel 7. Any conversation would get 0–78 px of visible transcript.

**Why it happens**

A desktop chat layout (a fixed-height card sized from 100vh, with a non-shrinking control footer) is used unchanged on phones, where the footer controls wrap to 300–555 px.

**Suggested fix**

In AskChat.tsx, below lg let the card grow naturally or size it to 100dvh minus the header, and give the transcript a guaranteed min-height (for example min-h-[50dvh]). Collapse the four toggles, model and reasoning into a 'More options' disclosure or a sheet on phones, so the footer is only the mode switch plus the composer. Keep the composer sticky at the bottom of the card, and use dvh rather than vh.

**Who it hits**

Every phone user of Ask, a core tool; most phones show zero transcript.

**Independent check**

Measured on /app/ask as pro. The composer is an <input placeholder='Ask your debate coach...'>, not a textarea. iPhone 14 (390x664): card h 440 (420-860), header 136, messages area 0, controls footer 459 (557-1016, overflowing the card bottom by 156px), composer at 960-1000, page footer at 892-973, so the footer is drawn over the 'Using 10 sources…' box and the composer sits below it (full-page screenshot). iPhone SE (320x568): messages 0, controls 571. Pixel 7: messages 62px. Small differences from the reviewer's numbers come from staging content (the context strip text). The cause is AskChat.tsx:517 (h-[calc(100vh-14rem)] max-h-[800px]) plus the shrink-0 controls footer at :582.

**Evidence files**

[ask-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/ask/ask-measure.json), [app_ask-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-iphone-light/app_ask-full.png), [app_ask-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-mobile-dark/app_ask-full.png), [ask-card-iphone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/ask/ask-card-iphone.png), [ask-card-small-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/ask/ask-card-small-mobile.png), [s6-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s6-mobile.json), [ask-iphone-light-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/ask-iphone-light-full.png), [ask-small-mobile-dark-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/ask-small-mobile-dark-full.png), [ask-mobile-dark-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/ask-mobile-dark-full.png)


### mobile-visual-2: Current Debate dashboard (and Factoids results) scroll sideways on phones: grid tracks blow out to the min-content width of nowrap titles

**Severity:** high · **Verdict:** confirmed · **Root cause:** `grid-items-min-width-auto-blowout`

**Where**

- src/pages/CurrentDebatePage.tsx:156 and :161 (grid gap-6 md:grid-cols-2, no mobile column definition)
- src/pages/CurrentDebatePage.tsx:46-48 (li flex with truncate title) and :174 (li truncate source title)
- src/pages/FactoidsPage.tsx:136 (grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)])
- src/components/ui/button.tsx:9 (whitespace-nowrap default, which feeds min-content)
- Same pattern, at risk with longer content: AttackPage.tsx:130, BrainstormPage.tsx:118, CrossfirePage.tsx:228, HomePage.tsx:160, BrainstormResults.tsx:226

**What the reviewer saw**

/app/debate as pro: document scrollWidth 403 px on the 320 px iPhone SE and 404 px on the 390 px iPhone 14 (fine at 412). Culprits are div[data-testid=debate-side-pro/-con] (right edge 399) plus the Sources and Recent work cards. Chromium's mobile layout viewport widens to match (innerWidth 403, innerHeight 568→716), so the page zooms out or pans sideways. With one long unbroken source title (simulated in the browser only) the page becomes 897 px wide on a 412 px Pixel. A saved Factoids result loaded at 320 is 331 px wide: every card from the form to 'Find More Evidence' is 315 px against 288 available, and the cards' right borders are clipped.

**Why it happens**

Implicit single-column grids size their track to `auto`, and grid items keep min-width:auto. A child with white-space:nowrap (truncate titles, nowrap buttons) contributes its full text width as min-content, so truncation never happens and the card grows past the viewport.

**Suggested fix**

Give these grids an explicit mobile track (`grid-cols-1`, which Tailwind emits as minmax(0,1fr)) or add `min-w-0` to the grid children (Card). Add `min-w-0` to the li flex children in CurrentDebatePage. Let suggestion and query buttons wrap (`whitespace-normal`) or truncate. A one-line lint or grep rule ('grid gap-* md:/lg:grid-cols-* without grid-cols-1') would stop this coming back.

**Who it hits**

Most iPhone users (375/390/393 px) on the Current Debate dashboard, the app's hub. Any debate with a long item or source title breaks every phone width.

**Independent check**

Confirmed, and worse than reported. On /app/debate the layout viewport stays at the phone width (clientWidth 320, 390 and 412; single-column grid), but the cards overflow it. debate-side-pro/-con reach right 504, and debate-sources and debate-recent reach right 800, because the longest source title, a truncate li in an implicit auto grid track, now sets min-content. Chromium mobile then zooms out to fit: innerWidth reports about 800 and scrollWidth is 800-801. The page renders at about 49% scale instead of panning 14px. It now also reproduces at 412 (Pixel 7), where the reviewer saw no problem, because other agents have added longer source and item titles to the shared debate since. The whole effect depends on content length, which is exactly the risk. Factoids: loading the saved factoids result from History at 320px gives scrollWidth 331, with the AnimatedSection form wrapper and the export row both 315px wide (right 331), and the card's right border clipped (screenshot). The fix is correct: grid-cols-1 (minmax(0,1fr)) or min-w-0 on the grid children, plus min-w-0 on the li flex children.

**Evidence files**

[app_debate-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-light/app_debate-full.png), [measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-iphone-light/measure.json), [longtext.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/longtext/longtext.json), [mobile-app_debate-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/longtext/mobile-app_debate-full.png), [results.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/results/results.json), [factoids-result-320-dark-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/crops/factoids-result-320-dark-crop.png), [s6-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s6-mobile.json), [debate-iphone-light-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/debate-iphone-light-full.png), [debate-small-mobile-dark-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/debate-small-mobile-dark-full.png), [factoids-result-320-dark-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/factoids-result-320-dark-viewport.png)


### motion-polish-1: Signed-in pages paint the 'No current debate' / empty / default-model state first, then flip when stores hydrate

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `stores-render-defaults-before-hydration`

**Where**

- src/pages/HomePage.tsx:113-125 (CurrentDebateSummary no-debate branch)
- src/components/features/debate/CurrentDebateStrip.tsx:66-73
- src/components/features/debate/DebateContextControl.tsx:86-94
- src/components/features/debate/CurrentDebateMenu.tsx:34 (header shows 'Start debate' before 'Current debate')
- src/pages/CurrentDebatePage.tsx (EmptyState, then zero counts)
- src/lib/stores/debate-store.ts:45,121,152 (hydrated flag exists)
- src/components/features/debate/DebateDialogs.tsx:171 (only reader of hydrated)
- src/lib/supabase/AuthProvider.tsx:249-256 (resetDebateStore on sign-out)
- routes /app, /app/generate (and every tool with the strip), /app/debate

**What the reviewer saw**

Measured on fresh contexts (same as the first load after any sign-in, because sign-out calls resetLocalData). Order of states: /app showed 'No current debate. Start a debate to keep one motion…' with a Start debate button from 3278 to 3634ms, then the debate card. React reused the DOM nodes, so the layout-shift entry shows p.text-lg going from h 20 to h 25 and the tools grid moving 311 to 336 (+25px, CLS 0.0156). The Library and History nav links shift in x at the same moment because the header label changes from 'Start debate' to 'Current debate ▾'. On /app/generate the strip read 'No current debate. Results stay one-off until you start one. [Start debate]', the context line read 'No Current Debate, so no debate material will be used', the Motion field was empty and the model showed 'GPT-5.6 Luna'. Then everything flipped to 'Working in: This House would ban…', a prefilled motion and 'Claude Sonnet 5'. The wrong-state window was 1135, 704 and 108ms over 3 runs (median 704ms; load averages 4.5, 3.6, 3.8). /app/debate showed the 'No current debate' EmptyState from 401 to 652ms, then the dashboard with '0 sources · 0 outputs' and 'No work for this side yet' next to an 'In favor 3 items' badge, and filled in at 739ms. CLS was 0.0686 + 0.0493 (debate container h 280 to 667; Sources grid y 553 to 691) = 0.118 in the cold run and 0.184 in the sweep run. Timings are single runs except /app/generate.

**Why it happens**

These components render straight from store defaults (debates: [], currentDebateId: null, default settings, empty session lists) and treat that as real 'no debate' or 'no work' state. The stores already track hydration (debate-store `hydrated`, session-store `serverHydration`, sparring `hydrated`), but only DebateDialogs reads it. Sign-out empties the persisted debate store, so every sign-in starts from the empty state.

**Suggested fix**

Add a selector such as `useDebateReady()` (debate-store.hydrated, or a persisted ownerUserId matching the current user). Until it is true, render a neutral placeholder of the same height instead of the no-debate branch in HomePage CurrentDebateSummary, CurrentDebateStrip, DebateContextControl, CurrentDebateMenu and CurrentDebatePage. Gate counts and 'No work for this side yet' on sessionStore.serverHydration === 'complete'. Hold ModelSelector's default until settings hydrate.

**Who it hits**

Every student on every sign-in, new device or cleared storage, on Home, every tool page and the Current Debate dashboard. A click on 'Start debate' during the window opens the create dialog even though a debate exists.

**Independent check**

Code check: debate-store persists debates and currentDebateId (debate-store.ts:249-256). resetLocalData on sign-out empties it (AuthProvider.tsx:249-256), and only DebateDialogs reads `hydrated`. Two groups of users see different things. With a fresh store (every sign-in, a new device, cleared storage), the app paints the no-debate state first. A returning reload with the persisted store does not flash: 2 returning runs went straight from skeleton to 'Working in' or the debate card. Strongest structural evidence: on a cold /app/debate the 'No current debate' EmptyState flips to the dashboard, and the container grows from h 280 to 667. That is a CLS of 0.2978 per cold load, the same in 2 runs and above the 0.25 'poor' threshold. Time windows, unthrottled (load average about 2.8): /app/generate 0, 67 and 112 ms over 3 runs (in run 1 the strip stayed hidden behind the skeleton), /app 15 ms, /app/debate 49 and 127 ms. With fast4g throttling, /app/generate showed 'No current debate' plus 'Start debate' in the header plus an empty Motion field for 505 ms (screenshot), and /app showed it for 409 ms. While the route skeleton shows, the header reads 'Start debate' in every cold run. Another wrong state appeared: in a fresh-cache cold load the Home card read '0 sources · 1 outputs' for about 550 ms before showing '43 sources · 16 outputs'. That frame was captured in coldseq-app-dark-2-spinner.png (the filename is wrong: the image shows content, not the spinner). Not verified: the 'GPT-5.6 Luna → Claude Sonnet 5' model sub-claim. My sampler read the Side select, and settings were already persisted in my context. The suggested fix (a hydration-ready selector gating the no-debate branches and the counts) is sound.

**Evidence files**

[filmstrip-app-cold-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-app-cold-dark.png), [filmstrip-generate-cold-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-generate-cold-light.png), [filmstrip-debate-cold-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-debate-cold-light.png), [t3-coldload-app-cold-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-app-cold-dark.json), [t3-coldload-generate-cold-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-generate-cold-light.json), [t3-coldload-generate-cold-light-run2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-generate-cold-light-run2.json), [t3-coldload-generate-cold-light-run3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-generate-cold-light-run3.json), [t3-coldload-debate-cold-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-debate-cold-light.json), [sweep-tools1-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/sweep-tools1-desktop-light.json), [s1-coldload.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s1-coldload.json), [s4-theme-throttle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s4-theme-throttle.json), [cold-generate-no-debate-state-fast4g.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/cold-generate-no-debate-state-fast4g.png), [coldseq-app-dark-2-spinner.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/coldseq-app-dark-2-spinner.png), [s7-final.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s7-final.json)


### motion-polish-2: Toasts never stack, never expand on hover and never animate out: a global !important animation pins their transform

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `global-attribute-selector-animations`

**Where**

- src/index.css:644-646 `[data-sonner-toaster] [data-sonner-toast] { animation: toast-slide-in 0.3s … both !important }`
- src/index.css:648-657 (@keyframes toast-slide-in)
- src/components/ui/sonner.tsx (Sonner 2.0.8)
- every toast in the app, e.g. /app/generate results 'Clipboard' button

**What the reviewer saw**

Loaded a saved case from History, clicked 'Clipboard' 3 times and measured. Sonner set --y to translateY(0), translateY(-14px) scale(.95) and translateY(-28px) scale(.9) when collapsed, and translateY(0), -65px and -131px when hovered (expanded). The computed transform was matrix(1,0,0,1,0,0) for all three in both states, and all three sat at y≈723-725, perfectly overlapping. Hover-expand does nothing. Clicking X on the front toast removes it, and the identical toast behind takes its place, so the screen looks unchanged (filmstrip). From code: animation-fill-mode both also pins opacity at 1, so Sonner's removal fade and swipe offset can't apply. Exit and swipe were not observed separately.

**Why it happens**

A CSS animation with fill-mode `both` keeps its last keyframe (transform: translateY(0) scale(1); opacity: 1) applied after it ends. Animation values beat Sonner's normal `transform: var(--y)` declarations, and the `!important` on the animation stops Sonner from replacing it.

**Suggested fix**

Delete index.css:643-657 and let Sonner animate entry, stacking and exit itself. If a custom entry is wanted, drop `both` and `!important` and target only `[data-sonner-toast][data-mounted='false']`.

**Who it hits**

Anyone who gets more than one toast within the toast lifetime, e.g. save then error, or repeated copy. An older toast (possibly an error) is hidden behind the newest. Dismissing seems not to work. Swipe-to-dismiss is broken on touch (inferred).

**Independent check**

Repro: on /app/history, Load the first case and click Clipboard 3 times. All 3 toasts sat at y 723-725 with computed transform matrix(1,0,0,1,0,0), while Sonner's --y was translateY(0), translateY(-14px) scale(.95) and translateY(-28px) scale(.9). On hover data-expanded became true and --y became -65px and -131px, but transform stayed identity and y stayed 725. The screenshot shows a single toast. After clicking X on the front toast, the removed toast still had opacity 1 and identity transform. Sonner 2.0.8 injects its CSS (confirmed). Its own rules (transform: var(--y), the opacity transitions, the swipe-out keyframes) lose to index.css:644-646 `animation: toast-slide-in … both !important`, because the final keyframe values stay applied with fill-mode both. Swipe-out was not exercised (code only). Same mechanism as motion-polish-5, so they share a root cause key. Severity stays separate because this one hides real messages, such as an error behind a success toast.

**Evidence files**

[t14-toasts-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t14-toasts-light.json), [toasts-collapsed-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/toasts-collapsed-light.png), [toasts-hovered-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/toasts-hovered-light.png), [filmstrip-toast-dismiss-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-toast-dismiss-light.png), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [toasts-collapsed.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/toasts-collapsed.png), [toasts-hovered.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/toasts-hovered.png)


### motion-polish-3: New pages open at the previous page's scroll position (no scroll-to-top on route change)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `no-scroll-reset-on-route-change`

**Where**

- src/App.tsx:271-289 (BrowserRouter with declarative Routes; no ScrollRestoration or pathname scroll effect)
- src/components/layout/AppLayout.tsx (Outlet; no scroll reset)
- src/pages/SparringPage.tsx:118 (the only scrollTo in the app)
- src/index.css:153 (html scroll-behavior: smooth)

**What the reviewer saw**

Home scrolled to the bottom (scrollY 115), then clicked the Timer utility link. Scroll was first clamped to 36 while the short skeleton showed, then jumped back to 115 when the timer rendered, so the page visibly jumps. Timer scrolled to 298, then clicked header Library: Library opened at scrollY 298 of 508, with the page title, Add-source actions and folders scrolled out of view (screenshot). Browser Back kept 298.

**Why it happens**

A declarative BrowserRouter doesn't manage scroll, and nothing in AppRoutes or AppLayout resets it when the pathname changes.

**Suggested fix**

Add a small ScrollToTop in AppRoutes: a useLayoutEffect on location.pathname that calls window.scrollTo({ top: 0, behavior: 'instant' }) when navigationType !== 'POP'. Use 'instant' because html has scroll-behavior: smooth. Alternatively move to createBrowserRouter with <ScrollRestoration/>.

**Who it hits**

Any navigation from a scrolled page: footer links, Home utilities, header nav, tool tiles. It is worse on short laptop screens and phones.

**Independent check**

grep finds no scrollTo or ScrollRestoration except SparringPage.tsx:118. App.tsx uses a declarative BrowserRouter. Repro, desktop 1280x800: scrolled /app to the bottom (scrollY 115) and clicked the Timer utility. /app/timer opened at scrollY 115 (max 298). Then scrolled Timer to 298 and clicked header Library: /app/library opened at scrollY 298 (max 508) with the h1 at top -165, so the title and add-source controls are off-screen (screenshot). The fix is correct: reset in a useLayoutEffect on pathname for non-POP navigation with behavior 'instant', because html has scroll-behavior: smooth (index.css:153).

**Evidence files**

[t6-nav.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t6-nav.json), [nav-library-after-click-from-scrolled-timer.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/nav-library-after-click-from-scrolled-timer.png), [nav-timer-after-click-from-scrolled-home.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/nav-timer-after-click-from-scrolled-home.png), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [scroll-library-after-click-from-scrolled-timer.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/scroll-library-after-click-from-scrolled-timer.png), [scroll-timer-after-click-from-scrolled-home.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/scroll-timer-after-click-from-scrolled-home.png)


### motion-polish-4: Adam's example: dashed empty-state boxes dip 10px, blur and fade back in whenever the pointer leaves them; global 'marching ants' redraws every dashed border on hover

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `dashed-hover-animation-restarts-entrance`

**Where**

- src/index.css:472-511 (.border-dashed:hover sets the animation shorthand to marching-ants at :505, plus @keyframes marching-ants)
- src/index.css:349-351 (.motion-swap animation) and :932-943 (@keyframes motion-swap: translateY(10px) scale(.99), opacity 0, blur(2px))
- src/pages/GeneratePage.tsx:384,402
- src/pages/AttackPage.tsx:139,152
- src/pages/BrainstormPage.tsx:127,135
- src/pages/FactoidsPage.tsx:145,159
- src/components/ui/empty-state.tsx:14 (History tabs, CurrentDebatePage, UnsortedWork, BrainstormResults)
- static dashed elements that get ants on hover: DebateContextControl.tsx:88, CurrentDebateStrip.tsx:60, HomePage.tsx:115, LibraryPage.tsx:484,864,872,897, CrossfirePage.tsx:1012, AskChat.tsx:330, FactoidsResults.tsx:275, SparringRound.tsx:272

**What the reviewer saw**

/app/generate, desktop. While hovered, animation-name is marching-ants. On mouseleave it becomes motion-swap again and restarts. Per-frame samples: t=12ms transform matrix(.99,…,0,10), opacity 0, blur(2px), top 291 versus 279 baseline; t=62ms 3.4px, opacity .66; settles by about 260ms. trackMovement shows a transient move of 12px and a resize of 6.8px. The sweep caught it on Generate, Attack, Brainstorm and Factoids, including the everyday path of moving from the box to the strip's 'Change' button. Clicking the Motion field after hovering the box does the same (video). The hover state itself replaces the 2px rounded dashed border with 1px square-cornered primary lines drawn inside the padding box (screenshots in light and dark). It does this even on plain text such as the 'No Current Debate, so no debate material…' line, and with reduced motion on. grep for onDrop/onDragOver in src finds nothing: there are no drop zones, so the ants falsely suggest a drop target. From code only: the loading variants (motion-shimmer + border-dashed + motion-swap) replay the same way while a generation streams.

**Why it happens**

Two rules set the `animation` shorthand on the same element. `.border-dashed:hover` (specificity 0,2,0, later in the file) beats `.motion-swap` (0,1,0) while hovered. On mouseleave the animation-name changes back to motion-swap, and a changed animation-name restarts the animation from frame 0. The ants are painted as a background-image with 1px background-size inside a now-transparent border, so the border changes thickness, position and corner shape.

**Suggested fix**

Delete the global `.border-dashed:hover` block and `@keyframes marching-ants` (index.css:472-511). Nothing in the app is a drop zone. If a future drop zone wants ants, add an opt-in `.dropzone` class that draws them on a pseudo-element and never sets the element's `animation`. Note that `.motion-shimmer` already uses ::after on the loading boxes, so a dropzone pseudo-element would need ::before.

**Who it hits**

The first screen of four Prepare and Practice tools, plus History and Current Debate empty states. The box blinks every time the pointer passes over it on the way to the form, which is the glitch Adam reported.

**Independent check**

This is Adam's example, confirmed in the compiled staging CSS. `.border-dashed:hover{…animation:marching-ants…}` sits at byte 79169 of index-BMQPADaz.css, after `.motion-swap{animation:motion-swap…both}` at byte 37079, and also has higher specificity. On /app/generate (desktop) the 'Ready to Generate' box reads animation-name marching-ants while hovered. The border turns transparent and is replaced by 1px square-cornered primary lines (hover crop). After the pointer moves to the Motion field, per-frame samples show the animation flip back to motion-swap and restart from frame 0. At t=38ms: transform matrix(.99,0,0,.99,0,10), opacity 0, blur(2px), top 291 against a 279 baseline. At 62ms 5px and opacity .49. It settles at about 280ms. trackMovement records a 12px transient move and a 6.8px resize. The debate-context line is dashed only in its no-debate or one-off branch, so it gets the ants only then. Touch behaviour is covered in mobile-visual-5. The fix is correct: delete index.css:472-511, since there are no drop zones.

**Evidence files**

[dashed-empty-state-dip-on-mouseleave.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/video/dashed-empty-state-dip-on-mouseleave.webm), [filmstrip-dashed-dip-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-dashed-dip-dark.png), [t1-dashed-generate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t1-dashed-generate.json), [dashed-generate-hover.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/dashed-generate-hover.png), [dashed-generate-after-mouseleave-40ms.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/dashed-generate-after-mouseleave-40ms.png), [hover-dashed-empty-dark-desktop-b.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/hover-dashed-empty-dark-desktop-b.png), [sweep-tools1-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/sweep-tools1-desktop-light.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [dashed-generate-hover.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dashed-generate-hover.png)


### mobile-visual-3: Dialogs have no max-height or scroll: Start new debate and Flowchart Add Node are cut off at the top and bottom on landscape phones, and their Close/Cancel/Submit buttons cannot be reached

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `dialog-no-max-height`

**Where**

- src/components/ui/dialog.tsx:41 (DialogContent: fixed, top-50%, translate-y-[-50%], no max-h, no overflow-y)
- src/components/ui/alert-dialog.tsx (same pattern)
- src/components/features/debate/DebateDialogs.tsx:129 (Start new debate / DebateForm)
- src/pages/FlowchartPage.tsx:501 (Add Node dialog)

**What the reviewer saw**

Start new debate on 568x320: dialog top -161 px, bottom 481 px; Close (top -144), Cancel and Start debate are all off-screen. On 915x412: top -63, bottom 475, the same three buttons off-screen. Flowchart Add Node on 568x320: top -127, bottom 447, Add Node and Close off-screen. On 915x412: top -81, bottom 493. On SE portrait 320x568 it is 574 px tall in a 568 px viewport, so both edges are clipped by 3 px. Radix locks body scroll and no scroll container exists inside (scroller: null), so the cut-off parts cannot be reached at all. Sheets (Review, Saved chats) do scroll and are fine. The Motion textarea autofocuses, so on a phone the keyboard opens at once and shrinks the usable height further.

**Why it happens**

The stock shadcn DialogContent centres a fixed box with transforms and never limits its height to the viewport.

**Suggested fix**

In dialog.tsx and alert-dialog.tsx add `max-h-[calc(100dvh-2rem)] overflow-y-auto` (or a header/body/footer layout with a scrolling body and a sticky footer) and `w-[calc(100%-2rem)]` so there is a gutter on phones. On mobile, consider rendering long forms (DebateForm, Add Node) as a bottom Sheet. Drop autoFocus on phones, or scroll the focused field into view.

**Who it hits**

Landscape phone users and small phones with the keyboard open cannot start a debate or add a flowchart node. The only way out is tapping the overlay.

**Independent check**

These measurements were taken at the real viewport and match the reviewer exactly. Pixel 7 landscape 915x412, Start new debate: top -63, bottom 475; Close at -46, Cancel and Start debate at 410-450, all off-screen; computed max-height none, overflow-y visible, no scroll container; Motion textarea autofocused. Flowchart Add Node at 915x412: top -81, bottom 493, Add Node and Close off-screen. At 568x320: top -127, bottom 447. At 320x568: top -3, bottom 571 (574 tall), with buttons still reachable. Do not cite the Start new debate measurements from SE landscape and SE portrait in s6-mobile.json: they were taken on /app/debate while mobile-visual-2's zoom-out was active (viewport reported as 800x451 and 800x1420). Dialogs were dismissed with Escape, never submitted. dialog.tsx:41 has no max-h or overflow-y.

**Evidence files**

[dialogs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/dialogs.json), [start-new-debate-pixel-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/start-new-debate-pixel-landscape.png), [start-new-debate-se-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/start-new-debate-se-landscape.png), [flowchart-add-node-se-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/flowchart-add-node-se-landscape.png), [flowchart-add-node-se-portrait.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/flowchart-add-node-se-portrait.png), [s6-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s6-mobile.json), [dialog-start-new-pixel-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dialog-start-new-pixel-landscape.png), [dialog-add-node-se-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dialog-add-node-se-landscape.png), [dialog-add-node-pixel-landscape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dialog-add-node-pixel-landscape.png), [dialog-add-node-se-portrait.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dialog-add-node-se-portrait.png)


### mobile-visual-4: Flowchart has not been themed for dark mode: white MiniMap, white controls with invisible icons, white attribution box

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `reactflow-default-light-styles`

**Where**

- src/pages/FlowchartPage.tsx:23 (imports reactflow/dist/style.css with no dark overrides)
- src/pages/FlowchartPage.tsx:132-150 (LocalizedControls)
- src/pages/FlowchartPage.tsx:764-777 (MiniMap; thesis and rebuttal both use #3b82f6 while the legend shows thesis as sky)
- node_modules/reactflow/dist/style.css:279-311 (.react-flow__controls-button background #fefefe; .react-flow__minimap background #fff)

**What the reviewer saw**

Computed in dark mode: .react-flow__minimap background rgb(255,255,255), .react-flow__controls-button rgb(254,254,254), with near-invisible icons. In the screenshots the controls show as a blank white strip over the Rebuttal node and the MiniMap as a bright white 200x150 box. On a 320 px phone the MiniMap covers 24% of the canvas (19% at 390). reactflow 11 has no colorMode prop, and no CSS in src overrides these classes (grep 'react-flow' in src/*.css finds nothing).

**Why it happens**

React Flow's default light stylesheet is used as-is. Its hard-coded colours ignore the app's theme tokens.

**Suggested fix**

Add a small CSS block (index.css, or a module next to FlowchartPage) mapping .react-flow__controls-button, .react-flow__minimap, .react-flow__attribution and the background dots to hsl(var(--card)), hsl(var(--border)) and hsl(var(--foreground)), with an svg fill of currentColor. Pass MiniMap maskColor and bgColor from tokens, and give thesis its own colour. Hide the MiniMap below sm.

**Who it hits**

Every dark-mode user of Flowchart; the canvas looks broken.

**Independent check**

Computed in dark mode on desktop: .react-flow__minimap bg rgb(255,255,255) (200x150), .react-flow__controls-button rgb(254,254,254), .react-flow__attribution rgba(255,255,255,.5). The only CSS rules matching these classes come from reactflow's own stylesheet. iPhone SE dark: canvas 318x400, minimap 200x150, which is 23.6% of the canvas. Screenshots show a blank white controls strip over the Rebuttal node and a bright white minimap. The thesis/rebuttal minimap colour sub-claim was not checked.

**Evidence files**

[flowchart-dark-320-canvas-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/crops/flowchart-dark-320-canvas-crop.png), [app_flowchart-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-dark/app_flowchart-full.png), [app_flowchart-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-tablet-dark/app_flowchart-full.png), [misc.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/misc.json), [s3-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s3-dark.json), [s7-final.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s7-final.json), [dark-flowchart-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-flowchart-desktop.png), [flowchart-small-mobile-dark-canvas.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/flowchart-small-mobile-dark-canvas.png)


### mobile-visual-5: Hover styles stick after a tap on touch devices: buttons stay raised with a near-black background, and dashed boxes march and replay their entrance animation (the 'dashed box jumps down and back up' glitch)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `hover-styles-not-gated-for-touch`

**Where**

- src/index.css:473-505 (.border-dashed:hover sets `animation: marching-ants …`, replacing motion-swap/motion-reveal/stagger entrance animations on the same element)
- src/index.css:303-311 (.motion-press:hover translateY(-1px) plus shadow, not gated by (hover:hover))
- src/index.css card-hover-glow, motion-list-item, tilt-card, feature-card :hover rules
- tailwind.config.ts (no future.hoverOnlyWhenSupported, so every hover: utility applies after a tap)
- 18 border-dashed usages, e.g. src/components/ui/empty-state.tsx, GeneratePage.tsx, LibraryPage.tsx, CurrentDebateStrip.tsx, DebateContextControl.tsx

**What the reviewer saw**

Pixel 7 emulation (matchMedia hover:none and pointer:coarse are both true). After tapping 'More options' on /app/generate and waiting 1.2 s, the button still matches :hover with transform matrix(1,0,0,1,0,-1), a shadow, and background rgb(2,5,19), which is the dark --accent. The text dims to accent-foreground, so it looks pressed or disabled. A Timer speaker chip shows the same after a tap. Tapping the dashed 'Ready to Generate' empty state sets border-color transparent and an infinite 'marching-ants' animation that keeps running until the next tap elsewhere. trackMovement records the box moving 12 px and resizing 4 px, then returning (transient-move), because the hover rule swaps out the element's motion-swap animation and the browser restarts it when the hover state changes.

**Why it happens**

Decorative hover effects are written as bare :hover rules. Touch browsers apply :hover on tap and keep it until the next tap. The marching-ants rule uses the `animation` shorthand, which also clobbers each element's entrance animation.

**Suggested fix**

Wrap the custom :hover rules in index.css in `@media (hover: hover) and (pointer: fine)` and set `future: { hoverOnlyWhenSupported: true }` in tailwind.config.ts. Remove the .border-dashed:hover marching ants, or move them to a pseudo-element (::after) so they never replace the element's own animation. Use :active for touch press feedback. This probably overlaps the motion-polish agent's report of the same root cause.

**Who it hits**

Every phone and tablet user, on every tap of a button, card or dashed box. Very visible in dark mode.

**Independent check**

Pixel 7 emulation (hover:none and pointer:coarse both true). 1.2s after tapping 'More options' on /app/generate, the button still matches :hover: transform matrix(1,0,0,1,0,-1), the 0 8px 20px shadow, bg rgb(2,5,19), and text dimmed to rgb(148,163,184) (crop). After tapping the dashed 'Ready to Generate' box: :hover true, animation marching-ants (infinite), border transparent. Tapping elsewhere (the strip) then replays its entrance: trackMovement records an 8.8px transient move and a 2.9px resize. In my run the jump came on the tap away, not on the tap itself. tailwind.config.ts has no future.hoverOnlyWhenSupported. The dashed-box half is motion-polish-4's cause (fixed by deleting marching-ants). The near-black colour is mobile-visual-6's token problem. What is unique here is gating hover with (hover:hover).

**Evidence files**

[hover.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/hover.json), [dashed.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/dashed.json), [generate-more-options-after-tap.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/generate-more-options-after-tap.png), [generate-dashed-empty-state-after-tap.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/generate-dashed-empty-state-after-tap.png), [dashed-tap-jiggle-pixel7.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/video/dashed-tap-jiggle-pixel7.webm), [sticky-hover-taps-pixel7-dark.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sticky-hover/video/sticky-hover-taps-pixel7-dark.webm), [s6-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s6-mobile.json), [sticky-more-options-after-tap-pixel7-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/sticky-more-options-after-tap-pixel7-dark.png)


### mobile-visual-6: Dark theme surface tokens are off: --muted is a mid-grey slab (404 page, every TabsList, badges) and --accent is near-black (every hover:bg-accent)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `theme-tokens-accent-muted-misassigned`

**Where**

- src/index.css:98 (.dark --muted: 215 16% 46% = rgb(99,114,136))
- src/index.css:101 (.dark --accent: 228 84% 4% = rgb(2,5,19))
- src/pages/NotFound.tsx:7 (bg-muted full page)
- src/components/ui/tabs.tsx (TabsList bg-muted): History tabs, Login Email/Demo code tabs
- src/components/layout/AppLayout.tsx:45 and many buttons/menus (hover:bg-accent); src/components/ui/dialog.tsx:48 (close button data-[state=open]:bg-accent)

**What the reviewer saw**

In dark mode the 404 page is a flat mid-grey slab, and its 'Return to Home' link (primary on muted) is 2.28:1 contrast. History and Login tab bars are bright grey bars with a darker selected tab, the inverse of expected. Every ghost or outline button's hover/active state turns rgb(2,5,19), darker than the page background rgb(15,23,41), with the label dimmed to accent-foreground. This shows on 'Edit settings', 'More options' and the Current debate trigger after a tap. The step between accent and card is 1.37:1, so it reads as a hole rather than a highlight. In light mode, --muted (slate-400) is likewise used as a heavy grey surface behind tabs.

**Why it happens**

The dark palette inverts shadcn's intended roles: muted is a mid-tone meant for borders or text, and accent is darker than the background. Yet components use both as surfaces. --muted-foreground also equals --foreground in both themes, so 'muted' text is not muted.

**Suggested fix**

Change the dark tokens in index.css to surface steps just above the card (for example --muted ≈ 217 33% 20%, --accent ≈ 217 33% 22% with accent-foreground = foreground), keep slate-400 as a separate text-muted token, and recheck TabsList, NotFound, badges and Switch tracks. Make NotFound use bg-background.

**Who it hits**

Every dark-mode user, on every hover or tap and every tab bar.

**Independent check**

Dark: the 404 page wrapper is bg rgb(99,114,136) (bg-muted, NotFound.tsx:7), and 'Return to Home' rgb(53,189,248) on it is 2.28:1 (screenshot). The /app/history tablist is bg rgb(99,114,136) with the active tab at rgb(15,23,41), darker than the bar. Light history tabs also sit on a heavy slate-400 bar (history-tabs.png). Every ghost or outline hover becomes rgb(2,5,19), darker than the page rgb(15,23,42) and the card rgb(29,40,57) (see motion-polish-6, which is marked a duplicate of this). Extra confirmed sub-claim: --muted-foreground equals --foreground in both themes (222 47% 11% light, 210 40% 98% dark), so the 377 text-muted-foreground usages render as full-strength body text. One token retune covers this and motion-polish-6. Light-mode --accent equals --card (210 40% 98%), so light hovers are invisible.

**Evidence files**

[zz-review-404-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/anon-mobile-dark/zz-review-404-viewport.png), [app_history-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-tablet-dark/app_history-viewport.png), [edit-debate-settings-se-portrait.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/edit-debate-settings-se-portrait.png), [current-debate-dropdown-320-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/current-debate-dropdown-320-dark.png), [contrast.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/contrast.txt), [s3-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s3-dark.json), [dark-404.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-404.png), [dark-history-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-history-viewport.png), [history-tabs.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/history-tabs.png)


### mobile-visual-7: Library source rows on phones: titles clipped to 22–114 px, cut mid-letter with no ellipsis; delete icon (28 px) sits beside the toggle

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `library-row-desktop-layout-on-phones`

**Where**

- src/pages/LibraryPage.tsx:79 (row flex h-[84px])
- src/pages/LibraryPage.tsx:88 (title <a> is inline-flex + truncate, so text-overflow:ellipsis is never drawn)
- src/pages/LibraryPage.tsx:94-96 (URL badge shrink-0 steals width from the title)
- src/pages/LibraryPage.tsx:129 (delete Button h-7 w-7, 8 px from the Switch)

**What the reviewer saw**

Visible title width against full width: 22/258 px at 320 ('The', 'Air', 'Car'), 92/258 at 390, 114/258 at 412. Screenshots show 'Air quality after t' and 'Car-free cores: \' hard-clipped mid-glyph with no ellipsis. The date/URL line is truncated to 68 px at 320. Each row packs the icon, title, URL badge, date, folder badge, a 28x28 delete button and a 44x24 switch into 288 px. On iPad the same rows read fine.

**Why it happens**

A desktop single-row layout with a fixed 84 px height. Ellipsis on an inline-flex anchor does nothing, because text-overflow needs a block or inline-block container around the text.

**Suggested fix**

Wrap the title text in a `<span className="truncate">` inside the link, or make the link `block truncate`. Below sm, let titles take two lines (line-clamp-2), drop the fixed h-[84px], move the URL badge to the meta line, and put delete into an overflow menu or the detail sheet, keeping the switch as the only trailing control.

**Who it hits**

Every phone user of the Library: sources cannot be told apart.

**Independent check**

Reproduced as pro on staging. All 43 current sources are links. Visible title width out of the full title width: 22 px of 185-683 px at 320x568 (row is 226 px wide), 92 px at 390x664, 114 px at 412x839, and up to 512 px on iPad portrait. At 320, 43 of 43 titles are clipped; at 390 and 412, 42 of 43. Screenshots show 'Dat', 'AM', 'Data and Feedba' and 'AMRON CENTRE' cut mid-letter with no ellipsis, while the meta line (p.truncate) below does get its ellipsis. The meta line is 68 px wide at 320. Location correction: the anchor at LibraryPage.tsx:88 computes as display:flex, not inline-flex, because flex items are blockified. The conclusion holds: text-overflow cannot apply to the anonymous flex item holding the text, so the suggested `<span className="truncate">` inside the link is the right fix. The span branch (non-http origin) already truncates correctly. Lines 79, 88, 95 and 132-141 are verified. The delete button sits 8 px from the Switch (28x28 vs 44x24). That button also appears in mobile-visual-14, where I found it deletes with no confirmation. Moving delete into the detail sheet, as suggested here, would also fix that part of 14.

**Evidence files**

[library-rows-320-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/crops/library-rows-320-crop.png), [app_library-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-mobile-dark/app_library-full.png), [measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-light/measure.json), [library-rows-small-mobile-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-rows-small-mobile-light.png), [library-rows-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-rows-mobile-dark.png), [library-rows-iphone-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-rows-iphone-light.png), [library-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-measure.json)


### mobile-visual-8: Mobile app menu: no scroll lock, no outside-tap close, and its bottom is cut off in landscape; the landing menu also ignores Escape

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `mobile-menu-inline-disclosure`

**Where**

- src/components/layout/AppLayout.tsx:244-266 (mobile nav inside the sticky header, in flow)
- src/index.css:423-425 (.native-mobile-menu max-height calc(100dvh - 4rem - safe-top), which ignores the ~46 px Current debate row)
- src/components/landing/Navbar.tsx:59-104 (no Escape handler, no scroll lock)

**What the reviewer saw**

App menu at 320x568, 568x320, 915x412 and 810x1080: wheel-scrolling with the menu open moves the page 400 px underneath (body/html overflow visible), and tapping the page outside the menu does not close it. In landscape the nav box ends at 365 px in a 320 px viewport and 457 px in a 412 px viewport. On 915x412 the Settings item sits at 381–441 px, half below the screen, and stays there because the sticky header never moves. Landing menu (Pixel 7 and SE in Hungarian): the page scrolls 500 px while it is open, and it stays open after Escape. Opening the app menu while scrolled is compensated by scroll anchoring, so there is no jump.

**Why it happens**

The menus are plain disclosures inside the sticky or fixed header, not overlay sheets. The height cap was written for a one-row header.

**Suggested fix**

Render both mobile menus as a Radix Sheet or Dialog (this gives scroll lock, outside-tap and Escape close, and a focus trap), or at least lock body scroll and add a backdrop that closes on tap. Compute the max-height from the header's real bottom (for example `max-h-[calc(100dvh-var(--header-h))]`, set from a ResizeObserver), or take the Current debate row into account.

**Who it hits**

All phone users of the main navigation; landscape users cannot fully see Settings.

**Independent check**

Measured as pro with the staging banner hidden by page-local CSS, so geometry matches production. App menu: body and html overflow stay visible. At 320x568 and 390x664, a wheel over the page moved it 400 px under the open menu. A tap outside the menu at (20,468) reached the Generate form underneath, and the menu stayed open. Escape does close the app menu (AppLayout.tsx:145-153). Landscape: the nav box ends 45 px below the viewport at both 915x412 (bottom 457) and 568x320 (bottom 365). Computed max-height is 348 px and 256 px. Even with the nav scrolled to its end, the Settings link (381-441 at 915x412, 289-349 at 568x320) stays 29 px below the screen edge. The landscape cut-off comes from index.css:424, `100dvh - 4rem`, which ignores the roughly 46 px Current debate row. That shares a cause with mobile-visual-9 (header height hard-coded), but turning the menu into a Radix Sheet removes it, so the primary key stays the disclosure one. Landing menu signed out (Pixel 7 and iPhone SE): the page scrolled 500 px with the menu open, and the menu stayed open after Escape. Navbar.tsx has no keydown handler, scroll lock or outside-tap handler.

**Evidence files**

[menu.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/menu/menu.json), [menu2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/menu/menu2.json), [menu-open-mobile-land915x412-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/menu/menu-open-mobile-land915x412-dark.png), [menu-open-after-scroll-small-mobile-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/menu/menu-open-after-scroll-small-mobile-light.png), [landing.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/landing/landing.json), [menu-open-land915x412.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/menu-open-land915x412.png), [menu-open-land568x320.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/menu-open-land568x320.png), [landing-menu-open-after-wheel-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/landing-menu-open-after-wheel-mobile.png), [menu-header-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/menu-header-measure.json)


### mobile-visual-14: Tap targets below 24 px or far below 44 px on touch: 16 px dialog and sheet close buttons, 28 px Library delete, 20 px footer and nav links

**Severity:** medium (reviewer said low) · **Verdict:** confirmed · **Root cause:** `touch-targets-mouse-sized`

**Where**

- src/components/ui/dialog.tsx:48 and src/components/ui/sheet.tsx:63 (close X h-4 w-4, no padding: 16x16)
- src/pages/LibraryPage.tsx:129 (delete 28x28 beside the 44x24 switch)
- src/components/layout/AppLayout.tsx:300-301 (footer Terms/Privacy 41x20 and 49x20)
- src/components/landing/Navbar.tsx:46-53 (tablet nav links 20 px tall)
- Library subtitle 'Change' button 55x20; header icon buttons 40x40

**What the reviewer saw**

Measured on phones: every Dialog and Sheet close button is 16x16 (dialogs.json, all cases). Library delete is 28x28 with an 8 px gap to the toggle switch, which raises the risk of accidental deletes even though deletion asks for confirmation. Footer links are 20 px tall. Most pass WCAG 2.5.8 only through the spacing exception, and all are well under the 44 px platform guideline. Touch users are the main audience.

**Why it happens**

shadcn defaults sized for mouse use.

**Suggested fix**

Give the close buttons `p-2 -m-2` (or h-10 w-10) with the icon centred. Use h-10 w-10 for the Library delete button or move it into a menu. Give footer and nav links `py-2.5` or min-h-11 on touch.

**Who it hits**

Phone and tablet users; mis-taps.

**Independent check**

Measured: the Library detail Sheet close button is 16x16. The Dialog close (dialog.tsx:48) uses the same h-4 w-4 icon with no padding, so it is also 16x16 by code. The Library row delete is 28x28, 8 px from the 44x24 Switch. The app footer Terms and Privacy links are 41x20 and 49x20. On iPad the landing nav links are 20 px tall (61x20 to 91x20). I did not measure the 'Change' button. Correction that raises the risk: the reviewer says 'deletion asks for confirmation', but the row's trash button does not. SourceRow onRemove calls handleRemoveSource (LibraryPage.tsx:410-416), which calls removeSource directly (session-store.ts:767-774) and deletes the Supabase row at once. There is no AlertDialog, and the 'Deleted' toast has no undo. The confirm dialog exists only inside the detail Sheet (LibraryPage.tsx around :1040). I did not press it, because the data is shared and seeded, so this is code evidence. A 28 px target 8 px from a toggle students tap often is therefore an irreversible mis-tap, so medium is honest rather than inflated. Fix: a confirm dialog or undo toast for the row delete, plus larger hit areas. The Library delete also appears in mobile-visual-7, whose move-delete-into-the-sheet fix would cover that part.

**Evidence files**

[dialogs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/dialogs/dialogs.json), [measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-light/measure.json), [landing.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/landing/landing.json), [library-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-measure.json), [library-sheet-open-small-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/library-sheet-open-small-mobile.png), [menu-header-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/menu-header-measure.json), [library-rows-small-mobile-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-rows-small-mobile-light.png)


### motion-polish-5: Global attribute-selector micro-interactions in index.css restyle every Radix widget and replay on mount (switch bounce, checkmark redraw, sliding tab triggers, double tab indicator, dead dialog-enter)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `global-attribute-selector-animations`

**Where**

- src/index.css:704-713 [role=switch][data-state=checked] > span (switch-bounce)
- src/index.css:716-723 [role=checkbox][data-state=checked] svg (check-draw)
- src/index.css:745-758 [role=menu] [role=menuitem], [data-radix-collection-item] (menu-item-in, fill both)
- src/index.css:781-800 [role=tablist] [data-state=active] ::after underline
- src/index.css:660-672 [data-state=open][role=dialog] dialog-enter (overridden, leaks fill-mode both)
- src/index.css:726-742 tooltip-in/out on [data-side] (also hits popover and select content)
- routes /app/library, /login, /app/history, Review sheet on tool pages

**What the reviewer saw**

/app/library: right after the switches mount, getAnimations() shows 'switch-bounce' running on every checked source toggle (at about 100ms the transform is scale(.85,1.15) translateX(20px)). So every Library visit slides each thumb from off to on with a squash, though nothing was toggled. /login and /app/history: every TabsTrigger has animationName 'menu-item-in' (fill both), and the active trigger has a 2px primary ::after underline beneath the white active pill: two indicators (screenshots). Select options also carry menu-item-in. Dialog, Sheet and Popover compute animation-name 'enter' (tailwindcss-animate wins because variants are emitted last), but fill-mode is 'both' and the timing function comes from the dead dialog-enter rule. Checked checkboxes in the Review sheet replay check-draw each time the sheet opens (code plus the sheet filmstrip).

**Why it happens**

The 'APPLE-LEVEL MICRO-INTERACTIONS' blocks style components through global attribute selectors (data-state, role, data-radix-collection-item). A CSS animation runs whenever a matching element is inserted, not only when state changes, and fill-mode both pins transforms afterwards. The toast rule in motion-polish-2 is the most severe case of the same pattern.

**Suggested fix**

Delete these blocks (index.css ~660-672, 700-800). Keep component motion in the component class lists, e.g. the switch thumb already has transition-transform, and TabsTrigger already marks the active tab with bg-background and shadow-sm. If any effect stays, scope it to a class and trigger it on state change, not on insertion.

**Who it hits**

Every visit to Library (all toggles bounce), every tabbed page (triggers slide in, double indicator), every Review sheet open. A small, repeated 'something moved' feeling.

**Independent check**

/app/library: right after the switches mount, every checked switch thumb has getAnimations() equal to ['switch-bounce'] (6 of 6 sampled), with no toggle. /app/history and /login: every tab trigger computes animation-name menu-item-in with fill both, and the active trigger has a 2px primary ::after underline (rgb(2,132,197) light, rgb(53,189,248) dark) under the white pill. The screenshot shows both indicators. Review sheet on /app/generate: the checked checkbox svgs run check-draw on open (3 of 3), and the sheet computes animation 'enter' with fill both and timing cubic-bezier(.22,1,.36,1), which leaks from the dead dialog-enter rule. Tooltip-in/out hitting popover and select content was not measured (code only).

**Evidence files**

[t8-misc-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t8-misc-light.json), [login-tabs-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/login-tabs-light.png), [history-tabs-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/history-tabs-light.png), [t2-login-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t2-login-light.json), [t4-overlays-light-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t4-overlays-light-desktop.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [s5-signedout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s5-signedout.json), [history-tabs.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/history-tabs.png), [login-tabs-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/login-tabs-light.png)


### motion-polish-6: Ghost and outline buttons get dimmer on hover (near-black hole in dark mode, barely visible change in light)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `theme-tokens-accent-muted-misassigned` · **Same fix as:** mobile-visual-6

**Where**

- src/components/ui/button.tsx:15,17 (outline/ghost: hover:bg-accent hover:text-accent-foreground)
- src/index.css:32-33 (light --accent 210 40% 98%, --accent-foreground 215 19% 34%)
- src/index.css:101-102 (dark --accent 228 84% 4%, --accent-foreground 215 20% 65%)
- examples: strip 'Change' and 'Use once', 'More options', mic button, header Language and theme, 'Load', 'Review'

**What the reviewer saw**

Computed colours before and after hovering on /app/generate. Dark 'Change': text rgb(248,250,252) → rgb(148,163,184), background transparent → rgb(2,5,19), darker than the card behind (screenshot pair). Dark 'More options' and mic: bg rgb(15,23,41) → rgb(2,5,19), text → rgb(148,163,184). Light mic and 'More options': bg rgb(241,245,249) → rgb(248,250,252) (2% lightness), text rgb(15,23,41) → rgb(70,84,103). The hovered control looks less active than at rest.

**Why it happens**

The accent tokens are tuned as a background near the page colour with a muted foreground. shadcn uses them as the hover pair, so hover lowers text contrast instead of raising emphasis.

**Suggested fix**

Retune the tokens. Light: --accent around 210 40% 92% with --accent-foreground equal to --foreground. Dark: --accent lighter than --card (around 217 32% 24%) with --accent-foreground 210 40% 98%. Check the Select and Command item hovers that share the tokens.

**Who it hits**

Every ghost and outline button and nav hover, on every page. Most noticeable in dark mode.

**Independent check**

Dark mode, /app/generate, hover. 'Change': bg transparent → rgb(2,5,19), text rgb(248,250,252) → rgb(148,163,184). 'More options': bg rgb(15,23,41) → rgb(2,5,19), text dimmed the same way. The card behind is rgb(29,40,57) and the page rgb(15,23,42), so the hover is darker than both. The crop shows a black box with grey text. Header nav links (hover:text-foreground) keep their text colour but get the same near-black background. Light-mode values were not re-measured. They follow from tokens I read in code: --accent 210 40% 98% against --card 210 40% 98% (identical), and --accent-foreground 215 19% 34%. Same token fix as mobile-visual-6.

**Evidence files**

[hover-ghost-change-dark-desktop-a.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/hover-ghost-change-dark-desktop-a.png), [hover-ghost-change-dark-desktop-b.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/hover-ghost-change-dark-desktop-b.png), [hover-mic-light-desktop-a.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/hover-mic-light-desktop-a.png), [hover-mic-light-desktop-b.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/hover-mic-light-desktop-b.png), [t9-hover-dark-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t9-hover-dark-desktop.json), [t9-hover-light-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t9-hover-light-desktop.json), [s3-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s3-dark.json), [dark-hover-change-a.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-hover-change-a.png), [dark-hover-change-b.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-hover-change-b.png), [dark-hover-moreOptions-b.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/dark-hover-moreOptions-b.png)


### motion-polish-7: Cold load cycles through four different loading visuals and skeletons that don't match the page, then content pops; Settings 'Loading…' line pushes cards 52px

**Severity:** low · **Verdict:** confirmed · **Root cause:** `fragmented-loading-states`

**Where**

- index.html:144-149 (startup shell card)
- src/components/auth/RequireAuth.tsx:10-15 (full-screen Loader2 without header while auth loads)
- src/App.tsx:186-198 and src/components/loading/RouteSkeleton.tsx (home-grid and tool-form skeletons lack the Current Debate card and strip rows)
- src/pages/SettingsPage.tsx Subscription card placeholder
- routes /app, /app/generate, /app/debate, /app/settings

**What the reviewer saw**

Cold /app (dark): startup card 'Loading DebateLab' (2952ms) → blank page with a centred spinner and no header (3124-3191ms) → header + skeleton with a broken logo square (3269-3334ms) → content (3421ms), whose Current Debate card isn't in the skeleton, so the tool grid lands about 120px lower than its skeleton. /app/generate and /app/debate show the same sequence in light. /app/settings: the Subscription card shows a one-line 'Loading…' for about 230ms, then grows (Pro badge, Set Up Billing), pushing Global Settings and Account down 52px (CLS 0.0161; y 351 to 403, 553 to 605).

**Why it happens**

Each layer has its own loading UI (static shell, auth spinner, route skeleton, per-card placeholder) with different layouts, and the placeholders don't reserve the final size.

**Suggested fix**

While auth loads, render the same markup as the index.html startup shell, or the AppLayout chrome with the route skeleton, instead of a bare spinner. Add the strip and Current Debate card rows to the home-grid and tool-form skeletons. Give the Subscription placeholder the loaded card's height (badge row plus text line).

**Who it hits**

Every cold open of the app. Several flashes in about 500ms make startup feel busier and slower than it is.

**Independent check**

The __states timeline shows the sequence on every cold run. Unthrottled /app: startup shell (42ms) → bare spinner with no header (83ms, RequireAuth.tsx:10-15) → header plus skeleton (114ms) → content. With fresh cache and fast4g: shell 878ms → spinner 2606ms → header plus skeleton 2686ms → content 3042ms. The spinner and skeleton frames were too short for my screenshot loop, so the timeline is the proof (do not use coldseq-app-dark-2-spinner.png as spinner evidence: it shows content). /app/settings reproduced exactly: one shift at about 337ms, CLS 0.0161, with the Global Settings and Account cards moving y 351→403 and 553→605 when the Subscription 'Loading…' line (SettingsPage.tsx:200-201) expands. Not measured: the '~120px skeleton vs content' offset, because the Layout Shift API does not record node replacement. The grid y311→336 shift seen in these runs is motion-polish-1's no-debate → debate flip, not a skeleton mismatch. The broken logo square in the skeleton was not checked.

**Evidence files**

[filmstrip-app-cold-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-app-cold-dark.png), [filmstrip-generate-cold-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-generate-cold-light.png), [filmstrip-settings-cold-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-settings-cold-light.png), [t3-coldload-settings-cold-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t3-coldload-settings-cold-light.json), [s1-coldload.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s1-coldload.json), [s7-final.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s7-final.json), [settings-final.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/settings-final.png)


### motion-polish-8: Tool pages fade and slide in over ~350ms on every visit, in staggered pieces

**Severity:** low · **Verdict:** confirmed · **Root cause:** `route-content-entrance-animation`

**Where**

- src/components/ui/animated-section.tsx:10-28 (opacity-0 translate-y-2 until setTimeout, then transition-all duration-300)
- src/pages/GeneratePage.tsx:368,377 (delay 0 and 75)
- AttackPage, BrainstormPage, FactoidsPage, AskPage and the *Results components (same component)
- motion-swap on the empty state (index.css:349)

**What the reviewer saw**

Repeat Home → Generate navigation with the chunk already cached. The AnimatedSection wrapper has opacity 0 at 81ms after the click, 0.44 at 173ms, 0.84 at 275ms and 1.0 at about 416ms, while the empty state animates separately (motion-swap, 0 to 1 by about 366ms). The cold-load filmstrip shows the page assembling in parts: strip (619ms) → faded heading (671ms) → empty state (746ms) → form (807-993ms).

**Why it happens**

Entrance choreography is applied to route content itself. Content mounts hidden and becomes visible only after a timer and a 300ms transition, on every visit, not just the first.

**Suggested fix**

Remove AnimatedSection from route-level content, or make it a CSS-only animation of 150ms or less with no initial hidden state and no extra delay. Keep the empty state static.

**Who it hits**

Every tool open. It adds about 0.3-0.4s before the form is fully readable and works against 'feels instant'.

**Independent check**

Measured Home → Generate 3 times with the chunk cached (load average about 3). The AnimatedSection wrapper first appears at opacity 0 with translateY(8px), at 276, 186 and 143 ms after the click. It reaches opacity 1 at 626, 502 and 465 ms, a median of 502ms after the click. So route content stays hidden or fading for a median of about 320ms after it has mounted. Code: animated-section.tsx sets state in setTimeout and then applies transition-all duration-300, on every mount. Under reduced motion it shows at once (motion-reduce classes).

**Evidence files**

[t6-nav.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t6-nav.json), [filmstrip-nav-home-to-generate-repeat.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-nav-home-to-generate-repeat.png), [filmstrip-generate-cold-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-generate-cold-light.png), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json)


### motion-polish-9: Hover lift, shadow and icon scale applied to nearly every clickable thing (and to non-clickable result cards); its svg rule overrides component-specific icon motion

**Severity:** low · **Verdict:** confirmed · **Root cause:** `motion-press-global-hover-lift`

**Where**

- src/index.css:296-321 (.motion-press hover translateY(-1px) plus 0 8px 20px shadow; active scale(.985); `> svg` translateY(-.5px) scale(1.04))
- src/components/ui/button.tsx:8 (every Button)
- src/components/layout/AppLayout.tsx:44,211,300-301 (nav links, settings icon, footer text links)
- src/pages/HomePage.tsx:60,72 (tool row; arrow group-hover:translate-x-1 never applies)
- src/components/ui/section-card.tsx:33,50 + src/index.css:804-812,1087-1090 (regenerate icon: icon-spin vs hover-icon-spin vs motion-press svg)
- src/components/features/generate/GenerateResults.tsx:35, attack/AttackResults.tsx:42, factoids/FactoidsResults.tsx:45 (non-clickable cards with motion-list-item card-hover-glow inside a SectionCard that also lifts)

**What the reviewer saw**

Hovering a Home tool row: the row has transform matrix(1,0,0,1,0,-1) and shadow 0 8px 20px. Its ArrowRight has matrix(1.04,0,0,1.04,0,-0.5), so the intended 4px nudge right (group-hover:translate-x-1) is overridden (specificity 0,4,1 beats 0,3,0). Press on wide rows and buttons shrinks them 5.8-7.1px (sweep). Regenerate icon on a SectionCard: 'icon-spin' runs for 0.5s, then the icon ends at scale(1.04) translateY(-.5px). The rotate(90deg) from .hover-icon-spin never wins. Result argument cards: hover gives translateY(-1px) and a primary glow, but cursor:auto and no click handler. Footer 'Terms'/'Privacy' text links get the same lift and shadow block.

**Why it happens**

One global motion class is baked into the Button base and copied onto links, rows and icons. Its high-specificity `> svg` hover transform wins over per-component utilities. Decorative hover-lift classes are also used on read-only cards.

**Suggested fix**

Limit the lift and shadow to primary or filled buttons (or drop the lift and keep colour plus press). Delete the `.motion-press … > svg` transforms so components control their own icons (the HomePage arrow, hover-icon-spin). Remove motion-list-item and card-hover-glow from non-interactive result cards and SectionCard. Delete the conflicting refresh-icon rules, keeping one.

**Who it hits**

Constant small movement under the cursor across the whole app. Icons go slightly blurry on hover, reading content jiggles, and the arrow affordance is lost.

**Independent check**

Home 'Generate' row on hover: transform matrix(1,0,0,1,0,-1) and shadow 0 8px 20px. Its ArrowRight, a direct child svg of the Link, computes matrix(1.04,0,0,1.04,0,-0.5), so group-hover:translate-x-1 is overridden by `.motion-press:…:hover > svg` (index.css:318). The SectionCard regenerate button (section-card.tsx:44-53, which has hover-icon-spin) runs icon-spin and then rests at matrix(1.04,…,-0.5), so the rotate(90deg) from .hover-icon-spin never wins. Correction: the result card I hovered was the outer SectionCard. It got the card-hover-glow shadow (0 0 0 1px primary/.1, 0 8px 24px primary/.08) with cursor auto and no click handler, but it did not lift (transform identity). The 1px lift belongs to the inner motion-list-item argument cards, which I did not hover. The press-shrink widths were not re-measured.

**Evidence files**

[t8-misc-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t8-misc-light.json), [home-toolrow-hover-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/home-toolrow-hover-light.png), [results-item-hover-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/results-item-hover-light.png), [sweep-app-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/sweep-app-desktop-light.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [home-toolrow-hover.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/home-toolrow-hover.png), [results-item-hover.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/results-item-hover.png)


### motion-polish-11: Keyboard focus on text inputs is a faint ~2:1 glow: a global !important rule replaces the components' focus ring

**Severity:** low · **Verdict:** confirmed · **Root cause:** `global-important-input-focus-style` · **Known in plan:** related to next-15 #14 (accessibility pass), not listed there specifically

**Where**

- src/index.css:620-623 (input:focus, textarea:focus, select:focus { border-color …/.5 !important; box-shadow … .1 !important })
- src/components/ui/input.tsx, src/components/ui/textarea.tsx (focus-visible:ring-2 ring-ring ring-offset-2 overridden)
- /login email field, every form input or textarea

**What the reviewer saw**

/login, Tab to the email input: box-shadow 'rgba(2,132,197,.1) 0 0 0 3px, rgba(2,132,197,.08) 0 0 8px', border rgba(2,132,197,.5). Computed contrast of the focused border against the card: 1.97:1 light, 2.47:1 dark (below the 3:1 non-text guideline). The intended solid ring would be 3.93:1 light and 6.83:1 dark, and Select triggers and buttons in the same form do get it, so focus looks different from field to field.

**Why it happens**

An unscoped `!important` focus style in index.css beats the component-level focus-visible ring utilities.

**Suggested fix**

Delete index.css:619-623 so the input and textarea focus-visible ring applies, or keep a subtle :focus border without !important and let :focus-visible draw the ring.

**Who it hits**

Keyboard users on every form, e.g. motion and argument fields. The focused field is hard to spot.

**Independent check**

/login, Tab to the email input (:focus-visible true). Light: border rgba(2,132,197,.5) and box-shadow 'rgba(2,132,197,.1) 0 0 0 3px, rgba(2,132,197,.08) 0 0 8px'. Dark: the same with rgb(53,189,248). The blended light border against the card rgb(248,250,252) works out to about 1.9:1, matching the reviewer's 1.97:1. The 'Continue with Google' button visibly gets the solid offset ring (screenshot pair), so focus looks different from field to field. Cause: the !important rule at index.css:620-623.

**Evidence files**

[t2-login-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t2-login-light.json), [login-input-focus-click-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/login-input-focus-click-light.png), [s5-signedout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s5-signedout.json), [login-email-focus-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/login-email-focus-light.png), [login-google-focus-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/login-google-focus-light.png), [login-email-focus-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/login-email-focus-dark.png)


### motion-polish-12: Focus rings are clipped inside the 'More options' panels

**Severity:** low · **Verdict:** confirmed · **Root cause:** `motion-expand-overflow-clips-focus`

**Where**

- src/index.css:394-397 (.motion-expand > * { overflow: hidden })
- src/components/features/generate/GenerateForm.tsx:227
- src/components/features/attack/AttackForm.tsx:128

**What the reviewer saw**

/app/generate → More options → Tab to 'Case Length'. The trigger's 2px ring plus 2px offset is cut off on the left edge by the grid wrapper (overflow: hidden). 4x crop attached. Measured clip ancestor: div.grid.gap-4.pt-1.sm:grid-cols-3, overflow hidden.

**Why it happens**

The grid-rows expand animation needs overflow hidden on the child, but it stays hidden after the panel is open.

**Suggested fix**

Apply overflow: hidden only while closed or animating (e.g. `.motion-expand:not([data-open='true']) > *`), or pad the inner wrapper (p-1 -m-1), or use overflow: clip with overflow-clip-margin: 4px.

**Who it hits**

Keyboard users in Generate and Attack advanced options.

**Independent check**

/app/generate → More options → Tab. The focused 'Standard' (Case Length) trigger is at left 89, with ring box-shadow '… 0 0 0 2px, rgb(2,132,197) 0 0 0 4px'. Its first clipping ancestor is div.grid.gap-4.pt-1.sm:grid-cols-3 at left 89 with overflow hidden (index.css:394-397). The crop shows the ring missing on the left edge.

**Evidence files**

[more-options-focus-ring-clipped.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/more-options-focus-ring-clipped.png), [more-options-focus-ring-clipped-4x.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/raw/more-options-focus-ring-clipped-4x.png), [t8-misc-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t8-misc-light.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json), [more-options-focus.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/raw/more-options-focus.png)


### motion-polish-13: Theme switch is staggered: page snaps, cards fade over 260ms, buttons over 160ms, body over 420ms

**Severity:** low · **Verdict:** confirmed · **Root cause:** `theme-switch-staggered-transitions`

**Where**

- src/index.css:156-159 (html, body transition background-color/color 420ms)
- src/index.css:323-327 (.motion-surface, every Card, transitions background-color 260ms)
- src/index.css:517-521 (global button/a/input transition incl. background-color, color 160ms)
- src/components/layout/AppLayout.tsx:179 (bg-background wrapper with no transition)
- src/components/ThemeProvider.tsx (class swap)

**What the reviewer saw**

Switching to dark on /app, filmstrip and per-frame samples: at 102ms the page wrapper is already dark while the Prepare/Practice cards are light-grey slabs and the utility chips are white. The cards are still mid-grey at 238ms and finish around 300-430ms. The body colour reaches its final value at 429ms.

**Why it happens**

Colour transitions with different durations live on different layers, and the topmost page wrapper has none.

**Suggested fix**

In ThemeProvider, add a temporary class (e.g. `theme-switching`) that sets `* { transition: none !important }` across the class swap and removes it on the next frame. Also drop background-color and color from the global element transition and from html/body.

**Who it hits**

Anyone who toggles the theme or whose OS switches at sunset. It's a brief but visible patchwork.

**Independent check**

Repro: flipped the OS preference with theme 'system' (page.emulateMedia light → dark) on /app. I did not use the theme toggle, which would change the shared pro account's setting. Per-frame settle times over 3 runs: the page wrapper and header snap at 54, 26 and 53 ms. The utility chip settles at 222, 197 and 197 ms. The Prepare card settles at 337, 283 and 298 ms (median 298). The body settles at 403, 363 and 383 ms. At about 69ms the wrapper is already rgb(15,23,41) while the Prepare card is still rgba(248,250,252,.6) and the chip is white: the patchwork is real. The theme-switch-100ms.png screenshot landed after settling, so the per-frame data is the evidence.

**Evidence files**

[filmstrip-theme-switch-_app.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-theme-switch-_app.png), [t5-theme-_app.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t5-theme-_app.json), [s4-theme-throttle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s4-theme-throttle.json), [s3-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s3-dark.json)


### motion-polish-14: Text reflows when the Inter web font arrives (FOUT) on slower networks

**Severity:** low · **Verdict:** confirmed · **Root cause:** `webfont-import-fout`

**Where**

- src/index.css:1-3 (three Google Fonts @imports with display=swap: Inter, Lora, Space Mono)
- index.html (no preload or metric-matched fallback)
- /login (also any first page)

**What the reviewer saw**

/login cold load with fast-4G throttling: h1 painted at 2814ms, Inter loadingdone at 3341ms, and the login card resized 516 → 496px and moved y 179 → 189 at 3323ms (CLS 0.0041). The same shift appeared unthrottled while the box was busy (t2-login loadShifts at 1266ms). On fast unthrottled runs the font arrived within about 10-80ms of first render with no shift, so this depends on the network.

**Why it happens**

Web fonts load through a CSS @import chain and are only requested once text renders. The system fallback has different metrics, so lines rewrap when Inter swaps in.

**Suggested fix**

Self-host Inter (400-700 woff2), add <link rel=preload> for the main weight, and declare a fallback @font-face (local Arial/Segoe) with size-adjust and ascent/descent overrides that match Inter. Don't block on Lora or Space Mono.

**Who it hits**

First visits on school wifi or mobile data. The card and its headings jump about 10-20px half a second after appearing.

**Independent check**

Cold /login, fresh browser and cache, fast4g, 3 runs. FCP 880, 804 and 832 ms. Inter finished loading (loadingdone) at 3387, 3247 and 3295 ms. Each time the sign-in card shifted y 179→189 and h 516→496 within a few ms of that event, CLS 0.0041. An unthrottled run had the font at 442ms and no shift. The Google Fonts CSS arrives by about 850ms, but the woff2 files only start once text renders (an @import chain, index.css:1-3). Low is right: one 10px jump on slow first visits.

**Evidence files**

[t10-login-cold-fast4g.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t10-login-cold-fast4g.json), [filmstrip-login-cold-fast4g.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-login-cold-fast4g.png), [t2-login-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t2-login-light.json), [s5-signedout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s5-signedout.json)


### motion-polish-16: Loading spinners freeze under prefers-reduced-motion

**Severity:** low · **Verdict:** confirmed · **Root cause:** `reduced-motion-blanket-reset`

**Where**

- src/index.css:1093-1105 (*, *::before, *::after { animation: none !important; transition: none !important })
- src/components/auth/RequireAuth.tsx:13, src/components/ui/loading-spinner.tsx, Loader2 in buttons, .motion-loading-bar, typing dots

**What the reviewer saw**

With reducedMotion 'reduce', an element with class animate-spin computes animationName 'none'. Everything else checked honours reduced motion correctly: no dashed replay, motion-press transform none, AnimatedSection visible at once, landing aurora, orbs and hero static.

**Why it happens**

The blanket reduced-motion reset also stops essential progress indicators.

**Suggested fix**

Exempt spinners and progress (e.g. `.animate-spin { animation-duration: 1.5s !important }` inside the media query, or swap them for a non-moving 'Loading…' label).

**Who it hits**

Reduced-motion users see a static spinner during auth and generation, which reads as a hang.

**Independent check**

With reducedMotion 'reduce' (matchMedia true), an element with class animate-spin computes animationName 'none'. The cause is the blanket rule `*{animation:none !important}` at index.css:1093-1105. It applies to RequireAuth's Loader2 and every button spinner.

**Evidence files**

[t7-reduced-motion.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t7-reduced-motion.json), [filmstrip-landing-reduced-motion-load.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-landing-reduced-motion-load.png), [s5-signedout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s5-signedout.json)


### motion-polish-18: Crossfire and Sparring apply motion-swap (transform + blur) to the whole page container for exactly one render on phase change

**Severity:** low · **Verdict:** cannot-verify · **Root cause:** `phase-change-one-render-motion-class`

**Where**

- src/pages/CrossfirePage.tsx:300-305 (phaseChanged computed from a ref) → 637,861,873,912
- src/pages/SparringPage.tsx:48-52 (viewChanged) → 311,327,336

**What the reviewer saw**

Code-only, not reproduced (needs AI calls). phaseChanged is true only on the render where the phase changes. The effect updates the ref, so the next re-render (Crossfire re-renders on its 'now' clock and on typing) removes the class mid-animation, cutting the 260ms entrance short with a snap. While it runs, filter: blur(2px) and transform sit on the whole page container, blurring the page and making it the containing block for fixed or sticky descendants.

**Why it happens**

An entrance animation is toggled by a one-render flag instead of being keyed to the phase.

**Suggested fix**

Key the inner content by phase (key={state.phase}) and use a light CSS entrance without filter on the content block only, or drop it.

**Who it hits**

Students moving between Crossfire and Sparring phases may see a blur flash or a cut-off transition.

**Independent check**

I could not reproduce this at runtime. Reaching a Crossfire or Sparring phase change needs AI calls, and my budget was 0. The code supports the mechanism. CrossfirePage.tsx:300-305 computes phaseChanged from a ref that an effect updates, so 'motion-swap' is present for exactly one render. On entering 'active', the effect at :421-426 calls setNow(Date.now()) right away, so the class is probably removed one render after it was added: either a one-frame blank (motion-swap frame 0 is opacity 0) or a cut-short entrance. SparringPage.tsx:46-52 uses the same pattern on the page container (:311, :327, :336). The claim that a transform or filter makes the container the containing block for fixed descendants is correct CSS, but I did not check whether those pages have fixed children. To verify with AI budget: start a Crossfire round and record setup → active at 60fps.


### mobile-visual-9: Two-row 110 px sticky header on phones and tablets: 27–35% of a landscape or keyboard-open viewport, and anchors land 30 px underneath it (scroll-margin 80 px)

**Severity:** low (reviewer said medium) · **Verdict:** confirmed · **Root cause:** `mobile-header-height-hardcoded`

**Where**

- src/components/layout/AppLayout.tsx:178-238 (64 px header row plus the Current debate row below lg, sticky)
- src/index.css:468-470 ([id] { scroll-margin-top: 5rem })
- src/pages/GeneratePage.tsx:53-59 and :388 (results anchor id=generate-results scrolled to block:start after each generation)

**What the reviewer saw**

The header is 110 px on every width below 1024. That is 27% of a 915x412 landscape viewport and 34% of 568x320. With a simulated keyboard (viewport 568→312) it takes 35% of the visible area. Crossfire's textarea and Generate's motion input, when revealed from below, end up at top 79–80 px, under the header bottom at 110 (coveredByHeader true). An [id] element scrolled to block:start lands at top 80 px while the header ends at 110 px, so Generate's results heading will sit 30 px under the header after every generation on phones and tablets.

**Why it happens**

The scroll-margin constant assumes the desktop one-row header. The Current debate row is permanently sticky on small screens.

**Suggested fix**

Expose the header height as a CSS variable (set from a ResizeObserver in AppLayout) and use `scroll-margin-top: calc(var(--header-h) + 0.5rem)` and `scroll-padding-top` on html. On phones, let the Current debate row scroll away (only the 64 px row sticky), or hide it while scrolling down. In landscape (max-height: 500px), make the header non-sticky.

**Who it hits**

All phone and tablet users while typing, in landscape, and when Generate jumps to results.

**Independent check**

Geometry reproduced with the banner hidden, so it matches production. The header is 110 px at 320x568, 390x664, 568x320 and 915x412. That is 19.4%, 16.6%, 34.4% and 26.7% of the viewport. [id] elements have scroll-margin-top 80px (index.css:468-470). After #generate-more-options.scrollIntoView({block:'start'}), its top is at 80 while the header ends at 110: 30 px covered at every size. #generate-results (GeneratePage.tsx:53-59, :388) is the only [id] the app itself scrolls to with block:'start'. So the defect a user sees is the results' top 30 px sitting under the translucent header after each generation on screens below lg. I could not trigger a real generation (AI budget 0). The keyboard-reveal claim is inference, not proven in a browser: headless Chromium has no virtual keyboard, and the reviewer's 79-80 px figures also came from scrollIntoView on [id] elements. Downgraded from medium: in portrait the header takes 17-19% of the screen, and the landscape share is real but a niche case.

**Evidence files**

[keyboard.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/keyboard/keyboard.json), [crossfire-argument-keyboard-reveal-from-below.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/keyboard/crossfire-argument-keyboard-reveal-from-below.png), [anchor-under-sticky-header-iphone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/keyboard/anchor-under-sticky-header-iphone.png), [app_generate-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-mobile-land915x412-dark/app_generate-viewport.png), [anchor-under-header-port390x664.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/anchor-under-header-port390x664.png), [menu-header-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/menu-header-measure.json)


### mobile-visual-10: Fixed-height nested scroll lists (Library 600 px, History 500 px) waste space when short and trap swipes on phones when long; History hides half its tabs off-screen

**Severity:** low · **Verdict:** confirmed · **Root cause:** `fixed-height-inner-scroll-panels`

**Where**

- src/pages/LibraryPage.tsx:39 and :880 (SOURCE_LIST_HEIGHT = 600, overflow-y-auto)
- src/pages/HistoryPage.tsx:155, 219, 249, 279, 315 (ScrollArea h-[500px])
- src/pages/HistoryPage.tsx:137 (TabsList w-full justify-start overflow-x-auto, no scroll affordance)

**What the reviewer saw**

With 1–3 items both cards show 300–450 px of empty card on phones (screenshots). The 600 px Library list is taller than the visible area below the header on an SE (458 px) and an iPhone 14 (554 px). Once the shared pro account had 18 sources, the list became an inner scroller filling the whole screen, so page swipes start inside it. History tabs at 320: scrollWidth 635 versus clientWidth 288, with Brainstorms, Factoids and Sparring fully hidden; 'Brainsto' is cut at the edge and there is no fade or arrow hint. This is geometry and code evidence; real swipe chaining was not driven.

**Why it happens**

Desktop-style fixed-height panels inside a page that itself scrolls.

**Suggested fix**

Use `max-h-[600px]` (desktop only) and no inner scroll below md, so the list grows with the page, or paginate or virtualise. Let History tabs wrap into two rows on phones, or use a Select, or add edge fade masks plus scrollIntoView on the active tab.

**Who it hits**

Phone users of Library and History, especially heavy users with many items.

**Independent check**

Code: LibraryPage.tsx:880 uses style={{height: 600}}, a fixed height rather than a max, and HistoryPage.tsx:155/219/249/279/315 use ScrollArea h-[500px]. Library today has 43 sources (scrollHeight 3956), so the list is a 600 px inner scroller. Only 458 px are visible below the header at 320x568 and 554 px at 390x664. History tabs: scrollWidth 635 vs clientWidth 288 at 320, 358 at 390 and 380 at 412. At 320, Brainstorms, Factoids and Sparring are hidden, with no mask (mask-image none) and no arrow hint. The empty-space claim holds in code (fixed heights), but I could not reproduce it today: the account now has 43 sources, about 554 px of cases and 698 px of attacks, and Chats shows an empty state without a ScrollArea. New, related observation: at 320 the History cards overflow the Radix ScrollArea viewport (scrollWidth 301 vs 222). The card right borders are cut 79 px and the Load buttons 14 px (visible in history-small-mobile-dark.png). The overflow is 8 px at 390 and none at 412. Fix it together with this finding (min-w-0 or w-full on the cards, or no ScrollArea below md). Swipe trapping was not driven, so that part is geometry only.

**Evidence files**

[app_history-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-mobile-dark/app_history-full.png), [app_library-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-light/app_library-full.png), [app_library-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-tablet-land1080x810-dark/app_library-viewport.png), [misc.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/misc.json), [history-small-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/history-small-mobile-dark.png), [pages-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/pages-measure.json), [misc-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/misc-measure.json), [history2-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/history2-measure.json), [library-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/library-measure.json)


### mobile-visual-11: Theme switch is out of sync: html/body fade for 420 ms while text and cards switch instantly (white text on a light page for about 100 ms)

**Severity:** low · **Verdict:** partly · **Root cause:** `theme-swap-mixed-transitions`

**Where**

- src/index.css:156-158 (html, body transition background-color 420ms)
- src/components/ThemeProvider.tsx:10-24 (class swap)
- src/lib/stores/settings-store.ts:308-323 (server theme applied after sign-in hydration)

**What the reviewer saw**

Emulated an OS switch light→dark on /app (theme 'system'). At 54 ms the h1 colour is already rgb(248,250,252) while the body is still rgb(241,245,249). It is rgb(89,96,110) at 141 ms and does not reach rgb(15,23,42) until about 500 ms. Text that sits directly on the page background (page h1s, the Utilities heading) is unreadable for the first frames. The same fade runs when a user picks a theme, and once per new device when the server-saved theme differs from the local default (code evidence).

**Why it happens**

Only html and body have a colour transition; everything else switches instantly.

**Suggested fix**

Remove the html/body background transition, or disable all transitions for one frame while swapping theme classes (add a `.theme-switching * { transition: none !important }` class around the swap in ThemeProvider).

**Who it hits**

Anyone switching theme or following the OS auto dark mode at sunset.

**Independent check**

The symptom is real, but the reviewer's mechanism is wrong. I emulated an OS light-to-dark switch with theme 'system' and sampled every animation frame, 3 runs each (identical), on /login signed out and on /app/library as pro (server theme is 'system'). The html/body 420 ms fade is not visible, because an opaque bg-background element covers the body. On /app the h1's opaque ancestor is the AppLayout root div (native-safe-screen bg-background), which switches instantly, and h1 contrast stays at 17.08 the whole time. What actually goes out of sync is the per-component transitions. .motion-surface (every Card, index.css:323-327) fades background-color over 260 ms. The global `button, a, input, select, textarea, [role=button]` rule (index.css:516-520) fades color and background over 160 ms. .motion-field and .motion-list-item do the same. Text inside those surfaces snaps. On /login the card h1 contrast was 1.0 at frame 0, 1.73 at 15 ms, 2.96 at 31 ms and 4.78 at 48 ms, and the 'Send code' button hit 1.19. The frame strip shows the heading and placeholder white-on-white on a still-white card while the page is already dark. On /app, buttons and the stat numbers lag for about 100-200 ms (theme-app-frames.png). Fix correction: removing the html/body transition (the reviewer's first option) changes nothing visible. Only the second option works: suppress all transitions for one frame around the class swap in ThemeProvider.tsx:10-24 and :31-35. `where` should point at index.css:323-327 and :516-520, not only :156-158.

**Evidence files**

[theme.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/theme/theme.json), [theme-switch-150ms.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/theme/theme-switch-150ms.png), [theme-login-frames-25-107ms.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/theme-login-frames-25-107ms.png), [theme-app-frames.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/theme-app-frames.png), [theme-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/theme-measure.json), [theme-frames-login](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/theme-frames-login)


### mobile-visual-12: Flowchart is cramped on phones: 4 of 6 nodes clipped at 320 (minZoom 0.5), a 400 px canvas fills landscape screens and traps swipes, and the controls are 26 px

**Severity:** low · **Verdict:** confirmed · **Root cause:** `flowchart-desktop-canvas-defaults`

**Where**

- src/pages/FlowchartPage.tsx:749 (h-[50vh] min-h-[400px])
- src/pages/FlowchartPage.tsx:750-763 (ReactFlow fitView, default minZoom 0.5)
- src/pages/FlowchartPage.tsx:132 (Controls buttons 26x27)

**What the reviewer saw**

At 320x568 the zoom sits at 0.5, the default minimum, and 4 of 6 nodes extend past the canvas edges (fitView cannot fit them). In 568x320 landscape the canvas is 400 px tall while only 210 px is visible below the header, so one-finger drags pan the canvas and the page can only be scrolled by dragging the header. Control buttons measure 26x27 px.

**Why it happens**

Desktop canvas sizing and React Flow defaults.

**Suggested fix**

Set minZoom to about 0.2 and fitViewOptions padding. Size the canvas `h-[min(60dvh,520px)]`, with no 400 px minimum in landscape. Set panOnDrag={[1,2]} or preventScrolling={false} on touch so page scrolling still works, with a 'tap to interact' overlay. Make control buttons at least 40 px on touch. Hide the MiniMap below sm (see mobile-visual-4).

**Who it hits**

Phone users of Flowchart.

**Independent check**

At 320x568 (pro, 6 nodes) the viewport transform is matrix(0.5,...), which is the default minZoom. 4 of 6 nodes extend past the canvas edge, but only by about 4 px each (left -4, right 322 on a 318 px canvas): the outer node borders are cut, the content is not. All four control buttons are 26x27. At 568x320 the canvas is 400 px tall with 210 px visible below the 110 px header. ReactFlow is mounted with no panOnDrag or preventScrolling props (FlowchartPage.tsx:750-763), so dragging on the canvas pans it; swipe trapping is inferred from code, not driven. The dark screenshot shows something the reviewer did not list: the Controls render in React Flow's light theme on the dark canvas and overlap the Rebuttal node at 320. The 200x150 white MiniMap on a 318 px wide canvas belongs to mobile-visual-4 and is not re-rated here.

**Evidence files**

[misc.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/misc.json), [flowchart-canvas-568x320.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/flowchart-canvas-568x320.png), [flowchart-canvas-320x568.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/flowchart-canvas-320x568.png), [flowchart-canvas-small-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/flowchart-canvas-small-mobile-dark.png), [flowchart-landscape-small-mobile-light-568x320.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/flowchart-landscape-small-mobile-light-568x320.png), [pages-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/pages-measure.json)


### mobile-visual-13: Low-contrast hard-coded colours: Flowchart legend and nodes, Settings tier badge

**Severity:** low · **Verdict:** confirmed · **Root cause:** `hardcoded-palette-low-contrast`

**Where**

- src/pages/FlowchartPage.tsx:695-707 (legend text-emerald-600 / red-600 / blue-600 / amber-600, no dark: variants)
- src/pages/FlowchartPage.tsx:96-99 and :166-190 (white text on emerald-500 / amber-500 nodes; text-green-100 / yellow-100 strength badges)
- src/pages/SettingsPage.tsx:38-41 and :206 (text-white on bg-amber-500 Pro badge, bg-green-500 legacy badge)

**What the reviewer saw**

Calculated (contrast.txt). Dark legend on bg-muted/30 over card: blue-600 2.09:1, red-600 2.24:1, emerald-600 2.87:1, amber-600 3.39:1; light emerald-600 is 2.84:1. Node text: white on emerald-500 2.54:1, white on amber-500 2.15:1, and node descriptions (white/80 on emerald) 2.1:1. Settings 'Pro' badge, white on amber-500: 2.15:1. All are visible in the dark Flowchart and Settings screenshots.

**Why it happens**

Hard-coded Tailwind palette shades chosen for light backgrounds, with white text on mid-tone fills.

**Suggested fix**

Use 700/800 shades in light and 300/400 in dark for legend text (add dark: variants). Use dark text (slate-950) on emerald, amber and sky node fills, or darken the fills to 600/700. Use text-amber-950 on the amber badge.

**Who it hits**

Readability for all users, worst in dark mode and in sunlight on phones.

**Independent check**

Computed from live computed styles, compositing bg-muted/30 over the card. Dark legend: blue-600 2.09, red-600 2.23, emerald-600 2.86, amber-600 3.39. Light legend: emerald-600 2.83, amber-600 2.40, red-600 3.63, blue-600 3.89. Nodes in both themes: white on emerald-500 2.54; description at opacity-80 2.10; strength badges green-100, yellow-100 and red-100 on emerald 2.31, 2.36 and 2.08. White on red-500 is 3.76 and on blue-500 3.68. In light mode the Thesis node text (primary-foreground on primary) is 2.93. The Settings 'Pro' badge (bg-amber-500 text-white, SettingsPage.tsx:38-41 and :206) is 2.15 in both themes. No 'dropped' (amber) node is on pro's canvas, but white on amber-500 is the same 2.15. Line correction: the legend is at FlowchartPage.tsx:700-709, not 695-707.

**Evidence files**

[contrast.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/contrast.txt), [flowchart-dark-320-canvas-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/crops/flowchart-dark-320-canvas-crop.png), [app_settings-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-small-mobile-dark/app_settings-full.png), [contrast-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/contrast-measure.json), [flowchart-legend-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/flowchart-legend-dark.png), [flowchart-canvas-small-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/flowchart-canvas-small-mobile-dark.png), [settings-pro-badge-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/settings-pro-badge-dark.png)


### mobile-visual-15: Safe areas, browser chrome and PWA navigation are not phone-ready (code evidence, not browser-proven)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `web-safe-area-and-pwa-chrome-unset`

**Where**

- index.html:5 (viewport-fit=cover)
- src/index.css:161-166 (env(safe-area-inset-*) defined only under .capacitor-native, so all --native-safe-* are 0 on the web)
- src/components/OfflineIndicator.tsx:12 (fixed bottom-4, no safe-area); src/components/landing/Navbar.tsx:27 (fixed full-width nav)
- index.html:16 (theme-color fixed #0f172a, no media variants); public/manifest.webmanifest:7-9 (standalone, background_color and theme_color #0f172a); no `color-scheme` declared anywhere
- src/pages/TermsPage.tsx, PrivacyPage.tsx, LoginPage.tsx, SourcesPage.tsx (no link back to the app or home)

**What the reviewer saw**

Code evidence, not browser-proven (headless Chromium has no notch, Safari toolbar or standalone mode). With viewport-fit=cover, Safari on notched iPhones stops letterboxing in landscape and env(safe-area-inset-left/right) is about 47 px. On the web no element pads for it, so the header logo, px-4 content and the fixed landing nav sit under the sensor housing, and the fixed offline pill and footer can sit under the home indicator. theme-color is always dark navy, so the Android and iOS browser bar is dark on the light theme, and the PWA splash is dark for light users. Without `color-scheme: light dark`, native controls, autofill and scrollbars stay light in dark mode. The installed PWA is standalone (no back button on iOS), yet the in-app footer links to /terms and /privacy, and those pages, like /login and /expocit/sources, have no in-page way back (grep finds no Link or href).

**Why it happens**

Safe-area handling was built only for the Capacitor shell; the web build shares the cover viewport without the padding.

**Suggested fix**

Define the --native-safe-* variables from env() on :root for the web too (or drop viewport-fit=cover), and pad the fixed bottom elements with env(safe-area-inset-bottom). Add `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f5f9">` plus a dark variant, and update it from ThemeProvider. Set `color-scheme: light` and `.dark { color-scheme: dark }`. Add a small header or back link to Terms, Privacy, Login and Sources.

**Who it hits**

iPhone landscape users, PWA users and dark-mode users; cosmetic to blocking (dead ends in a standalone PWA).

**Independent check**

Confirmed by code only, by design: headless Chromium has no notch, Safari toolbar or standalone mode. index.html:5 sets viewport-fit=cover. --native-safe-* are defined only under .capacitor-native (index.css:161-166), and every use falls back to 0px (index.css:399-424), so the web build never pads for env(safe-area-inset-*). OfflineIndicator.tsx:12 is fixed bottom-4 with no safe-area padding. The landing Navbar.tsx:27 is fixed full width. There is one theme-color, #0f172a (index.html:16), and the manifest sets background and theme colour #0f172a with display standalone. color-scheme is declared nowhere (grep of src and index.html finds only matchMedia). TermsPage and PrivacyPage (25 lines each) and LoginPage have no Link or href back. SourcesPage's only href is the external source URL. RouteContent (App.tsx:185-199) adds no header. next-15 #15 covers manifest icons and the offline page, not theme-color, safe areas, color-scheme or back links, so this is not knownInPlan. Practical impact on iOS standalone (no back control) is plausible, but I could not prove it.

**Evidence files**

[terms-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/anon-small-mobile-dark/terms-viewport.png), [offline-indicator-320-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/misc/offline-indicator-320-dark.png)


### motion-polish-10: transition-colors cancels the lift easing (transform snaps in one frame) and stagger-enter pins History rows

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `tailwind-transition-overrides-motion-classes`

**Where**

- src/pages/LibraryPage.tsx:79 (transition-colors + motion-list-item)
- src/pages/HistoryPage.tsx:158 (transition-colors + motion-list-item inside .stagger-enter)
- src/components/layout/AppLayout.tsx:300-301 (motion-press + transition-colors footer links; code-derived)
- src/components/features/sparring/SparringSetup.tsx:129,160 (motion-press + transition-colors cards; code-derived)
- src/index.css:546-557 (.stagger-enter > * animation fill both)

**What the reviewer saw**

Library source row hovered: transition-property is 'color, background-color, border-color, text-decoration-color, fill, stroke', and transform goes from none to matrix(…,-1) within one frame (13ms), so it jumps with no easing. History row: computed animation 'stagger-item' fill both, and the transform stays matrix(1,0,0,1,0,0) while hovered, so the intended lift never shows. Footer links and SparringSetup cards have the same class pairing (not measured; the footer sample was off-screen).

**Why it happens**

Tailwind transition-* utilities come later in the cascade and replace the motion classes' transition-property, so transform is no longer transitioned. A fill-both entrance animation overrides any later transform.

**Suggested fix**

Where a motion-* class is present, drop transition-colors (motion classes already transition colours), or use transition-[color,background-color,border-color,transform]. Give stagger-item fill-mode backwards instead of both.

**Who it hits**

A 1px jump instead of a glide on Library and History rows, footer links and Sparring setup cards.

**Independent check**

Library source row: transition-property is 'color, background-color, border-color, text-decoration-color, fill, stroke' (transition-colors wins over .motion-list-item). Sampled per frame on hover, transform goes from none at 36ms straight to matrix(…,-1) at 57ms with no in-between values. History case row: animation stagger-item with fill both, and transform stays matrix(1,0,0,1,0,0) while :hover is true, so the lift never appears. Footer and SparringSetup were not measured (code only).

**Evidence files**

[t8-misc-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t8-misc-light.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json)


### motion-polish-15: Generate button shimmer animates forever; under reduced motion a static white gradient snaps over it on hover

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `generate-button-infinite-shimmer`

**Where**

- src/components/features/generate/GenerateForm.tsx:286 (span … -translate-x-full group-hover:translate-x-0 animate-[shimmer_3s_infinite])

**What the reviewer saw**

In every trackMovement sample on /app/generate, the span moves 274-775px with no interaction (an infinite 3s loop). With reducedMotion 'reduce' the animation is none, so group-hover:translate-x-0 snaps the white/10 gradient 390px across the button on hover.

**Why it happens**

An infinite decorative animation sits on an idle control, and its fallback hover transform is unguarded.

**Suggested fix**

Remove the shimmer span, or play one iteration on hover and add motion-reduce:hidden.

**Who it hits**

Constant compositing on the Generate page and a distracting glint, plus a hover artifact for reduced-motion users.

**Independent check**

The span with `animate-[shimmer_3s_infinite]` on /app/generate computes animation shimmer, 3s, infinite, and is mid-translate while idle. Not re-verified: the reduced-motion hover snap. It follows from the code, since the blanket reset sets animation none and leaves `group-hover:translate-x-0` unguarded.

**Evidence files**

[t7-reduced-motion.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t7-reduced-motion.json), [sweep-tools1-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/sweep-tools1-desktop-light.json), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json)


### motion-polish-17: Review sheet takes 500ms to slide in (dialogs and popovers take 150ms)

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `sheet-default-500ms-duration`

**Where**

- src/components/ui/sheet.tsx:33 (data-[state=open]:duration-500, closed 300)

**What the reviewer saw**

Computed animation on the open Review sheet: name 'enter', duration 0.5s. The filmstrip shows it still sliding at 270ms. The Dialog, Popover and Select open in 0.15s.

**Why it happens**

shadcn's default sheet timings were never tuned.

**Suggested fix**

Use data-[state=open]:duration-200 or 250 and data-[state=closed]:duration-150.

**Who it hits**

Every Review sheet open on tool pages feels sluggish compared with the rest of the UI.

**Independent check**

The open Review sheet on /app/generate computes animation 'enter' at 0.5s, from sheet.tsx data-[state=open]:duration-500 (closed 300). Dialog and popover timings were not re-measured. Their code uses duration-200 in dialog.tsx.

**Evidence files**

[t4-overlays-light-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/t4-overlays-light-desktop.json), [filmstrip-sheet-open-close-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/motion-polish/filmstrip-sheet-open-close-light.png), [s2-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-1/s2-desktop.json)


### motion-polish-19: framer-motion's MotionConfig is imported eagerly in App.tsx, so framer-motion ships in the entry chunk for every route

**Severity:** nit (reviewer said low) · **Verdict:** partly · **Root cause:** `motionconfig-in-app-shell`

**Where**

- src/App.tsx:7,276 (import { MotionConfig } from 'framer-motion'; <MotionConfig reducedMotion='user'>)
- staging entry /assets/index-B7gkXSCc.js (1,204,196 bytes uncompressed)

**What the reviewer saw**

The staging entry chunk contains framer-motion's MotionConfig context code (createContext({transformPagePoint…, isStatic:!1, reducedMotion:'never'}), the motion-prop set 'animate','exit','variants'…, and the getVelocity MotionValue check), and wraps the app in it with reducedMotion:'user'. framer-motion is otherwise used only by landing sections and CrossfirePage (motion), plus useReducedMotion in GeneratePage and AskChat. I didn't measure how many bytes it adds (the speed agent's lane).

**Why it happens**

A provider from an animation library sits in the app shell.

**Suggested fix**

Remove MotionConfig from App.tsx (the CSS reduced-motion block plus useReducedMotion already cover the user preference), or move it inside LandingPage and CrossfirePage so framer-motion stays in those lazy chunks.

**Who it hits**

Extra JavaScript to parse on every first load, including signed-in tool pages that never use framer-motion.

**Independent check**

MotionConfig is in the entry chunk: staging index-B7gkXSCc.js contains 'transformPagePoint' and reducedMotion:'user'. The impact claim is overstated. A scratch build with sourcemaps (vite build --outDir scratch), plus the repo's bundle-graph plugin, shows only 7 tiny framer-motion and motion-dom modules in the entry (MotionConfig, MotionConfigContext, use-constant, filter-props, valid-prop, resolve-transition, is-motion-value). They total about 1,591 bytes of the 1,193,129-byte entry. The rest of framer-motion stays in lazy chunks. Removing or moving it is a trivial cleanup, not a load-time win.


### mobile-visual-16: Small phone polish: model picker label wraps ('Claude Sonnet / 5'), Timer shows keyboard shortcuts on touch, landscape login card is flush with the screen edges

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `phone-polish-fixed-widths-desktop-hints`

**Where**

- src/components/features/ask/AskChat.tsx:636 (ModelSelector className="w-44")
- src/pages/TimerPage.tsx:248 onward (Space / R / Arrows hints rendered on every device)
- src/pages/LoginPage.tsx:150 (min-h-screen flex items-center, px-4 only, no vertical padding)

**What the reviewer saw**

The Ask model select shows 'Claude Sonnet' on one line and '5' on a second inside a fixed 176 px trigger on every device, including iPad landscape. The Timer card on phones lists 'Space to start/stop, R to reset, Arrows to change speaker', which do nothing on touch. At 568x320 and 915x412 the login card's top and bottom borders touch the screen edges.

**Why it happens**

Fixed widths and desktop-only hints.

**Suggested fix**

Use `min-w-44 w-auto` or truncate the model label. Hide the shortcut hints under `@media (hover: none)` (or `hidden [@media(hover:hover)]:block`). Add `py-6` to the login wrapper.

**Who it hits**

Small but visible on every phone.

**Independent check**

Ask: the model trigger is 176x40 (ModelSelector className w-44, AskChat.tsx:636), and the screenshot shows 'Claude Sonnet' on one line and '5' on the next. SelectTrigger's `[&>span]:line-clamp-1` (select.tsx:19-21) does not clamp it, because the rendered item contains nested flex spans that wrap. Timer: with (hover: none) and (pointer: coarse) both true on the phone emulation, all three hints ('Space to start/stop', 'R to reset', 'Arrows to change speaker', TimerPage.tsx:378-382) render with no media gating. Login: at 568x320 and 915x412 the card runs from y=0 to 486 and the document is 486 px tall, so the card borders touch the top and bottom edges (LoginPage.tsx:150 has px-4 and no vertical padding). Screenshot taken with the staging banner hidden, matching production.

**Evidence files**

[app_ask-viewport.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-tablet-land1080x810-dark/app_ask-viewport.png), [app_timer-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/pro-mobile-dark/app_timer-full.png), [login-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/mobile-visual/sweep/anon-small-mobile-land568x320-dark/login-full.png), [ask-model-trigger-small-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/ask-model-trigger-small-mobile-dark.png), [login-568x320-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/raw/login-568x320-full.png), [pages-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/pages-measure.json), [misc-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-visual-2/misc-measure.json)

