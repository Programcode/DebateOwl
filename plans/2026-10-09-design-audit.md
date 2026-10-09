# Design audit: Apple design and Emil Kowalski standards

**Status:** In progress. Audit of `main` at `56a94d7` on 2026-10-09, shipping as the four-PR stack in [Suggested order of work](#suggested-order-of-work). Rows marked ✅ are done, with the PR that did them; rows marked ➖ were changed or skipped, with the reason in the row.

## What this is

A full UI audit of DebateLab against Emil Kowalski's design-engineering skills (`apple-design`, `emil-design-eng` and `review-animations` from [emilkowalski/skills](https://github.com/emilkowalski/skills) at `e8a175d`). `apple-design` is Apple's WWDC guidance on fluid interfaces, materials, typography and the eight design principles, translated for the web. The other two supply the motion rules and values: easing curves, duration budgets, press feedback, transform origins and interruptibility.

Four Opus reviewers read every page, every component in `components/ui/` and elsewhere, and the whole of `src/index.css`. Then the real app ran locally (`verify-debatelab`, fake provider). A Playwright sweep covered 20 routes on desktop (1440×900) and iPhone 13, in light and dark. A probe opened every overlay type and read real durations, easings and transform origins from `document.getAnimations()`. Further checks covered reduced motion, `prefers-contrast: more`, and Hungarian at 375px. Evidence is in `.verify/artifacts/audit-20261009T052123-design/` (gitignored): 118 screenshots, `metrics.json`, `probe.json`, and five screen recordings.

Verdict under `review-animations`: **Block.** Two of the feel-breaking issues are system-wide bugs, not taste: toasts can't stack or leave, and secondary text has no colour hierarchy. Both are cheap to fix.

## The short version

The product structure is sound. The motion tokens are good (`--motion-ease-fluid` is a strong ease-out), `MotionConfig reducedMotion="user"` wraps the app, routes prefetch on intent, and the voice, Sparring and Crossfire work is careful. The weak spots are five systemic problems:

1. **A global CSS layer overrides the shared UI components.** About 600 unlayered lines in `src/index.css` (roughly 491–847) target ARIA roles, Radix `data-state` attributes and Lucide icon class names. They override Sonner, Select, Progress, Tabs, Switch, focus rings and Tailwind's own `.tabular-nums`. Most of the motion bugs below come from this layer. Deleting most of it and moving what's worth keeping into each component's `cva` classes fixes the largest share of findings for the least work.
2. **The colour tokens are miswired.** `--muted-foreground` equals `--foreground` in both themes, so 379 uses of `text-muted-foreground` render at full body contrast. Light `--muted` is a mid grey, `--accent` (the ghost-button hover) is 1.05:1 against the page, the light popover is darker than the page, dark shadows are invisible, and the light primary button label is 3.85:1.
3. **Nothing is built for touch.** Hover motion isn't gated, there's no tap-highlight reset, nothing reads the safe-area insets despite `viewport-fit=cover`, and most controls on every mobile page are under 44px.
4. **Wayfinding and agency.** On all eight tool routes, nothing in the header shows as active. There are five different delete patterns and no undo anywhere, even though the toast adapter supports an action button. Streaming tools can't be stopped.
5. **Too much decoration.** The landing page loops an aurora, orbs, a drifting grid and CTA shimmer forever across five sections. The app replays staggers on tab switches, animates the nav underline from `scale(0)` on every navigation, and stacks five looping indicators on the AI loading panel.

## Confirmed in the browser

These rows were observed in the running app, not only inferred from code.

| Finding | What the browser showed |
| --- | --- |
| Toasts can't stack, expand or exit | With two toasts open, both sat at the same position (top 823 and 825px) with an identity transform. Hovering didn't expand them, and only the newest was visible. 150ms after `toast.dismiss()` both were marked removed but still fully opaque and unmoved. Cause: `[data-sonner-toast]{animation: toast-slide-in .3s … both !important}` at `src/index.css:622-624` holds the transform Sonner uses for stacking, swipe and exit. Screenshots: `probe-toast-stacked.png`, `probe-toast-expanded.png`, `probe-toast-exit-150ms.png`. |
| Landing card hovers never render | `.feature-card`, `.tilt-card` and every `hover:-translate-y-1` card keep an inline `transform: none` from framer's `whileInView` after the reveal, so hovering changes nothing. |
| Select closes with `ease-in` | Measured: the Select exit is 150ms `ease-in`, leaked from `src/index.css:709-711`. |
| Popovers scale from their centre | Measured: Select content origin is `94.5px 37px` and the debate menu popover is `176px 151px`, the centres of their boxes, not the trigger. |
| `duration-200` on Dialog is dead | Measured: the dialog enters in 150ms and exits in 150ms with `ease`, so enter and exit are symmetric. |
| Press feedback is too faint | Measured: hover lifts 1px, and `:active` scales to 0.985 over 160ms in both directions. |
| Timer ring eases every second | Measured: `clip-path 1000ms cubic-bezier(0.4,0,0.2,1)` per tick, so the ring surges and stops each second. Digits are Space Mono at 72px with −3.6px tracking. |
| Mobile menu is slow and has no scrim | Measured: a 420ms `motion-reveal` on a plain `<nav>`, not a dialog. The page stays visible and interactive underneath (`probe-m-menu-settled.png`). |
| Select items slide in on every open | Measured: opening a Select fires `menu-item-in 150ms` on every option, from `index.css:724-738`. |
| The Generate CTA shimmers at rest | Measured: one infinite `shimmer 3000ms` runs on the Generate page with nobody touching it. |
| Sending in Ask animates the user's own bubble | Measured: pressing Enter fires `message-enter 300ms` on the user's bubble and `streaming-glow-pulse 1500ms` on the reply. |
| Reduced motion removes everything | With `reducedMotion: 'reduce'`, opening a dialog or Select produced no animations at all, not even an opacity fade. Spinners freeze. |
| `prefers-contrast: more` is ignored | The landing nav keeps `rgba(241,245,249,.9)` and `blur(24px)`. |
| Onboarding tour covers the form on mobile | On Generate at 390px the tour popover covers the Motion field and points at nothing (first sweep, before the tour was dismissed). |
| Two `<h1>` on every app page | The header brand (`AppLayout.tsx:185`) is an `<h1>`, and on Home the page `<h1>` also says "DebateLab". |
| Language is a modal | The globe opens a full Dialog with two Selects, so changing language takes four taps (`probe-d-language.png`). |
| Layout holds | No horizontal overflow on any of the 80 page states, no console errors, and no overflow in Hungarian at 375px. |

## Fix first

These are ordered by impact per line changed.

1. ✅ PR1. Delete the global toast rule at `src/index.css:622-635`. Sonner's own 400ms transitions take over again.
2. ✅ PR1. Fix the tokens: light `--muted-foreground: 215 16% 40%`, dark `215 20% 70%`. Light `--primary: 200 98% 33%`, light `--popover: 0 0% 100%`, light `--accent: 214 32% 89%`, dark `--accent: 217 32% 20%`.
3. ✅ PR1 (nav-active-pill goes with the nav in PR2). Delete the global micro-interaction layer: tooltip in/out, menu-item-in, the tab underline, nav-active-pill, the icon-name hijacks, `.border-dashed:hover` marching ants, `.tabular-nums` transition, the progressbar width transition, switch-bounce, check-draw, the slider pulse, and the input `!important` focus. Then give each overlay component in `components/ui/` one explicit curve. Line numbers are in the foundations table.
4. ✅ PR1. Gate hover: `future: { hoverOnlyWhenSupported: true }` in `tailwind.config.ts`, and wrap the hover rules in `src/index.css` in `@media (hover:hover) and (pointer:fine)`.
5. ✅ PR1. Replace the blanket reduced-motion kill (`src/index.css:1071-1098`) with one that keeps opacity and colour transitions and turns spinners into an opacity pulse.
6. ✅ PR1. Add `origin-[--radix-…-content-transform-origin]` to Popover, Select and Tooltip, and set exits shorter than enters.
7. Wayfinding: make "Current debate" a link that is active on `/app/debate` and every tool route. Rename "Home". Make the brand a `<span>`.
8. One delete rule: reversible deletes act at once and show an Undo toast; irreversible bulk deletes use an AlertDialog with a destructive-styled confirm.
9. Ask: scroll only when the user is at the bottom, keep the input editable while streaming, add Stop. Give the four form tools a Cancel.
10. Landing: remove the infinite loops and shimmer, split the framer reveal from the hover onto separate elements, and switch the `x`/`y` shorthands to full `transform` strings.

## Findings

Rows follow Emil Kowalski's required Before / After / Why format. The tiers follow `review-animations`, highest impact first: feel-breaking, missed simplifications, performance, interruptibility and timing, origin and cohesion, accessibility. A seventh group covers Apple's foundations (feedback, wayfinding, agency, typography, materials). Paths are under `src/` unless stated.

### 1. Feel-breaking

| Where | Before | After | Why |
| --- | --- | --- | --- |
| ✅ PR1 · `index.css:622-635` | Global `[data-sonner-toast]` keyframe with `both !important` | Delete it | Confirmed above. Stacking, expand, swipe and exit are broken for all 157 `toast()` calls. |
| ✅ PR1 · `index.css:30`, `:99` | `--muted-foreground` equals `--foreground` | Light `215 16% 40%` (5.55:1 on the page), dark `215 20% 70%` | Secondary text has no lower tier, so hierarchy comes from size alone. |
| ✅ PR1 · `index.css:709-711` | `[data-state="closed"][data-side]{animation: tooltip-out .1s ease-in both}` | Delete it; set exits per primitive | `ease-in` leaks into every Select, Popover and Tooltip close (measured). |
| ✅ PR1 · `index.css:638-651`, `dialog.tsx:42`, `alert-dialog.tsx:37`, `popover.tsx:20`, `select.tsx:69`, `sheet.tsx:33` | Curves depend on cascade accidents. AlertDialog and Select get `ease`, Dialog closes with `ease`, and `duration-200` is dead | Add `transitionTimingFunction: { 'out-strong': 'cubic-bezier(0.23,1,0.32,1)', drawer: 'cubic-bezier(0.32,0.72,0,1)' }` to the Tailwind config. Per primitive: `data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-out-strong` | Five primitives use four curves today. Exit should be faster than enter. |
| ✅ PR1 · `index.css:149`, `:281-289` (`.motion-press` on every Button) | Ungated hover `translateY(-1px)` plus a shadow; `:active` scale 0.985 over 160ms both ways | Hover inside `@media (hover:hover) and (pointer:fine)`, no lift on ghost and link buttons; `--motion-press-scale: 0.97`, 100ms on press, 160ms on release | Sticky lift after a tap on touch. 0.985 barely registers (the rubric range is 0.95–0.98). |
| ✅ PR1 · `index.css:846-849` | Unlayered `.tabular-nums { transition: transform .2s }` | Delete it; Tailwind already ships `.tabular-nums` | It resets `transition-property` on 19 elements. The Timer's red warning snaps instead of easing. |
| ✅ PR1 · `index.css:451-489` | `.border-dashed:hover` marching-ants infinite animation | Delete it; use an explicit `.dropzone[data-drag-over]` class if a drop zone needs it | It takes over a utility name, so every dashed border (22 uses, including non-interactive empty states) animates and changes shape on hover. |
| ✅ PR1 · `index.css:604-607` | `[role=progressbar] > div { transition: width .5s }` | Delete it; `progress.tsx:16` `transition-transform duration-300 ease-out-strong`; clocks `transform 1000ms linear` | Radix moves the bar with `transform`, so every progress bar jumps (Timer, Sparring, Attack, Factoids). |
| `AppLayout.tsx:196`, `:209`, `index.css:569-595` | Active nav underline animates `scaleX(0)→1` with a glow on every navigation, on top of `bg-primary/10` | Static `bg-primary/10 text-primary` only | Starts from scale 0, fires tens of times a day including from the keyboard, and doubles the active signal. |
| `AppLayout.tsx:249-250` | Mobile menu `motion-reveal` 420ms, rising upward while it drops down below the header, no exit | No animation, or opacity plus `translateY(-4px)` at 180ms with a matching exit | Over budget, wrong direction, asymmetric path (Apple §7). |
| `AskChat.tsx:380-382`, `AskPage.tsx:334-343` | `scrollIntoView({behavior:'smooth'})` on every 30ms stream flush; it also scrolls the window | Track `atBottom` (within 80px); scroll instantly only then; otherwise show a "Jump to latest" pill | It pulls the user down when they scroll up to read (Apple §3: never lock out input). |
| `AskPage.tsx:176`, `session-store.ts:944` | The streaming bubble is keyed by request id; the stored message gets a new id, so it remounts and `message-enter` replays | Reuse the streaming id for the stored message | The answer jumps and fades in again as the user reads it. |
| `AskChat.tsx:88`, `index.css:654-667` | 300ms `message-enter` keyframe on every bubble, including the user's own message sent with Enter | No entry animation on user bubbles; assistant bubbles get opacity plus `translateY(4px)` at 150ms | Keyboard-initiated and frequent. |
| `TimerPage.tsx:330` | Ring `transition-all duration-1000` with the default ease | `transition-[clip-path] duration-1000 ease-linear` | Constant motion is linear (measured surge-and-stop). |
| `HistoryPage.tsx:156`, `tabs.tsx:45` | Each tab switch replays a slide-in plus a 350ms `stagger-enter` plus the empty state's blur swap | 150ms fade on the tab content only; no stagger | Tens of times a day, and Radix tabs switch on arrow keys. |
| `HomePage.tsx:61`, `CurrentDebatePage.tsx:198`, `AppLayout.tsx:44`, `:259`, `:300-301`, `CurrentDebateMenu.tsx:27` | `.motion-press` button lift on list rows, nav links and footer text links | `hover:bg-accent` only on rows and links | Hairline rows lift and cast shadows like cards. |
| `landing/WhatsNew.tsx:41-47`, `Pricing.tsx:48-53`, `:81-86`, `Features.tsx:56-62`, `UseCases.tsx:49-55` | Framer `whileInView` `y` on the same node as `hover:-translate-y-1` and `transition-all duration-300/500` | Reveal on an outer `motion.div`, hover on an inner div; drop the lift and tilt; transition only `box-shadow` and `border-color` | Confirmed above: the hovers never render, and `transition-all` drags out framer's own reveal. |
| `index.css:174-201` (`Hero.tsx:74`, `:81`, `Navbar.tsx:57`, `:98`, `Pricing.tsx:75`, `:113`) | `.btn-primary-gradient` and `.btn-secondary-outline` have no `:active`; they are Links, so `.motion-press` never applies | `:active { transform: scale(0.97) }` with `transition: transform 160ms var(--motion-ease-fluid)` | The main conversion buttons give no feedback on press. |
| `landing/Footer.tsx:11`, `:24`, `:27` | `<a href>` | `<Link to>` | Every footer click reloads the whole SPA through the startup shell. |

### 2. Missed simplifications

| Where | Before | After | Why |
| --- | --- | --- | --- |
| `index.css:203-254`; `Hero.tsx:26-29`, `Features.tsx:37-38`, `Pricing.tsx:29`, `FinalCTA.tsx:14-17` | Infinite aurora (14s), orbs (8s and 10s), full-bleed grid drift (20s) on five sections | Static backgrounds | Apple §14 flags full-viewport moving backgrounds and slow oscillations (0.07–0.125 Hz). |
| `index.css:207-213`; `Navbar.tsx:57`, `:98`, `Hero.tsx:74`, `Pricing.tsx:113`, `FinalCTA.tsx:45`, `GenerateForm.tsx:286` | `shimmer 3s infinite` on CTAs, including the app's Generate button | Delete it, or run once on gated hover at 700ms | Perpetual decoration on the most-watched element. |
| `streaming-indicator.tsx:25-63`; wrappers at `AttackPage.tsx:139`, `BrainstormPage.tsx:127`, `GeneratePage.tsx:384`, `FactoidsPage.tsx:145` | Five simultaneous loops: wrapper shimmer, inner swap, ping ring, shimmer bar, and a fake progress bar that fills to 100% every 3s via a 50ms `setInterval` | One spinner (`spin 600ms linear infinite`) plus one honest status line | Decorative loops, a dishonest determinate bar, and 20 renders a second. |
| `loading-spinner.tsx:18-20` | Ping ring plus static ring plus a 1s spin | One ring at `spin 700ms linear` | A faster linear spin reads as a faster load. |
| ✅ PR1 · `index.css:724-738` | `[data-radix-collection-item]` menu-item-in keyframe | Delete it | Every SelectItem, TabsTrigger and AccordionTrigger slides 4px on every open. |
| ✅ PR1 · `index.css:760-779` | Second active-tab indicator: an `::after` underline from `scaleX(0)` | Delete it; the TabsTrigger pill already marks active | Two indicators, grows from zero, keyboard-triggered (also visible on Login). |
| ✅ PR1 · `index.css:782-827` | Icon-name hijacks: refresh spins and trash shakes on hover, copy and heart scale on `:active` | Delete them | Global Lucide class-name selectors; a shaking trash makes deletion look playful. |
| ✅ PR1 · `index.css:296-299`, `:510-520`, `section-card.tsx:33`, `badge.tsx:8` | Button icon `scale(1.04)` on hover; non-clickable SectionCards lift 2px; Badge `hover:scale-105 transition-all` | Delete all three | Lift implies clickability that isn't there (Apple Familiarity). |
| ✅ PR1 · `index.css:682-701`, `:829-842` | Switch squash-and-stretch keyframe; a `check-draw` that's a no-op (no dasharray); infinite slider pulse while dragging | Switch `transition-transform duration-200 ease-out-strong`; delete the rest | Replays on mount, not interruptible, noise under the finger. |
| `animated-section.tsx:14`, `:21`; used on Ask, Attack, Brainstorm, Generate, Factoids | `transition-all duration-300` fade-up on a timeout every time a tool opens | Delete it, or opacity only at 150ms with no delay | Tens of times a day. |
| `TimerPage.tsx:334` | `animate-pulse` on the digits in the last 30s | Static `text-destructive` | Pulses the number the speaker is watching. |
| `FlowchartPage.tsx:251-253`, `:305` | `animated: true` marching edges | Static edges; a dashed stroke for rebuttals | Constant motion on a work canvas. |
| `CrossfirePage.tsx:865-1021`, `SparringRound.tsx:192`, `:249-254` | The transcript remounts per phase and all turns replay; the AI wait shows a pulsing background plus bouncing dots plus text | Hoist the transcript and animate only the newest turn; one indicator | A wall of cards fades in on each phase. |
| `AppLayout.tsx:44`, `:218-219` | `nav-glow` radial hover on top of `hover:bg-accent`; theme toggle in the mobile header and again in Settings | Remove `nav-glow`; drop ThemeToggle from the mobile header | Doubled hover effects; a crowded sticky header. |
| `LibraryPage.tsx:495-506` vs `:777-790`; `:675-684` vs `:723-733`; `:583-596` | Two folder filters; two Folder selects in one form; three stat tiles repeating a badge count | One chip row; one Folder select; one meta line under the h1 | Duplicate controls bound to the same state. |
| `LibraryPage.tsx:248`, `:404-407`, `:435-438` and success toasts at `AttackPage.tsx:49`, `BrainstormPage.tsx:48`, `GeneratePage.tsx:97`, `FactoidsPage.tsx:47` | Toasts confirming things already visible | Drop them; keep toasts for off-screen or irreversible results | Over-feedback trains people to ignore feedback (Apple §13). |
| `ExportToolbar.tsx:15`, `:54`, `AutoSavedSourcesUndo.tsx` | `showUndo` is never passed by any caller | Delete both | Dead code with a misleading label. |
| `landing/WhatsNew.tsx:27-33`, `SocialProof.tsx:7-11` | Pill and h2 both say "What's New"; "2 Plans / 1 Unified Workspace" styled as metrics | Remove the pill; remove the section or use real facts | Repetition; pseudo social proof (Apple Responsibility). |

### 3. Performance

| Where | Before | After | Why |
| --- | --- | --- | --- |
| ✅ PR1 · `index.css:278` | `will-change: transform` on every `.motion-press` | Remove it | A compositor layer for every button in the app. |
| `index.css:1-3`, `:57` | Three render-blocking Google Fonts `@import`s, including Lora (0 uses) | Drop Lora and Space Mono, or self-host Inter variable with a metric-matched fallback; or use `system-ui` (Apple §15) | A chained blocking request and a visible font swap: the startup shell renders in `system-ui`. |
| `Hero.tsx:36-161`, `Navbar.tsx:24`, `DeepDive.tsx:20`, `:55`, every `whileInView y` | Framer `x`/`y`/`scale` shorthands at 0.5–0.8s, delays to 0.5s, during page load | `transform: "translateY(12px)"` strings, `duration: 0.35, ease: [0.23,1,0.32,1]`, hero delays 0–0.15s, `viewport: { once: true, margin: "0px 0px -15% 0px" }` | Shorthands run on the main thread and drop frames while loading; the CTA is held back about a second. |
| `Hero.tsx:167-178`, `WhatsNew.tsx:47`, `Pricing.tsx:53`, `:86`, `index.css:165`, `:220`, `:271` | Nested translucent blur layers over animated backgrounds; grid animates `background-position` | Solid cards; blur only on the nav; static grid | Never stack light translucent surfaces (Apple §12); full-section repaints every frame. |
| `AskPage.tsx:25-42`, `:334-340`, `AskChat.tsx:82`; `AttackPage.tsx:26`, `BrainstormPage.tsx:24`, `GeneratePage.tsx:35`, `FactoidsPage.tsx:24` | `useSessionStore()` with no selector; Ask remaps messages so `React.memo` never holds | `useShallow` selectors; pass messages through; a separate `StreamingBubble` | Every bubble re-parses Markdown on every 30ms flush. |
| `index.css:984-1001`, `:1052-1061`; `CrossfirePage.tsx:421-426` | Caret blink animates `box-shadow`; dead `max-height`/`padding` transition; `setNow` every 500ms re-renders the whole Crossfire page | Opacity-only caret with `steps(2)`; delete the dead rule; a `<CrossfireClock>` with its own interval | Repaints while streaming; full renders during a live round. |
| `SettingsPage.tsx:324-326`, `AppLayout.tsx:276-285` | A 160px pulsing block for every user while the admin check runs; the announcement banner pushes content down after a fetch | Render nothing while pending; overlay the banner or render it from cache | Layout shift for 100% of users. |

### 4. Interruptibility and timing

| Where | Before | After | Why |
| --- | --- | --- | --- |
| `AskChat.tsx:703`, `:706`; `CrossfirePage.tsx:968`; `AttackPage.tsx:36-62`, `BrainstormPage.tsx:37-61`, `GeneratePage.tsx:78-116`, `FactoidsPage.tsx:34-60` | The input is disabled while the AI works; no Stop; the form tools have no AbortController | Keep composers editable and disable only submit; a Stop button that aborts and returns focus; Cancel under the tool status | Apple §3: thought and gesture run in parallel. |
| `sheet.tsx:33`, `:37-42` | Open 500ms, close 300ms, bare `transition ease-in-out`; full-width right sheet on phones; no drag | Open 300ms, close 200ms, `ease-drawer`; on mobile a bottom sheet (Vaul) with velocity dismiss above about 0.11 px/ms and rubber-banding | Over budget; a sheet you can't grab doesn't feel physical (Apple §2–6, §9). |
| ✅ PR1 · `dialog.tsx:42`, `alert-dialog.tsx:37`, `popover.tsx:20`, `select.tsx:69`, `tooltip.tsx:20` | Symmetric 150ms keyframes, `zoom-out-95` on exit | Enter 200ms, exit 120ms fade only | A reopen during the close doesn't visibly jump; exit faster than enter. |
| ✅ PR1 · `index.css:741-743` | `[role=option]` background fades 100ms | Instant highlight; keep only the `:active` transform | Arrow-key list navigation shouldn't fade. |
| ✅ PR1 · `accordion.tsx:31` vs `tailwind.config.ts:77-78`; `index.css:355-370`, `AttackForm.tsx:121`, `GenerateForm.tsx:220` | Chevron 300ms against content 200ms; options expand 260ms plus translateY with a 300ms chevron | Everything at 200ms on one curve; chevron 150ms | Coordinated motions finish out of sync. |
| `TimerPage.tsx:183` | Resume uses whole seconds rounded up | Store the remaining milliseconds on pause | Each pause gives the speaker up to a second. |
| `FlowchartPage.tsx:442-444`, `:749-762`, `:343` | Auto layout clicks a fit-view button that doesn't exist; wheel zoom captures page scroll; new nodes at random positions | `rf.fitView({ duration: 250, padding: 0.2 })` with a temporary node transform transition; `zoomOnScroll={false} preventScrolling={false}`; place at the pane centre | Teleporting nodes; trapped scroll; things appearing from nowhere. |
| `AppLayout.tsx:155-173`; `SettingsPage.tsx:89-104`, `:143-150`; `DebateDialogs.tsx:53-70`; `LibraryPage.tsx:260-283` | Announcement dismiss waits for the server; no pending state on delete-all, switch or delete debate, sign out, or file import | Optimistic dismiss; per-action busy labels and disabled state; reset the file input | A tap with no visible response (Apple §1). |
| `OnboardingTour.tsx:105-111` | A fixed 500ms start delay | Start once the target exists (rAF or MutationObserver, 500ms cap) | An artificial delay. |
| ✅ PR1 · `index.css:1065-1068` | The transition is declared only inside `:hover`, so leaving snaps back | Transition on the base rule; gate the hover | An asymmetric snap. PR1 deleted the rule instead, with the other icon hijacks. |

### 5. Origin, physicality and cohesion

| Where | Before | After | Why |
| --- | --- | --- | --- |
| ✅ PR1 · `popover.tsx:20`, `select.tsx:69`, `tooltip.tsx:20` | `zoom-in-95` from the centre (measured) | `origin-[--radix-popover-content-transform-origin]`, and the same for Select and Tooltip | Trigger-anchored content scales from its trigger; modals stay centred. |
| `index.css:153`, `:271`, `AppLayout.tsx:178` | Sticky translucent header with a hard 1px border and a shadow | A scroll-edge fade, or a border only when `scrollY > 0` | Apple §12. |
| `index.css:491-847` overall | About 20 unlayered global selectors keyed on Radix internals | Move what's worth keeping into the primitives and delete the layer | They break silently on upgrades and override primitive classes. |
| ✅ PR1 · `index.css:156-159`, `ThemeProvider.tsx:8-23` | `html`/`body` ease over 420ms, components at 160 or 260ms, everything else snaps | `document.startViewTransition` with a 200ms crossfade, or suppress transitions for one frame | The theme change ripples at three speeds. |
| `AskChat.tsx:693`, `GenerateForm.tsx:142-154`, `VoiceMicControl.tsx:41`; `TimerPage.tsx:334`, `SparringRound.tsx:150`, `:157`, `CrossfirePage.tsx:924-926` | Three listening indicators and three countdown urgency treatments; the Timer goes calm again at 0:00 | One `<ListeningIndicator>` and one `<RoundClock>`: amber at 30s or less, destructive at 0:00 | Things that look the same should behave the same. |
| `TimerPage.tsx:334` | `font-mono` (Space Mono) with `tracking-tighter` on the digits | Inter with `tabular-nums` and `tracking-[-0.02em]` | The wide colon reads "4 : 00"; negative tracking on a monospace face fights its design. |
| `landing/*` section h2s; `Features.tsx:37` | Different sizes and tracking per section; the orb's `-translate-y-1/2` is overridden by its keyframe | One `.section-heading`; position the orb with `top` | Cohesion; the orb jumps under reduced motion. |
| Login (`LoginPage.tsx:157-161`), app header logo | The login card shows a generic sparkle tile; the app shows the tree-and-scales logo in a white tile in both themes | The real mark on Login; a dark-mode variant of the logo tile | Brand consistency across surfaces. |

### 6. Accessibility

| Where | Before | After | Why |
| --- | --- | --- | --- |
| ✅ PR1 · `index.css:1071-1098` | `* { animation: none !important; transition: none !important }` under reduced motion | Keep `opacity, color, background-color, border-color, box-shadow` transitions; drop transforms; spinners become a 1.2s opacity pulse (the `motion-fade-in` keyframe at `:923` is unused) | Gentler, not zero. Frozen spinners and carets look hung. |
| ✅ PR1 · `tailwind.config.ts:5-7`, `index.css` hover rules | No `hoverOnlyWhenSupported`; ungated `:hover` transforms | Turn on the flag; wrap the CSS hover rules | Sticky hover after taps. |
| ✅ PR1 · `index.css` (none) | No `prefers-reduced-transparency`, `prefers-contrast` or `forced-colors` handling for the eleven `backdrop-blur` surfaces | Solid `--card` background with no blur under reduced transparency or more contrast, plus a defined border | Apple §14 lists three signals; only one is handled (confirmed above). |
| ✅ PR1 · `index.css:131-133`, `index.html:5`, `index.css:377-403` | No `-webkit-tap-highlight-color`; `viewport-fit=cover` but `--native-safe-*` never set and nothing reads `env(safe-area-inset-*)` | `html { -webkit-tap-highlight-color: transparent }`; `--native-safe-top: env(safe-area-inset-top, 0px)` and so on; pad the bottom sheet, OfflineIndicator and Toaster | A grey flash over the press scale; UI under the home indicator in the PWA. |
| `button.tsx:22`, `:24`, `section-card.tsx:50`, `checkbox.tsx:14`, `dialog.tsx:48-49`, `sheet.tsx:63-64`, `LibraryPage.tsx:132`, `:769`, `DebateDialogs.tsx:96`, `FlowchartPage.tsx:169`, `:193`, landing `Navbar.tsx` toggle, `Hero.tsx:179-191` | `sm` 36px, `icon` 40px, 28–32px icon buttons (one a delete next to a Switch), a 16px dialog close, a 16px checkbox, 12px flowchart handles | `[@media(pointer:coarse)]:min-h-11 min-w-11` on the cva sizes; invisible hit-area pseudo-elements on Checkbox, the close button and handles | Seen on every mobile page: `sm` buttons are 36px tall and icon buttons 40px. |
| ✅ PR1 · `index.css:598-601`, `:502-507`; `dialog.tsx:48`, `sheet.tsx:63`, `select.tsx:20` | `!important` input focus is a 10%-alpha glow (about 1.1:1); global focus changes `border-radius`; some primitives use `focus:` not `focus-visible:` | One system: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px` on `:focus-visible` | Fails WCAG 2.4.11; three focus systems compete. PR1: the global outline is the default, and primitives that draw `focus-visible:ring-*` turn it off, so nothing gets two rings. |
| ✅ PR1 · `index.css:23-24`, `:35`, `:39`, `:104-108` | Light primary label 3.85:1; destructive labels 4.43:1 (light) and 3.43:1 (dark); `--input` borders 1.38:1 and 2.32:1 | `--primary: 200 98% 33%`; light `--destructive: 0 72% 47%`; dark `--destructive-foreground: 0 86% 10%`; light `--input: 215 16% 55%` | AA text and 3:1 for control boundaries. |
| `SettingsPage.tsx:37-42`, `:206`; `DeepDive.tsx:63`, `:78`; `LoginPage.tsx:268`, `:273` | White on amber or green-500 tier badges (about 2:1); near-white `text-accent` on a light card (about 2.5:1); hard-coded `text-green-600` (3.15:1) | Tinted badges (`bg-amber-500/15 text-amber-800 dark:text-amber-300`); `text-foreground`; a `--success` token | Contrast failures. |
| `LibraryPage.tsx:69-147`, `:627-638`, `:705-975` | A `role=button` row containing a link, a button and a switch; an invisible file input with no focus ring; labels without `htmlFor` | The title is the button; `has-[:focus-visible]:ring-2` on the label; matching `id`/`htmlFor` pairs | Nested interactive controls; invisible focus; detached labels. |
| `AskChat.tsx:102`, `FactoidsResults.tsx:59` | The bookmark and external-link icons appear only on hover | Always visible at 60% opacity, full on focus | Invisible on touch and to the keyboard. |
| `TimerPage.tsx:329`, `SparringRound.tsx:157`, `streaming-indicator.tsx:56` | `aria-live` on a clock that ticks every second; fake stage text announced every 3s | Announce 1:00, 0:30 and 0:00 only; `role="timer"`; announce only real status changes | Constant screen-reader chatter. |
| `LibraryPage.tsx:95-124`, `ModelSelector.tsx:76-86` (about 30 `text-[9-11px]` uses) | 9–11px text in px | `text-xs` (0.75rem) as the floor | Below a legible floor; doesn't scale with the user's font size. |
| `ThemeToggle.tsx:21`, `tooltip.tsx` (0 importers) | Icon-only header controls use `title`; the theme icon is a laptop in "system" mode | Wrap them in Tooltip, which gets an instant skip delay inside the provider | `title` doesn't show on touch or focus; the laptop icon is ambiguous. |

### 7. Foundations: feedback, wayfinding, agency, typography

| Where | Before | After | Why |
| --- | --- | --- | --- |
| `AppLayout.tsx:31-41`, `:185`, `:190-215`, `:199`; `HomePage.tsx:155` | Nav is Home, Current debate (a popover, never active), Library, History, Settings. Nothing is active on the eight tool routes. The brand is an `<h1>`; Home's `<h1>` is also "DebateLab" | "Current debate" becomes a link, active on `/app/debate` and every tool route, with the chevron as a separate trigger. Rename Home to "Tools". The brand becomes a `<span>`. Home's h1 describes the page | "Where am I?" is unanswered on most screens; specific labels beat generic ones (Apple §16). |
| `NotFound.tsx:11-13`, `SourcesPage.tsx:129-162`, `App.tsx:153-158`, `PrivacyPage.tsx`, `TermsPage.tsx`, `LoginPage.tsx:150-284` | The 404 reloads to the marketing page; Sources, Legal and Login have no way home; the route error offers only Reload | `<Link to={user ? '/app' : '/'}>`; a header or back link on public pages; "Go to Home" on the error | Never trap the user. |
| `LibraryPage.tsx:129-140` vs `:1025-1044`; `DebateDialogs.tsx:104-110`; `HistoryPage.tsx:352-379`; `SettingsPage.tsx:386-454`; `LibraryPage.tsx:421`; `FlowchartPage.tsx:382-390` vs `:784-804`; `AdminPage.tsx:997-1012` | Five confirmation models. A source row deletes instantly, while the same source in the sheet asks. Saved flowcharts delete instantly, while nodes ask. `window.confirm`. Admin Ban and Make admin are one click | Reversible deletes act at once with `toast({ action: { label: 'Undo' } })`; irreversible ones get an AlertDialog with `buttonVariants({ variant: 'destructive' })`; admin role changes use the existing `pendingAction` dialog | Apple §16 Agency: undo for slips, confirmations used sparingly and consistently. |
| `LibraryPage.tsx:218-233`, `:442-444`; `LoginPage.tsx:74-133`, `:277-281`, `:57-143` | Required-field errors arrive as toasts after submit; login errors appear below the tabs, not tied to the field; raw backend `error.message` in English | Inline `role="alert"` under the field with `aria-describedby` and focus moved to it (as `DebateForm.tsx:115-118` already does); map Supabase error codes to i18n | Validate inline; localized errors. |
| `GenerateResults.tsx:55-57`, Attack, Brainstorm, Ask without citations | No AI caveat anywhere; Generate evidence reads as fact unless `needsSource` is set | One line under every result header: "AI-generated. Check facts and sources before using them in a round."; label evidence "Unverified" unless a researched source backs it | Apple §16.3 Responsibility. |
| `AskChat.tsx:64-70`, `:384-394`, `:118`; `streaming-indicator.tsx` | Timed status copy cycles ("Almost there…" back to "Thinking…"); "Typing" shows while web research runs | Real phases ("Searching the web…", "Writing"); otherwise "Working…" plus elapsed time after 5s | Status should be true. |
| Error handling in Attack, Brainstorm, Factoids and Generate; `error-display.ts:31`, `:41`; `SparringPage.tsx:26-29`, `:297-307`; `AskPage.tsx:155`, `:280`; `AskChat.tsx:405-407` | Toast-only errors with no Retry; hard-coded English; Retry duplicates the user's bubble; oversized input is cleared before it's rejected | An inline error panel with Retry, like `CrossfirePage.tsx:943-958`; i18n; retry without re-adding the message; clear only on accept | Recoverable feedback; forgiveness. |
| `AttackPage.tsx:67-92`, `GeneratePage.tsx:195-214`, `FactoidsPage.tsx:91-108`; `markdown.tsx:7-13` | "Discuss" prompts are indented template literals that render as a code block, and send non-streaming; `className="inline"` lands on a block wrapper; no link renderer | Build prompts with `join('\n')` through i18n and the streaming path; an `inline` prop mapping `p` to `span`; links with `target="_blank" rel="noopener noreferrer"` and `overflow-wrap:anywhere` | Broken rendering of the user's own message and of label/value rows. |
| Page headers: `HomePage.tsx:154`, `CurrentDebatePage.tsx:112`, `SettingsPage.tsx:182`, `LibraryPage.tsx:474`, `HistoryPage.tsx:118`, `AskPage.tsx:350`, `SparringSetup.tsx:78`, `FlowchartPage.tsx:479-491`; card titles `card.tsx:19`, `dialog.tsx:74` | Eight header patterns; h1 weight and tracking vary; Flowchart has no h1; card titles `text-xl`, `text-lg` or `text-2xl` with `tracking-tight leading-none` | One `PageHeader`: h1 `text-3xl font-bold tracking-tight leading-tight`, optional eyebrow, meta line and actions slot. Card titles `text-lg font-semibold` with size-specific tracking (24px −0.019em, 18px −0.014em, 16px −0.011em) and `leading-tight` | Apple §15: tracking depends on size; Familiarity. |
| Results in Attack, Brainstorm, Generate and Factoids; `HomePage.tsx:53-73` vs `CurrentDebatePage.tsx:194-204` | The export toolbar sits in a different place per tool; copy exists only in Generate; only Generate scrolls to results; the tool list is built twice with different labels | One `<ResultHeader>` (meta row, actions row, sources disclosure); `useRevealResults()` on mobile; one shared `ToolLink` | The same tool family should share a layout. |
| `GeneratePage.tsx` (screenshot) | "No current debate" appears twice (page banner and form notice); h1 "Generate", card title "Generate Debate Case" and button "Generate Debate Case"; an emoji 🎯 as the empty-state art next to Lucide icons elsewhere | One debate notice; drop the card title; use the `EmptyState` Lucide component everywhere | Redundant copy; mixed iconography. |
| `AskChat.tsx:517`, `:582-637`; `CrossfirePage.tsx:915-932`, `:679`, `:693`; `SparringRound.tsx:203-295`; `TimerPage.tsx:87`, `:203`, `:258-261`, `:378-382` | Chat height `100vh`; four switches above the input; the live Crossfire header never shows the resolution; the opponent's latest speech sits below a 240px composer; no wake lock; R and Escape reset the timer with no undo; keyboard hints shown on touch | `100dvh` and an Options popover; show the resolution; pin the last speech above the composer; `navigator.wakeLock` while running, with vibration and sound on the same frame at 0:00; reset only while paused or with Undo; hide kbd hints under `pointer:coarse` | Wayfinding, Apple §13 harmony, forgiveness. |
| `HistoryPage.tsx:136-379`, `LibraryPage.tsx:39`, `:880`, `CurrentDebatePage.tsx:69-206` | The tab resets after Back; fixed 500–600px inner scroll boxes trap scrolling on phones; lists are cut at 4 or 6 with no "View all"; three equal outline buttons and no primary action on the debate page | The tab in `useSearchParams`; `max-h` with page scroll on mobile; "View all (N)"; move the tools up and make them primary | "What's there?" and hierarchy. |
| `DebateDialogs.tsx:167-225`, `PricingModal.tsx:96`, `LimitReachedModal.tsx:39-47` | The 5-day idle gate blocks Escape on every route including Settings; "Current" is always on Free; the limit modal offers only Upgrade | Allow Escape to mean "Continue"; badge the real tier; add "Not now" | Never trap; true status; agency. |
| `SharedPage.tsx:75-148`, legal pages | Shared items render as raw JSON in a 600px scroll box; "Import to Account" is a dead end that also loses the item on sign-in; legal text at 14px and about 100 characters per line | Render with the result components at `max-w-[65ch] text-base leading-7`; remove Import until it exists; legal pages at `text-base leading-7 max-w-[65ch]` | Recipients get developer output; reading measure. |
| ✅ PR1 · `index.html:16`, `public/manifest.webmanifest:9` | `theme-color` fixed at `#0f172a` | Light and dark `theme-color` metas, updated by ThemeProvider | Browser chrome stays dark over the light UI. |
| `src/locales/es.json`, `hu.json`; `Hero.tsx:41-51` | English Title Case carried into Spanish and Hungarian; the hero h1 steps from `text-4xl` to `text-7xl` with one tracking value; a 132-character Spanish announcement in a `rounded-full` pill | Sentence case in es and hu; `text-[clamp(2.25rem,1.2rem+4.5vw,4.5rem)] leading-[1.05] tracking-[-0.03em]`; `rounded-2xl` or shorter copy | Reads as machine-translated; size-specific tracking. |

## Already done well

- Motion tokens: `--motion-ease-fluid: cubic-bezier(0.22,1,0.36,1)` and a 160ms fast duration (`index.css:145-149`). Overlays never start from `scale(0)`, and modals stay centred.
- `MotionConfig reducedMotion="user"` (`App.tsx:278`), plus `useReducedMotion` in Navbar, AskChat, Crossfire and Generate.
- No page-transition animation. Route skeletons are static, shaped like their pages, and announce with `role="status"` (`App.tsx:185-198`, `RouteSkeleton.tsx:208`).
- Routes prefetch on pointer enter, focus, pointerdown and touchstart (`NavLink.tsx`, `HomePage.tsx:55`, `AppLayout.tsx:73-75`).
- `theme-init.js` sets the theme before first paint, and the startup shell has dark-mode parity.
- Inputs use `text-base md:text-sm`, so iOS doesn't zoom on focus. The viewport meta removes the tap delay.
- `DebateForm` validates inline with a live counter. The inline debate delete states its consequence. `DebateContextControl` says exactly what the AI will receive before a request. `DebateMotionGate` asks at the moment of ambiguity with three explicit choices.
- Ask batches stream deltas every 30ms, aborts on scope change and keeps partial replies with a note. Citations carry verified and unverified badges, and weak sources are labelled background only.
- Crossfire and Sparring have inline errors with Retry, IME-safe Enter, character counters, a Cmd/Ctrl+Enter hint, offline-aware submit and honest "estimated" labels. Voice has a just-in-time privacy notice and a Stop for opponent audio.
- The Timer counts down against a deadline, not by counting ticks, and has 64px Start and Reset targets.
- Account deletion has a pending state, can't be closed mid-delete and confirms by typing the email.
- The layout holds: no horizontal overflow in any of the 80 page states or in Hungarian at 375px, and no console errors.

## Not verified

- Real touch gestures on a device. Drag, swipe and the sticky-hover findings come from code plus emulation.
- WebKit and Safari rendering, including `backdrop-filter` cost.
- Landing at 360px in Spanish and Hungarian (the hero demo toggle and the announcement pill are estimated from string lengths).
- Live-model streaming. The Ask scroll and caret issues come from code and the fake provider's short replies.
- Production or staging. Everything ran on the local stack.

## Suggested order of work

1. **Foundations PR.** Tokens, deleting the global CSS layer, overlay curves and origins, the reduced-motion rewrite, hover gating, tap highlight and safe areas. It touches `index.css`, `tailwind.config.ts` and `components/ui/*`, and clears about half the rows.
2. **Shell PR.** Navigation and active states, the brand `<span>`, the mobile menu as a Sheet with a scrim, a shared `PageHeader`, the delete and undo rule, and pending states.
3. **AI tools PR.** Stop and Cancel, the Ask scroll and remount fixes, one honest loading indicator, `ResultHeader`, inline errors with Retry, the AI caveat, Timer fixes.
4. **Landing PR.** Remove the loops, split reveal from hover, transform strings, a static nav, press states, font loading.

Each PR should run `verify-debatelab` recipes on desktop and mobile, plus a reduced-motion pass and screenshots in both themes.
