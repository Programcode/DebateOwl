# Speed: bundle, network and rendering: findings

**Status:** Review evidence from 2026-10-08/09, for [the ranked report](../2026-10-08-ultracode-review-report.md). Not started.

27 findings: 4 high, 12 medium, 9 low, 2 nit. An independent verifier re-checked every one.

Each entry has the final severity, where the problem lives, what the reviewer saw, why it happens, a suggested fix, the independent check and links to the screenshots and measurements in `.verify/ultracode-review-2026-10-08/`. Line numbers are against main at 40738ea.

Not covered by the perf-runtime reviewer:

- Real phones, Safari/iOS, Firefox, and real cellular networks. All mobile numbers are Chromium emulation
- Production itself (off limits). Sentry and PostHog costs are sized from a dummy-DSN build, not measured, because staging has no DSN/key
- AI streaming and AI request latency (AI-surfaces agent; budget 0)
- Heavy-user data volumes: the pro account has 3 debates and 3 sources, so payload and per-keystroke scaling is shown with a synthetic 15/60 KB paste and extrapolated from code (import-source allows 50,000 chars per source)
- A real deploy: the stale-chunk behaviour was reproduced by fulfilling the chunk with the exact response Vercel returns for a missing asset
- Cold full loads of /app/attack, /app/brainstorm, /app/factoids, /app/timer and /app/flowchart (only measured through in-app navigation). FlowchartPage has no h1, so it was skipped in nav timing
- Language switching cost and the es/hu first-render path; Lighthouse/PSI scores; HTTP/3; scroll and animation frame rate (motion/polish agents)
- Announcement banner CLS: no active announcement exists on staging and creating one is forbidden. Code shows the banner mounts in normal flow after a ~450 ms Edge Function call
- Exact attribution of tool-page mount cost on mobile: the profile puts ~240 ms in React (entry chunk) and most of the rest in native '(program)' time; no React Profiler run on the production build
- Write-path latency: the 27 store write sites gated on auth.getUser() were not timed, to avoid modifying seeded data

Not covered by the render-bundle reviewer:

- No real AI calls (0 of my 2-request budget). Streaming was driven through the store locally, which exercises the same render, scroll and persist path as a real stream but not network chunking.
- Production was off limits. That Jam loads in production comes from reading the code (no env gate in src/bootstrap.ts, and the CSP allows *.jam.dev), not from a measurement.
- Real low-end phones, WebKit and Firefox. CPU throttling in Chromium stood in for phones. The VPS was shared (load average 2.5 to 4.6), so I lead with structural counts and treat milliseconds as indicative.
- Rendering with large real datasets: the shared pro account holds few items, so list scaling (History, Library, Flowchart) is shown structurally, not measured with hundreds of rows.
- Keystroke measurements on History, Settings, Timer and Admin.
- Per-route CSS coverage beyond total size (18.4 KB gzip, Tailwind purged).
- Service worker caching and repeat-visit cache hit rates.
- Crossfire active-phase 500 ms tick renders (needs AI to reach that phase; read in code only).

### perf-runtime-1: Every route waits for one 1.2 MB entry chunk (368 KB br) that bundles all three locales and the whole signed-in app shell; on the mobile profile content appears at 3.5-5.1 s

**Severity:** high · **Verdict:** confirmed · **Root cause:** `oversized-entry-chunk`

**Where**

- src/i18n.ts:3-5 (en, es and hu JSON statically imported)
- src/App.tsx:8-9 (AppLayout and AuthProvider static imports, so every store loads on every route)
- src/lib/stores/sparring-store.ts:3 and src/lib/announcements.ts:2 (zod in the entry)
- src/native-runtime.ts:1-4, src/lib/native.ts:1-2 (Capacitor in the web entry)
- src/bootstrap.ts:9-13 (no early preload of the current route's chunk)
- vite.config.ts build (no chunk splitting; the entry has zero static imports)
- staging /assets/index-B7gkXSCc.js

**What the reviewer saw**

Staging entry /assets/index-B7gkXSCc.js: 1,196,246 bytes decoded, 367.7 KB brotli as served. It is the only render-critical script.

It contains all 50/50 sampled long Spanish and Hungarian strings. Locale JSON minified: en 90,075 B, es 99,430 B, hu 97,925 B (24/27/29 KB br); es and hu are about 197 KB decoded / 57 KB br that an English user never uses.

Other entry contents (source-map attribution of a local build of the same commit): react-dom 132 KB; @supabase/* 213 KB (auth-js 99, realtime-js + phoenix 57, unused outside the hidden Workspace; storage-js 22); zod v4 88.5 KB; stores 45 KB; sonner 34 KB; date-fns 21.5 KB; @radix-ui/react-select 18 KB; Capacitor ~9 KB; AppLayout, debate dialogs and DebateForm about 23 KB; supabase/functions/_shared/model-catalog and debate-context.

Mobile profile, cold, medians of 3, content = first visible h1:
- /app 3,696 ms
- /login 3,527 ms (its own chunk is 5 KB)
- / 5,114 ms (LCP 5,884)
- /app/library 3,744 ms, /app/sparring 4,167 ms
- single runs: /app/generate 4,494 ms, /app/ask 4,189 ms

Mobile waterfall for /app cold, run 2: document 0-218 ms; entry 248-2,328 ms (2.08 s of download); a 564 ms long task at 2,368 ms; first Supabase request at 3,101 ms; HomePage chunk requested only at 3,215 ms; content at 3,696 ms.

Warm mobile loads still spend 7 long tasks / 903 ms (median) at 4x and show content at 867 ms.

Unthrottled desktop cold: entry long task 127-138 ms, content 474 ms (/app), 472 ms (/login), 652 ms (/).

Because everything is in one chunk, any code change gives the entry a new hash, so returning users re-download all 368 KB after every deploy.

**Why it happens**

Static imports pull everything into one chunk:
- i18n bundles every language so that init is synchronous.
- App.tsx imports AppLayout and AuthProvider eagerly. AuthProvider imports all five stores, which pull zod, the _shared modules and the debate dialogs.
- main.tsx imports the Capacitor runtime unconditionally.
- Nothing tells the browser to fetch the current route's lazy chunk until React has rendered the Suspense boundary, after the whole entry has executed.

**Suggested fix**

1. src/i18n.ts: keep en bundled as the fallback. Load es/hu with import(`./locales/${lng}.json`) through i18next-resources-to-backend or addResourceBundle before first render. Read the persisted language from debate-trainer-settings in bootstrap.ts and await it only when it is not en; keep the existing startup shell up meanwhile.
2. App.tsx: lazy-load the protected shell (AppLayout, DebateDialogs, InactiveDebateGate) as one chunk, so / and /login skip it. Make the sparring row parsing and the announcement schemas lazy, or use a small hand validator, so zod leaves the entry.
3. bootstrap.ts: call preloadRoute(window.location.pathname) before mountApp() so the route chunk downloads while the entry executes.
4. native-runtime.ts / native-app-url-listener.ts: import('@capacitor/...') only when isNativeApp().
5. vite.config.ts: add output.manualChunks for react/react-dom/react-router and @supabase/*, so vendor code stays cached across deploys.

Target: entry under 150 KB br for /login and /, plus one locale.

**Who it hits**

Every visit by every user, worst on first visits and phones. Students on mid-range Android over 4G look at the 'Loading DebateLab' card for about 2.8 s before anything renders, and first-time visitors to the landing page wait more than 5 s. Every deploy forces returning users to re-download the whole entry.

**Independent check**

Reproduced on staging today. The entry /assets/index-B7gkXSCc.js is served as 376,071 B brotli (1,204,196 B decoded) and is the only render-critical script. 50 of 50 sampled long en, es and hu strings are in it. Source-map attribution of my own local build of 40738ea (1,201 KB min): i18next plus the inlined catalogs 324 KB, react-dom 129, @supabase/auth-js 99, zod 88.5, stores 45, realtime-js 32 + phoenix 25 + storage-js 22 + iceberg 5, sonner 34, date-fns 21.5, radix-select 18, @capacitor/core 8 plus plugin defs. Mobile cold runs at CPU 4x + fast4g, 3 each, load 2.8-4.2: on /app the entry downloads from 240-2,406 ms (about 2.08 s), the HomePage chunk is requested at 3,254-3,301 ms, the app h1 shows at 3,295-3,344 ms (median 3,298) and LCP is 3,572 ms median. On /login the entry downloads from 339-2,482 ms, LoginPage is requested at 3,109-3,196 ms and the h1 shows at median 3,498 ms. Desktop unthrottled /app shows its h1 at about 583 ms. Correction to fix #3: preloadRoute already exists (src/lib/route-modules.ts:49). Bootstrap's body only runs after the whole entry module graph has evaluated, so a JS preload saves little. Also, src/test/vercel-deployment-config.test.ts:105 deliberately forbids HTML modulepreload of page chunks. The real win is shrinking the entry. render-bundle-5 (locales) and render-bundle-6 (signed-in shell, zod, realtime, Capacitor) are sub-fixes of this finding and are marked duplicateOf it. I did not measure the '/ 5,114 ms' landing figure with network throttling.

**Evidence files**

[matrix-medians.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix-medians.json), [matrix.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix.jsonl), [m1-_app-pro-r1.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/m1-_app-pro-r1.json), [bundle-graph-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/bundle/bundle-graph-local-build.json), [source-map-explorer-entry.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/bundle/source-map-explorer-entry.json), [prof-_app-cold-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/prof-_app-cold-cpu4.json), [loads.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/loads.jsonl), [last-pro-mobile-_app-cpu4-fast4g.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-mobile-_app-cpu4-fast4g.json), [last-null-mobile-_login-cpu4-fast4g.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_login-cpu4-fast4g.json), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json), [source-map-explorer-local-entry.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/source-map-explorer-local-entry.json), [load.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/load.mjs)


### perf-runtime-2: Jam recorder loads for every visitor: 10 requests / 772 KB, about 1 s of main-thread work at 4x CPU, doubles the JS heap, wraps window.fetch, and keeps a request open forever

**Severity:** high · **Verdict:** confirmed · **Root cause:** `jam-recorder-unconditional`

**Where**

- src/bootstrap.ts:13 (scheduleJamRecorder() for every page, signed in or not)
- src/jam-loader.ts:1-4 and 55-73 (recorder.js + capture.js after load + idle, with no user, admin or flag gating)
- index.html:6 (jam:team meta)
- src/lib/jam-metadata.ts (publishes the user id to the recorder)

**What the reviewer saw**

Jam is scheduled after load + idle, so it does not delay first content. It costs the first seconds of interaction.

Desktop cold /app: Jam = 10 requests, 772 KB transferred. Chain: js.jam.dev/recorder.js 31 KB + capture.js 32 KB, then an iframe at recorder.jam.dev/capture that loads index-47191793.js (610 KB), a 76 KB CSS file, a Cloudflare RUM beacon and worker.js.

CPU profiles, mobile, 4x:
- Cold: Jam scripts ≈1,000 ms of main-thread time (recorder iframe JS 796 ms, capture.js 177 ms, beacon 28 ms), against 1,007 ms for the app's entry.
- Warm: Jam 468 ms of JS, and native '(program)' time 1,028 ms versus 581 ms without Jam.

A/B medians, 3 runs each:
- Mobile warm long tasks: 7 / 903 ms with Jam, 4 / 418 ms blocked. Mobile cold: 9 / 1,330 ms vs 5 / 961 ms.
- ScriptDuration, mobile warm: 828 vs 434 ms. Desktop warm: 212 vs 87 ms.
- JS heap, desktop warm: 33.1 vs 14.6 MB.
- After forced GC at 60 navigations: 21.0 vs 11.4 MB heap. JS event listeners grow by about 4 per round trip only with Jam (914 to 1,242); without Jam they stay at 338.

raw/idle.json: networkidle never settles with Jam (20 s timeout; recorder.jam.dev/worker.js still pending) and settles in 1.4 s with Jam blocked.

On warm loads the iframe document is revalidated (recorder.jam.dev/capture is max-age=0) and worker.js is re-requested.

The initiator of later Supabase calls is 'js.jam.dev/capture.js:window.fetch', so every API call goes through Jam's wrapper.

The console warning 'recorder.jam.dev/assets/main-567a071d.tsx was preloaded using link preload but not used' appears in 23 of 92 runs with Jam and 0 of 12 without.

**Why it happens**

The Jam bug-capture SDK is injected unconditionally after load for every visitor, including signed-out landing visitors. Its capture script buffers console and network by wrapping fetch, and its recorder runs a full app (610 KB) in an iframe with a long-lived worker. In headless Chromium the iframe's JS ran on the page's main thread; on real phones, process placement may differ.

**Suggested fix**

Load Jam on demand only:
- in src/jam-loader.ts, gate scheduleJamRecorder() on a signed-in admin/staff role, on a URL flag such as ?jam=1 (persisted in sessionStorage for that tab), or on a 'Report a problem' click;
- or load capture.js alone (fetch/console buffer) and inject the recorder iframe only when a recording starts.

Remove the jam:team meta and the *.jam.dev CSP entries for builds where Jam is off.

**Who it hits**

Every visitor on every full load. Phones get 0.5-1 s of extra main-thread work right when students start tapping, which makes the first taps feel stuck. The 772 KB download costs mobile data. Heap doubles for the whole session. Automated tooling that waits for network idle (Lighthouse, Playwright networkidle) never finishes.

**Independent check**

Code: src/bootstrap.ts:13 calls scheduleJamRecorder() on every page. src/jam-loader.ts:53-72 gates it only on window load, idle and MediaRecorder support. Every cold load I ran, on /, /login, /app, /app/library and /app/settings, signed in or out, fetched 9 Jam requests, about 772 KB: js.jam.dev recorder.js 31 KB and capture.js 32 KB, then the recorder.jam.dev/capture iframe with index-47191793.js 610 KB, CSS 76 KB, worker.js and the Cloudflare beacon. recorder.jam.dev/worker.js was still pending at the end of every Jam run and never in the no-Jam runs. A/B on / signed out, mobile, CPU 4x, 3 runs each, load 2.5-4.4, medians: ScriptDuration 2,889 vs 1,591 ms (+1.3 s), long tasks 10 / 2,501 ms vs 5 / 1,161 ms, CDP JSHeapUsedSize 16.7 vs 9.8 MB. performance.memory showed no difference because it is bucketed. Unthrottled mobile: 3 / 439 vs 2 / 242 ms of long tasks. window.fetch is native before Jam loads and wrapped after. FCP and LCP do not move, because the cost lands after load. Not reproduced: the listener-growth and heap-after-60-navigations figures, and the 'preloaded but not used' warning. The heap rise I measured is about 1.7x, not 2x. render-bundle-2 is the same finding.

**Evidence files**

[idle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/idle.json), [prof-_app-cold-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/prof-_app-cold-cpu4.json), [prof-_app-warm-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/prof-_app-warm-cpu4.json), [prof-_app-warm-cpu4-nojam.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/prof-_app-warm-cpu4-nojam.json), [mem2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/mem2.json), [mem2-nojam.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/mem2-nojam.json), [swnet-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/swnet-mobile.json), [matrix-medians.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix-medians.json), [last-null-mobile-_-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-cpu4.json), [last-null-mobile-_-nojam-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-nojam-cpu4.json), [loads.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/loads.jsonl), [fetchwrap.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/fetchwrap.mjs)


### render-bundle-1: Ask streaming saturates the main thread (re-renders and re-parses every message every 30 ms) and pins the reader's scroll to the bottom

**Severity:** high · **Verdict:** confirmed · **Root cause:** `ask-stream-rerender-and-autoscroll`

**Where**

- src/pages/AskPage.tsx:42 (whole-store useSessionStore())
- src/pages/AskPage.tsx:189-201 (30 ms delta batching -> appendAskStreamingDelta)
- src/pages/AskPage.tsx:317 (handleSaveToLibrary recreated every render)
- src/pages/AskPage.tsx:334-343 (formattedMessages builds new objects every render)
- src/pages/AskPage.tsx:367
- src/components/features/ask/AskChat.tsx:82 (React.memo MessageBubble, defeated)
- src/components/features/ask/AskChat.tsx:380-382 (smooth scrollIntoView on [messages])
- src/components/features/ask/AskChat.tsx:557-558
- src/components/ui/markdown.tsx:4 (unmemoized ReactMarkdown)
- src/lib/stores/session-store.ts:948-952
- route /app/ask

**What the reviewer saw**

Production build of 40738ea served locally against staging (vite preview + staging proxy), pro account, Pixel 7 viewport, CPU throttled 4x, all writes to staging blocked. Streaming was driven through the real store with 100 appendAskStreamingDelta calls at 30 ms spacing (about 3 s of tokens), no AI call.

Wall time for those 100 flushes, and long tasks:
- 1 prior message: 6,757 ms wall, 74 long tasks, 4,566 ms total.
- 11 prior messages: 11,174 ms wall, 99 long tasks, 9,787 ms.
- 31 prior messages: 16,474 ms wall, 100 long tasks, 14,783 ms.

Every flush is one commit re-rendering 401, 501 or 701 components. Dev counts show MessageBubble re-rendering for every message on every flush: 1,200 renders per 100 flushes with 12 messages, 3,200 with 32. Markdown renders were 2,400 and 6,400 per 100 flushes. Every flush also writes the whole persisted store: 101 localStorage writes, 9.4 to 10.9 MB serialized.

CPU profile (production build, unthrottled, 11 messages, 3.5 s): scrollIntoView 577 ms, markdown chunk 539 ms, React plus store 964 ms (including 137 ms of zustand setItem stringify and 86 ms of native setItem).

Scroll test (desktop, production build): mid-stream, the chat viewport was set to scrollTop 0 and the window to 0. The chat viewport read 9 at 100 ms, 1,241 at 300 ms and 2,169 (the maximum) at 1 s. The window snapped back to 140. Video ask-stream-scroll-yank.webm.

**Why it happens**

Five causes stack up:
- AskPage subscribes to the entire session store, so every 30 ms delta re-renders the page.
- It maps askMessages into fresh objects and recreates onSaveSource on every render, so MessageBubble's React.memo never holds.
- Markdown is not memoized, so react-markdown re-parses every past message on every flush.
- The auto-scroll effect depends on a messages array that is new on every render, so smooth scrollIntoView (which also scrolls the window) restarts about 33 times a second and overrides the user's scroll.
- zustand persist serializes the whole partialized state on every set(), even though askStreamingAssistant itself is not persisted.

**Suggested fix**

- AskPage: subscribe with selectors (useShallow), memoize the message list or pass store messages straight through, and wrap handleSaveToLibrary in useCallback.
- Render the streaming bubble as its own component subscribed only to askStreamingAssistant, so finished messages never re-render.
- Wrap Markdown in React.memo keyed on content.
- While streaming, re-parse at most once per animation frame, or show plain text and switch to markdown when the answer finishes.
- Auto-scroll only when the user is already near the bottom. Set the ScrollArea viewport's scrollTop with behavior auto during streaming instead of calling scrollIntoView.
- Stop persisting on every streaming delta (see render-bundle-3).

**Who it hits**

Every Ask user, worst on phones. It gets worse as the conversation grows: the UI lags behind the network, taps and scrolling freeze while an answer streams, and the reader cannot scroll back up to re-read anything until the answer ends.

**Independent check**

Code confirmed: AskPage.tsx:42 subscribes to the whole store, :334-343 builds new message objects every render, :317 recreates handleSaveToLibrary, AskChat.tsx:380-382 calls a smooth scrollIntoView on [messages], markdown.tsx is unmemoized, and session-store.ts:949-953 plus persist write on every delta. Repro on staging with no AI cost: an in-page fake SSE stream for /functions/v1/ai-stream drove the real code, with Jam blocked and all writes route-aborted. Mobile at CPU 4x, 300 deltas: with 0 prior messages there were 110 long tasks / 10.5 s (max 315 ms) and 117 store writes / 22 MB serialized. With 22 prior bubbles, 113 long tasks / 20.4 s (max 485 ms) and 119 writes / 24.7 MB. Desktop at 4x gave 107 / 9.7 s and, with 8 bubbles, 111 / 16.6 s. So each flush costs about 90-180 ms. My producer is a main-thread timer, so the wall times (15-27 s for an ideal 3 s) overstate real lag; the per-flush cost is the reliable figure. Scroll test, desktop at 1x: I set the chat viewport and the window to the top mid-stream. The window snapped back from 0 to 140 within 300 ms, and the viewport was dragged steadily down (0, 2, 84, 251, 530 px over 1 s), so the reader cannot stay scrolled up. Aside, not a finding of this batch: the chat viewport is only 143 px tall at 1280x800, and on mobile the messages area was not visible in the screenshot. Exclude from any finding the ERR_FAILED console errors and the 'Could not save this result to the debate' toast in the screenshot; my write blocking caused both.

**Evidence files**

[prod-build-cpu4x-measurements.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/prod-build-cpu4x-measurements.json), [prod-ask-stream-profile-10.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/prod-ask-stream-profile-10.json), [stream-sim-0msgs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/stream-sim-0msgs.json), [stream-sim-10msgs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/stream-sim-10msgs.json), [stream-sim-30msgs.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/stream-sim-30msgs.json), [ask-stream-scroll-yank.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/ask-stream-scroll-yank.json), [ask-stream-scroll-yank.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/ask-stream-scroll-yank.webm), [ask-stream-yank-after-scroll-up.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/raw/ask-stream-yank-after-scroll-up.png), [prod-stream.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/prod-stream.mjs), [yank.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/yank.mjs), [ask-stream.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/ask-stream.jsonl), [ask-stream-yank-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/ask-stream-yank-desktop.png), [ask-stream-yank-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/ask-stream-yank-mobile.png), [ask-stream.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/ask-stream.mjs)


### render-bundle-2: Jam bug recorder loads about 690 KB of third-party JS for every visitor on every page, more than the whole app

**Severity:** high · **Verdict:** confirmed · **Root cause:** `jam-recorder-unconditional` · **Same fix as:** perf-runtime-2

**Where**

- src/bootstrap.ts:15 (scheduleJamRecorder() unconditional)
- src/jam-loader.ts:1-4 (recorder.js + capture.js)
- src/jam-loader.ts:53-68 (loads after window load + idle, no env/user gating)
- src/lib/supabase/AuthProvider.tsx:11 (setJamUserId)
- vercel.json:18 (CSP script-src/frame-src/connect-src *.jam.dev)
- routes / (signed out) and /app (signed in)

**What the reviewer saw**

Staging, / signed out, Pixel 7, 3 runs with Jam allowed and 3 with Jam blocked. Load average 2.8 to 4.4. Medians:
- JS transferred: 1,119 KB with Jam vs 431 KB without.
- ScriptDuration: 613 ms vs 254 ms.
- Long-task total: 467 ms vs 219 ms.
- JS heap: 17.8 MB vs 9.6 MB.

Jam requests: js.jam.dev recorder.js 31.5 KB and capture.js 32.3 KB, recorder.jam.dev 6 requests and 697.8 KB (main bundle index-47191793.js is 609.7 KB transferred), and a static.cloudflareinsights.com beacon (10.2 KB) that only appears when Jam loads. Signed-in /app shows the same: recorder.jam.dev 699 KB.

The main-thread work lands after load, at idle time, so FCP and LCP don't move. The cost is bandwidth (about 2.6x the app's own JS), battery, and contention with taps in the first seconds.

**Why it happens**

bootstrap.ts schedules the Jam recorder for every page view in every environment, gated only on MediaRecorder support. Jam is a bug-reporting tool, but every student pays its full cost on every visit.

**Suggested fix**

Load Jam only on demand: from a 'Report a problem' action, for admins, on staging, or behind an opt-in flag (for example ?jam=1 kept in localStorage). Otherwise remove it from production builds with a build-time env check in src/bootstrap.ts. If it is removed or gated, tighten the CSP *.jam.dev entries to match. Since setJamUserId tags recordings with the user id, gating also cuts what is sent to a third party.

**Who it hits**

Every visitor on every first load, including signed-out landing visitors and students on mobile data.

**Independent check**

Same cause and fix as perf-runtime-2. Location correction: scheduleJamRecorder() is at src/bootstrap.ts:13, not :15. Reproduced 9 Jam requests / about 772 KB on / signed out and on /app signed in. On / mobile, total scripts were 1,119 KB with Jam vs 431-442 KB without. A/B medians at CPU 4x: ScriptDuration 2,889 vs 1,591 ms, CDP heap 16.7 vs 9.8 MB. The setJamUserId privacy angle (AuthProvider.tsx:11) supports gating.

**Evidence files**

[load-_-anon-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-_-anon-mobile.json), [load-nojam-_-anon-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-nojam-_-anon-mobile.json), [load-_app-pro-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-_app-pro-desktop.json), [load.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/load.mjs), [last-null-mobile-_.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_.json), [last-null-mobile-_-nojam.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-nojam.json), [last-null-mobile-_-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-cpu4.json), [last-null-mobile-_-nojam-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-nojam-cpu4.json)


### perf-runtime-3: First load on a device shows 'No current debate' / 'Start debate' / '0 sources' placeholders for 200-420 ms, then swaps in the real debate (Library CLS 0.175), because two stores make a network getUser() round trip before querying

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `debate-placeholder-before-hydration`

**Where**

- src/lib/stores/debate-store.ts:127 (hydrate awaits supabase.auth.getUser() before the debates and current_debates queries)
- src/lib/stores/sparring-store.ts:481 (same before sparring_sessions)
- src/lib/supabase/AuthProvider.tsx:133-146 (hydrateStores already has the userId from getSession())
- src/pages/HomePage.tsx:113-124 (dashed 'No current debate' card whenever debate is null, ignoring hydrated)
- src/pages/LibraryPage.tsx:477-492 ('Select or create a debate', 0 sources, 'No Sources Yet', Add Source disabled)
- src/pages/CurrentDebatePage.tsx:90-104 (EmptyState 'No current debate')
- src/components/features/debate/CurrentDebateMenu.tsx:32-35 (header shows 'Start debate', which opens the create dialog)
- Only src/components/features/debate/DebateDialogs.tsx:171 checks hydrated

**What the reviewer saw**

Every cold /app load fires two parallel GET /auth/v1/user calls. debates and current_debates start only after they resolve.
- Desktop: getUser 373-538 ms, then debates 540-623 ms.
- Mobile: getUser 3,102-3,503 ms, then debates 3,719-3,916 ms.

Frame-accurate captures, desktop cold, single runs:
- Home: placeholder at 398 ms, real card at 599 ms. A second run: header 'Start debate' 396-736 ms, main placeholder 479-736 ms.
- Library: placeholder at 672 ms, real at 973 ms.
- Current Debate: placeholder at 570 ms, real at 877 ms.
- A warm reload in the same context shows no flash, because debates are persisted.

CLS, desktop cold: /app/library 0.1749 (median of 3, 3/3 runs; the real content shifts everything up 54 px) and /app/debate 0.1877 (single run). Mobile cold: /app/library 0.0547, /app/debate 0.0687.

The LCP element of every cold /app load is the placeholder text 'Start a debate to keep one motion…'.

The Current Debate page heading (the motion) waits for the chain: desktop content at 1,009 ms vs 474 ms for /app; mobile at 4,613 ms vs 3,696 ms (single run; getUser 3,288-4,095, debates 4,113-4,303).

**Why it happens**

supabase.auth.getUser() validates the JWT with a network call to /auth/v1/user. The stores use it just to learn the user id the AuthProvider already holds, which serialises a round trip in front of the data. Meanwhile, consumers treat debate === null as 'the user has no debate' instead of 'not loaded yet', because they never read useDebateStore(s => s.hydrated).

**Suggested fix**

1. Pass the userId from AuthProvider.hydrateStores into hydrate(userId) and hydrateSavedSessions(userId). Otherwise read it locally with supabase.auth.getSession(); RLS still enforces access on the server.
2. In HomePage, LibraryPage, CurrentDebatePage, CurrentDebateMenu and CurrentDebateStrip, render a same-size skeleton while !hydrated && !debate. Never show 'Start debate' or a disabled Add Source until hydration ends.
3. Reserve the card height so the swap causes no shift.

**Who it hits**

Every user's first visit on a device, after sign-in, and after clearing data. That includes every new student's first impression. They see an empty, dashed 'No current debate' state and an active 'Start debate' button that opens the create dialog if tapped, then the page jumps. The Current Debate page heading arrives about 0.9 s later on phones.

**Independent check**

Code confirmed. debate-store.ts:127 and sparring-store.ts:481 await supabase.auth.getUser() before querying. HomePage.tsx:113, LibraryPage.tsx:477-492, CurrentDebatePage.tsx:90 and CurrentDebateMenu.tsx:32 render the 'no debate' state whenever debate is null. Only DebateDialogs.tsx:171 reads hydrated. Desktop cold runs: debates and current_debates start only after both /auth/v1/user calls return (getUser 596-754 ms, debates at 712 ms). Home: header 'Start debate' at 583 ms, dashed 'No current debate' card at 676 ms, real card at 831 ms. Library, 3/3 runs: 'Select or create a debate', 0 sources and a disabled Add Source for 76-168 ms (764 ms in one run with slow auth), then a 0.1749-0.1752 layout shift as the content below moves up 54 px. Total CLS was 0.191, which includes a second 0.016 shift. My screenshots caught the placeholder without any added delay. The LCP element was the placeholder text in 3/3 mobile throttled /app runs and 2/3 unthrottled ones, so 'most' loads, not 'every'. Fix #1 (pass the userId instead of calling getUser) is the same change as perf-runtime-5 item 5 and render-bundle-12. The flash and CLS still need the hydrated gate plus a reserved card height.

**Evidence files**

[flash-_app_library-desktop-placeholder.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app_library-desktop-placeholder.png), [flash-_app_library-desktop-after.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app_library-desktop-after.png), [flash-_app-desktop-placeholder.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app-desktop-placeholder.png), [flash-_app-desktop-after.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app-desktop-after.png), [flash-_app_debate-desktop-placeholder.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app_debate-desktop-placeholder.png), [flash-_app_debate-desktop-after.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/flash-_app_debate-desktop-after.png), [flash-_app-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/flash-_app-desktop.json), [flash-_app_library-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/flash-_app_library-desktop.json), [matrix.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix.jsonl), [flash_app_library-placeholder.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/flash_app_library-placeholder.png), [flash_app_library-after.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/flash_app_library-after.png), [flash_app-placeholder.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/flash_app-placeholder.png), [flash_app-after.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/flash_app-after.png), [last-pro-desktop-_app_library.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app_library.json), [flash.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/flash.mjs)


### perf-runtime-4: Each keystroke in the Generate, Attack, Brainstorm and Factoids forms re-serialises the whole persisted library to localStorage (20 KB per key today, growing with saved work), producing one long task per key on phones

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `persist-whole-store-every-set` · **Same fix as:** render-bundle-3

**Where**

- src/components/features/generate/GenerateForm.tsx:81-82 (watch -> setGenerateForm on every change)
- src/components/features/attack/AttackForm.tsx:58-59
- src/components/features/brainstorm/BrainstormForm.tsx:51-52
- src/components/features/factoids/FactoidsForm.tsx:55-56
- src/lib/stores/session-store.ts:490-493 (setXForm -> set) and 1281-1292 (partialize persists everything except loading flags: saved cases, attacks, brainstorms, factoids, chats, flowcharts, full source texts)
- src/pages/GeneratePage.tsx:35 and GenerateForm.tsx:57 (useSessionStore() with no selector, so the whole page re-renders on any store change)

**What the reviewer saw**

Typing 120 characters in the Generate motion field at CPU 4x (single run per device): 120 localStorage.setItem calls on 'debate-trainer-storage', 2,443 KB written in total (about 20 KB per keystroke).
- Desktop: 58 long tasks of 50-100 ms; key-event median 64 ms; 289 of 584 key events over 50 ms.
- Mobile: 30 long tasks; median 56 ms.
- Control, the Ask box (local useState, no store write): median 40 / 32 ms, 1 long task, 0 writes. The Library textarea: median 40 ms, 0 writes.

Attack case textarea at 4x, mobile, single run, prefilled with 0 / 15 / 60 KB of case text (the form value itself is persisted):
- per-write payload 20 / 35 / 79 KB;
- keydown median 56 / 64 / 104 ms, p90 72 / 80 / 120 ms;
- 11 / 16 / 49 long tasks for 49 keys. With 60 KB, every keystroke is a long task.

The pro account holds only 3 debates. import-source allows 50,000 characters per source, and all source texts are persisted, so the per-keystroke cost scales with the library.

**Why it happens**

Zustand's persist middleware writes JSON.stringify(entire partialized state) on every set(). The tool forms mirror every react-hook-form change into the same persisted store as the whole saved library, and the pages subscribe to the entire store.

**Suggested fix**

1. Move the form drafts (generateForm, attackForm, brainstormForm, factoidsForm) into a small separate persisted store, or write them debounced (300-500 ms) on blur and submit.
2. Stop persisting server-owned lists (savedCases…, sourceLibrary). They are re-fetched on boot anyway; if offline display is wanted, keep them in IndexedDB.
3. Replace useSessionStore() destructuring with selectors or useShallow so a keystroke re-renders only the field.

**Who it hits**

Anyone typing a motion or pasting a case. It is already measurable on mid-range phones, and it gets worse for every student as their library grows. Heavy users with dozens of imported sources would see 100+ ms lag per key, plus a risk of hitting the roughly 5 MB localStorage quota.

**Independent check**

Code: GenerateForm.tsx:80-85, AttackForm.tsx:57-62, BrainstormForm.tsx:51-55 and FactoidsForm.tsx:55-59 call setXForm through watch() on every change. zustand 5.0.15 persist calls setItem after every set(), and partialize (session-store.ts:1281-1292) keeps every saved list. Measured on mobile at CPU 4x, typing 41 characters into Generate's motion field: 41 writes of 'debate-trainer-storage' at 188 KB each, 7.7 MB serialized in total, 39 long tasks / 2,665 ms, keydown median 72 ms (max 128). Control, the Ask input (local state): 0 writes, 1 long task, median 40 ms. Each write is now 188 KB instead of the reviewer's 20 KB because other agents grew the shared pro account during the review, which directly confirms that the cost scales with the library. Fix item #3 (selectors) belongs to render-bundle-4. Folded into render-bundle-3, which also covers the quota failure.

**Evidence files**

[inp.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/inp.jsonl), [attack-typing.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/attack-typing.jsonl), [typing.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/typing.jsonl), [typing.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/typing.mjs)


### perf-runtime-5: Every full load downloads the user's whole library across 14 queries (select=*, no limit, dependent messages query), with duplicate auth and sparring calls, a 3-step sequential subscription chain, and a ~450 ms Edge Function call

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `eager-hydration-network`

**Where**

- src/lib/stores/session-store.ts:1083-1093 (9 parallel select('*') queries over cases, attacks, brainstorms, factoids, chats, flowcharts, sources incl. full content, source_folders, crossfires; no limit, all debates)
- src/lib/stores/session-store.ts:1119-1123 (messages for every chat, only after chats returns)
- src/pages/HistoryPage.tsx:57-59 (hydrateSavedSessions again while the provider's call is still in flight)
- src/hooks/use-subscription.ts:~45-120 (user_settings -> subscriptions -> ai_requests count, run sequentially; user_settings is already loaded by settings-store)
- src/components/layout/AppLayout.tsx:48,121,130 (announcements Edge Function on boot and on route changes after 60 s)
- src/lib/stores/session-store.ts:288-290 and 26 other getUserId()/requireUserId() call sites (each write first makes a /auth/v1/user round trip)
- supabase/functions/import-source/index.ts:12 (MAX_CONTENT_CHARS 50,000 per source)

**What the reviewer saw**

Cold /app, any route: 2 auth calls, 14 REST calls, 1 Edge Function, and 17 CORS preflights before the cache warms.
- The 14 REST calls: cases, attacks, brainstorms, factoids, chats, flowcharts, sources, source_folders, crossfires, user_settings, sparring_sessions, debates, current_debates, messages.
- Waterfall depth 3: getUser -> debates; chats -> messages (desktop 523-586 ms after chats 375-494 ms).

/app/history cold: 3 /auth/v1/user calls and sparring_sessions fetched twice (2,247-3,056 and 2,277-3,204 ms).

Tool pages (/app/sparring, /app/generate, /app/ask, /app/settings): 18 REST calls. They add a second user_settings call (583 ms and again 922 ms), then subscriptions (1,014-1,060), then debate_context_pins (1,064-1,105), then a HEAD on ai_requests (1,092-1,151), one after another.

functions/v1/announcements takes 430-600 ms on every boot (408-1,006 ms on desktop cold /app).

In-app navigation does not refetch: backHomeSb is empty in nav.jsonl. A first tool visit adds 4 calls.

Payload is small for pro (21 KB across the REST calls; persisted copy 20.6 KB) only because the account has 3 debates and 3 sources. Every saved output and full source text across all debates is fetched on every load and then persisted (see perf-runtime-4).

**Why it happens**

The session store hydrates eagerly as an all-tables mirror instead of loading per route or per Current Debate. Dedupe is only by a completed 'hydrated' flag, so in-flight duplicates slip through. use-subscription chains independent queries with await. Every store write resolves the user id over the network.

**Suggested fix**

1. Hydrate only the Current Debate's items on boot (.eq('debate_id', current)). Select list columns (id, title, created_at, debate_id, side) for lists and fetch output/content on open. Paginate History and Library.
2. Embed messages in the chats query (chats?select=*,messages(*)), or load them when a chat opens.
3. Keep an in-flight promise in hydrateSavedSessions so concurrent callers share it.
4. In use-subscription, run the three queries with Promise.all and reuse settings-store's user_settings row.
5. Use getSession()/the AuthProvider user id in getUserId()/requireUserId().
6. Defer announcements until idle, or read admin_announcements via PostgREST with RLS, and give the banner reserved space.
7. Add <link rel=preconnect> to the production Supabase origin in index.html.

**Who it hits**

Every full load for every signed-in user. Phones pay 3 sequential round trips before the Current Debate and tier are known. Data use and boot time grow with each student's library. Each write action waits an extra auth round trip.

**Independent check**

Cold /app, desktop: 2 /auth/v1/user calls, 14 REST calls and 1 Edge Function call, with no writes. The REST calls are 9 select=* without limit from session-store.ts:1084-1092, plus user_settings, debates, current_debates, sparring_sessions and messages. messages starts only after chats returns (714 ms). debates starts only after getUser (712 ms). announcements took 862-1,534 ms. /app/history, 2 runs: 3 /auth/v1/user calls and sparring_sessions fetched twice, overlapping in flight (771-812 and 796-875 ms), from HistoryPage.tsx:57-59 plus the provider. use-subscription.ts:47-130 runs user_settings, then subscriptions, then ai_requests sequentially (/app/settings: 614-731, 750-804, 823-866 ms). Correction: the count is 22 getUserId()/requireUserId() call sites in session-store.ts plus 2 in debate-store.ts and 3 in settings-store.ts, not '26 other'. I did not separately verify the extra debate_context_pins call on tool pages. render-bundle-12 is a duplicate of this finding, and its getUser part is the same fix as perf-runtime-3 #1.

**Evidence files**

[matrix.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix.jsonl), [m1-_app-pro-r1.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/m1-_app-pro-r1.json), [nav.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/nav.jsonl), [last-pro-desktop-_app.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app.json), [last-pro-desktop-_app_history-nojam.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app_history-nojam.json), [last-pro-desktop-_app_settings.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app_settings.json), [loads.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/loads.jsonl)


### perf-runtime-6: After a deploy, open tabs get 'Unable to load this page': missing assets return the SPA shell as 200 text/html with a one-year immutable header, the SW caches that HTML as JS, and nothing recovers automatically. The SW itself never versions

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `stale-chunk-html-cached-by-unversioned-sw` · **Known in plan:** next-15 #15 asks to localise the offline page in public/sw.js. The stale-chunk, caching and versioning problems are not in the plan

**Where**

- vercel.json:5-10 (rewrite /(.*) -> /index.html also catches /assets/*)
- vercel.json:114-121 (/assets/(.*) -> public, max-age=31536000, immutable, so it also applies to the rewritten HTML)
- public/sw.js:50-66 (cacheFirst caches any response.ok, whatever its content-type)
- public/sw.js:1 and 37-49 (constant CACHE_VERSION, so caches are never pruned and the SW only updates when someone edits sw.js)
- public/sw.js:111-119 (cacheFirst for every same-origin script: /theme-init.js and /_vercel/* are frozen despite Vercel no-store)
- src/App.tsx:135-160 (RouteErrorBoundary generic error; no vite:preloadError handler anywhere in src)

**What the reviewer saw**

curl https://debatelab-staging.vercel.app/assets/Nope-abc12345.js returns HTTP 200, content-type text/html, cache-control: public, max-age=31536000, immutable, and the 2.6 KB SPA shell.

Simulated deploy (raw/sw.json): the LibraryPage chunk was answered with exactly that Vercel response, then the Library tile was tapped.
- Console: 'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"' and 'Failed to fetch dynamically imported module'.
- The screen shows 'Unable to load this page / Reload'.
- The SW runtime cache then holds /assets/LibraryPage-D1kN5AuS.js as 9 KB of text/html.

Warm reload: /theme-init.js is served from the SW (fromServiceWorker) despite Vercel's no-store, and so are /_vercel/insights/script.js and speed-insights.

After one /app visit the runtime cache holds 18 entries / 1,318 KB, a second copy of what the immutable HTTP cache already has, and it is never pruned across deploys.

Offline: reloading /app works from cache, but an unvisited route (/app/crossfire) shows the same generic 'Unable to load this page / Reload', not an offline message.

Full loads do get a fresh shell: navigation is network-first.

**Why it happens**

Vercel only serves the current deployment's hashed files. The catch-all rewrite turns a request for an old chunk into the HTML shell, the /assets header rule marks it immutable, and the SW's cacheFirst accepts any 200. The client has no stale-chunk recovery. The SW is unversioned, so its cache-first copies of unhashed files never refresh.

**Suggested fix**

1. vercel.json: change the rewrite source to "/((?!assets/).*)" so missing assets return a real 404.
2. sw.js cacheFirst: cache only when response.ok and the content-type matches the destination (javascript/css/image/font). Never cacheFirst unhashed paths (/theme-init.js, /_vercel/*); use network-first or stale-while-revalidate for those.
3. Inject the build id into sw.js at build time (CACHE_VERSION = 'debate-lab-<sha>'), so activate deletes old runtime caches.
4. In main.tsx add window.addEventListener('vite:preloadError', ...) that reloads once (guard with sessionStorage), and make RouteErrorBoundary show an offline message when !navigator.onLine.

**Who it hits**

Every student with a tab open across a deploy (merges ship to production several times a week) hits an error page on their next new route and has to reload. Offline users get a misleading reload prompt. Fixes to theme-init.js never reach users who have the SW installed.

**Independent check**

curl of /assets/Nope-abc12345.js on staging returns HTTP 200, text/html, 'public, max-age=31536000, immutable' and the 8.7 KB shell; vercel.json:6-11 and :112-121. To simulate a deploy, I answered the LibraryPage chunk with exactly that response and tapped Library. Console showed the MIME-type error and 'Failed to fetch dynamically imported module'. The screen showed 'Unable to load this page / Reload'. The SW runtime cache then held /assets/LibraryPage-D1kN5AuS.js as 9 KB of text/html (sw.js:50-66 caches any response.ok). There are 0 vite:preloadError handlers in src. After reload, /theme-init.js and both /_vercel scripts came from the SW despite Vercel's no-store; CACHE_VERSION is constant at sw.js:1. Offline, tapping the unvisited Crossfire route showed the same generic error. Caveat: in my run the error also persisted after a reload, but that is a test artifact, because a real deploy references new hashes. The real impact is the error on the open tab with no automatic recovery. A Vercel rollback to a build whose chunk URL was poisoned would break that route for the user until the SW cache changes, which matters given the ~/ops/rollback path.

**Evidence files**

[sw.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/sw.json), [sw-stale-chunk-after-deploy-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/sw-stale-chunk-after-deploy-desktop.png), [sw-offline-unvisited-route-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/sw-offline-unvisited-route-desktop.png), [sw-offline-reload-app-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/sw-offline-reload-app-desktop.png), [sw.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/sw.jsonl), [sw-stale-chunk-library.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/sw-stale-chunk-library.png), [sw-offline-unvisited-route.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/sw-offline-unvisited-route.png), [curl-missing-asset-headers.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/curl-missing-asset-headers.txt), [sw.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/sw.mjs)


### perf-runtime-7: First visit downloads 768 KB of images nobody sees: the SW precaches a 1024×1024 favicon twice (.png and .ico, 273 KB each) and the 222 KB og:image, right when the page's own chunks and data load

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `oversized-icons-precached` · **Known in plan:** next-15 #15 (add 192px, 512px and maskable manifest icons). The SW precache waste and the 1024² tab icon are not covered

**Where**

- public/sw.js:5-14 (APP_SHELL includes /favicon.ico, /favicon.png and /hero-visual.png)
- index.html:17 (<link rel=icon href=/favicon.png>, a 1024×1024 PNG)
- public/manifest.webmanifest (only icon is /favicon.png 1024x1024)
- index.html og:image / twitter:image (hero-visual.png is used only here)

**What the reviewer saw**

curl: favicon.png 279,465 B, favicon.ico 279 KB (same image), hero-visual.png 226,968 B. All three are served with max-age=0, must-revalidate. hero-visual.png is referenced only in og/twitter meta; no page renders it.

The SW shell cache after a first /app visit: 8 entries / 791 KB (favicon.png 273 KB, favicon.ico 273 KB, hero-visual.png 222 KB).

raw/swnet-mobile.json: the SW install fetches all 8 shell URLs at 3,047 ms on the mobile profile. That is the same moment the page starts its route chunk (3,215-3,357 ms) and Supabase requests (3,101 ms).

Caveat: CDP throttling does not apply to SW fetches, so the measured 70 ms is unrealistic. At 1.6 Mbps these 737 KB take about 3.7 s of bandwidth, about twice the app's entry.

Browsers also fetch the 279 KB favicon.png as the tab icon and revalidate it on each load.

**Why it happens**

The precache list was built from 'files that exist' rather than 'files the shell needs', and the logo was never resized for icon use.

**Suggested fix**

Drop /hero-visual.png, /favicon.ico and /favicon.png from APP_SHELL (keep '/', theme-init and favicon-72.png). Ship a 32×32/48×48 favicon (about 2 KB) plus 192/512/maskable manifest icons, and point <link rel=icon> at the small one. Optionally defer SW registration until after the first route's data has loaded.

**Who it hits**

Every first visit on every device, including students on metered mobile data. The download competes with the route chunk and API calls on slow connections.

**Independent check**

After a first /app visit the SW shell cache held 8 entries, 791 KB: favicon.png 273 KB, favicon.ico 273 KB, hero-visual.png 222 KB, from APP_SHELL at public/sw.js:5-14. The SW install fetched them at about 550-660 ms on desktop cold, at the same time as the HomePage chunk and the Supabase calls. curl: favicon.png and favicon.ico are 279,465 B each and hero-visual.png is 226,968 B, all 'max-age=0, must-revalidate'. hero-visual.png is used only in the og:image and twitter:image meta tags. CDP network throttling does not apply to SW fetches, so I could not measure the real slow-network contention. render-bundle-10 is the same root cause.

**Evidence files**

[swnet-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/swnet-mobile.json), [sw.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/sw.json), [sw.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/sw.jsonl), [last-pro-desktop-_app.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app.json), [curl-icon-headers.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/curl-icon-headers.txt)


### perf-runtime-8: Tool pages are slow to open on phones: 250-350 ms to mount even when cached, and up to 0.9 s on first visit because of heavy statically imported chunks (recharts on the Sparring setup screen, reactflow on Generate for one enum) and 36-file fan-outs

**Severity:** medium · **Verdict:** partly · **Root cause:** `route-chunks-eager-heavy-deps`

**Where**

- src/pages/SparringPage.tsx:12 (static import of SparringScorecard, which pulls recharts: generateCategoricalChart chunk 356 KB / 79 KB br, used only after judging, line 330)
- src/pages/GeneratePage.tsx:15 (import { MarkerType } from 'reactflow', 123 KB / 35 KB br for MarkerType.ArrowClosed at lines 287 and 316)
- src/components/landing/*.tsx (framer-motion, 118 KB / 35 KB br, needed before the landing page renders)
- src/pages/GeneratePage.tsx:26-27 and the other tool pages (hidden-Workspace WorkspaceToolScope + tool-context, ~4 KB, 2 extra requests per tool page)
- vite.config.ts (no experimentalMinChunkSize / manualChunks; 58 of 116 chunks are under 2 KB)

**What the reviewer saw**

Mobile tap navigation from Home tiles, CPU 4x, medians of 3 runs, click to heading visible.
- First visit: Generate 843 ms (36 chunk files + 4 Supabase calls), Sparring 494 ms, Attack 338, Ask 331, Brainstorm 316, Factoids 313, Library 274, Crossfire 249, History 247, Timer 237.
- Second visit, chunks cached, no network: Generate 352, Sparring 333, Attack 331, Factoids 286, Ask 276, Brainstorm 255, Library 229, History 191, Crossfire 149, Timer 148.
- Back to Home: about 135 ms.
- First-visit chunk downloads went through the SW unthrottled, so real 4G first visits are slower. The Generate closure is 123 KB br, Sparring 162 KB br (recharts is half of it).

Desktop unthrottled, single run: first Generate 415 ms on tap, 162 ms with hover prefetch; everything else 30-170 ms.

A CPU profile of a cached Home->Generate navigation at 4x (387 ms) puts ~243 ms in the entry chunk (React reconcile/commit) and 6 ms in GeneratePage's own code; the rest is native '(program)' time (style, layout, paint). The page subscribes to the whole session store (see perf-runtime-4).

Touch devices get no prefetch before pointerdown: use-route-prefetch.ts schedules hover prefetch only for (hover: hover) and (pointer: fine).

**Why it happens**

Route chunks statically import code needed only in later states (the scorecard chart, flowchart enums) or only in hidden features (Workspace). Rollup splits shared modules into many tiny chunks. Mount cost on phones is dominated by React rendering large, whole-store-subscribed pages plus style and layout. That part is only partly attributed.

**Suggested fix**

1. lazy(() => import('@/components/features/sparring/SparringScorecard')) behind a Suspense boundary shown at judging time.
2. In GeneratePage, replace MarkerType.ArrowClosed with the string 'arrowclosed' and keep reactflow in the flowchart chunk.
3. Gate WorkspaceToolScope behind COLLABORATION_URL with a dynamic import.
4. Set build.rollupOptions.output.experimentalMinChunkSize ≈ 10_000 to merge the lucide icon micro-chunks.
5. On touch devices, prefetch the Home tool chunks at idle after first paint (requestIdleCallback -> preloadRoute for the 8 tool paths).
6. Profile GeneratePage, SparringPage and AttackPage mounts with the React Profiler on a production build, and add selectors to useSessionStore.

**Who it hits**

Students on phones feel a quarter to a third of a second of lag on every tool tap, and close to a second on the first Generate or Sparring visit. Desktop is fine.

**Independent check**

Structure confirmed from the bundle graph. GeneratePage's static closure is 40 files, 412 KB min / 124 KB br, including @reactflow/core at 123 KB. SparringPage's is 637 KB / 163 KB br, including the recharts chunk at 356 KB. Every tool page pulls the WorkspaceToolScope and tool-context chunks. use-route-prefetch.ts:81 skips prefetch on touch devices. Mobile tap timing at CPU 4x, Jam blocked, 3 sessions, load 1.2-2.4, medians: Generate first visit 769 ms with 36 script files; Sparring 451; Attack 241; Library 289. Cached visits: Generate 245, Attack 191, Sparring 163, Library 126; back to Home 42-89 ms. The first-visit Generate cost reproduces. 'Cached mounts take 250-350 ms' does not: I measured 125-245 ms, possibly because Jam was blocked in my runs. Chunk fetches were unthrottled. The reactflow and recharts parts are the same fixes as render-bundle-7 and render-bundle-8; this entry adds the touch prefetch and micro-chunk items.

**Evidence files**

[nav.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/nav.jsonl), [prof-nav-generate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/raw/prof-nav-generate.json), [bundle-graph-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/bundle/bundle-graph-local-build.json), [nav.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/nav.jsonl), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json), [nav.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/nav.mjs)


### render-bundle-3: session-store writes every saved case, chat and full source text to localStorage on every update and crashes once over quota

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `persist-whole-store-every-set`

**Where**

- src/lib/stores/session-store.ts:453 (persist)
- src/lib/stores/session-store.ts:1263-1291 (localStorage storage, partialize keeps savedCases/savedAttacks/savedBrainstorms/savedFactoids/savedChats/savedFlowcharts/sourceLibrary/results)
- src/lib/stores/session-store.ts:490 (setGenerateForm)
- src/components/features/generate/GenerateForm.tsx:79-84 (watch -> setGenerateForm per keystroke; same pattern in AttackForm, BrainstormForm, FactoidsForm)
- src/lib/stores/session-store.ts:499-552 (addSource: server insert, then set())
- src/pages/LibraryPage.tsx:223-226 and 296-307
- src/lib/stores/sparring-store.ts:158 and 529 (already uses a debounced storage)
- src/lib/source-file-import.ts:4 (MAX_EXTRACTED_CHARS 120,000)

**What the reviewer saw**

Write volume:
- Each keystroke in the Generate, Attack, Brainstorm or Factoids form writes 'debate-trainer-storage' once: 17 writes for 17 keys (keys-*.json).
- Each write was 20.8 KB early in the session and 92.7 KB later, after the shared pro account had collected more items. At 4x CPU, 10 keystrokes serialized 927 KB and spent 23.5 ms in setItem alone.
- One Ask stream wrote it 101 times (render-bundle-1).

Quota test (dev build, local only, writes blocked): adding 45 sources at the 120,000-character file-import limit made setState throw "QuotaExceededError: Setting the value of 'debate-trainer-storage' exceeded the quota". After that, each keystroke in Generate raised an uncaught page error (3 keys, 3 QuotaExceededError page errors), and the persisted draft stayed at its old value.

zustand 5.0.15's persist calls storage.setItem on every set() with no try/catch, so the in-memory update happens and then the caller throws. addSource inserts the row on the server before calling set(). Over quota, handleAddSource throws before it clears the form or shows the success toast, leaving an unhandled rejection with the draft still filled in, so a second click inserts a duplicate source.

**Why it happens**

partialize persists almost the whole store, including every server-owned list with its full text, through synchronous localStorage writes on every set(). Form drafts update the store on every keystroke. The migrate comment at line 1268 already notes that server hydration replaces these lists on load.

**Suggested fix**

- Persist only what must survive a reload: form drafts, the open Ask conversation, UI flags. Drop savedCases, savedAttacks, savedBrainstorms, savedFactoids, savedChats, savedFlowcharts, sourceLibrary and results from partialize, since hydrateFromServer replaces them anyway. If an offline view is wanted, move those lists to IndexedDB.
- Use a debounced storage wrapped in try/catch, like sparring-store's debouncedSessionStorage.
- Debounce setGenerateForm and its siblings, or persist drafts on blur.
- Make addSource and similar actions tolerate a failed persist once the server write has succeeded.

**Who it hits**

Every user pays a full-store serialization on each keystroke and each stream flush, and the cost grows with their history. Heavy Library users (large PDF or DOCX imports) hit the quota: drafts stop saving, errors fire on every keystroke, and saving sources looks like it failed, which invites duplicates.

**Independent check**

This is the primary entry for the persist cause; perf-runtime-4 is folded in. Write volume: 1 write of 'debate-trainer-storage' per keystroke, now 188 KB each on the shared pro account (41 keys gave 7.7 MB). One Ask stream gave 114-119 writes. Quota: I filled localStorage with junk in my own browser context only, then typed into Generate's motion field. That produced an uncaught 'QuotaExceededError: Setting the value of debate-trainer-storage exceeded the quota' page error. The field showed '... abc' while the persisted draft stopped at '... ab'. I got 1 error for 4 keys rather than 3 for 3, because the slack left in storage absorbed the first characters. zustand persist has no try/catch (node_modules/zustand/esm/middleware.mjs:300, 358-368). The duplicate-source path is code-confirmed only and was not executed: session-store.ts:519-533 inserts the row on the server before set() at :549, and LibraryPage.tsx:217-227 and :296-307 have no try/catch, so the form stays filled and there is no toast. The junk was removed and the context destroyed.

**Evidence files**

[quota-localstorage.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/quota-localstorage.json), [keys-generate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-generate.json), [keys-attack.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-attack.json), [prod-build-cpu4x-measurements.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/prod-build-cpu4x-measurements.json), [quota-generate-typing.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/raw/quota-generate-typing.png), [quota.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/quota.mjs), [typing.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/typing.jsonl), [quota-generate-typing-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/quota-generate-typing-desktop.png), [ask-stream.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/ask-stream.jsonl), [typing.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/scripts/typing.mjs)


### render-bundle-4: Tool pages re-render top to bottom on every keystroke (whole-store subscriptions, watch() on the whole form, no memo boundaries)

**Severity:** medium · **Verdict:** partly · **Root cause:** `whole-store-subscriptions`

**Where**

- src/pages/GeneratePage.tsx:35 and src/components/features/generate/GenerateForm.tsx:57, :108 (watch())
- src/pages/AttackPage.tsx:26-27, src/components/features/attack/AttackForm.tsx:37, :71
- src/pages/BrainstormPage.tsx:24-26, src/components/features/brainstorm/BrainstormForm.tsx:36, :59
- src/pages/FactoidsPage.tsx:24-25, src/components/features/factoids/FactoidsForm.tsx:37, :61
- src/pages/LibraryPage.tsx:160-172 (whole store) and :50 / :882-890 (SourceRow not memoized, inline props)
- src/pages/FlowchartPage.tsx:261-267 and :756-758, :765 (inline onNodeClick/onNodeDoubleClick/onPaneClick/nodeColor)
- src/pages/HistoryPage.tsx:35, src/components/features/debate/debate-items.ts:88, src/components/ModelSelector.tsx:40, src/components/LanguageSwitcher.tsx:12, src/components/ThemeToggle.tsx:7
- src/pages/CrossfirePage.tsx:421-425 (setNow every 500 ms re-renders the page during a round; read in code only)
- src/components/ui/select.tsx (Radix Select renders every item even when closed)

**What the reviewer saw**

Committed components per keystroke, dev build pinned to staging, pro account:
- Generate: 708 (1 commit per key, about 25 ms of React render per key in dev).
- Factoids: 487. Attack: 486. Brainstorm: 464.
- Flowchart add-node label: 417, and all 6 CustomNode/NodeWrapper re-render on every key.
- Library add-source content: 386, with every SourceRow re-rendering.
- Ask input: 342. Library search: 250.
- Crossfire: 75, but 2 commits per key.

On Generate, each keystroke re-renders GeneratePage, GenerateForm, ModelSelector, DebateContextControl, CurrentDebateStrip, 3 closed modals (LimitReached, ModelRestricted, Pricing) and 5 OptionSelects with all 30 SelectItems.

Production build, 4x CPU: Generate's median key event was 72 ms (max 88 ms; 47 events over 16 ms for 10 keys).

Route mount: navigating to Generate costs 7 commits and 2,605 component renders (about 97 ms of dev render). 4 of those commits come from Radix Select's mount sequence, each re-rendering every select item. Ask, Sparring and Library show the same pattern.

**Why it happens**

- 13 components call useSessionStore() or useSettingsStore() with no selector, so any store change re-renders them.
- The forms call watch() on the whole form, which re-renders on every field change, and push each keystroke into the store, which re-renders the page as well.
- Pages own transient input state (LibraryPage is over 1,000 lines; FlowchartPage holds the dialog state) with no memoized children.
- FlowchartPage passes new handler functions to ReactFlow on every render, so every node wrapper re-renders.
- Radix Select mounts all of its items even when closed.

**Suggested fix**

- Use selector subscriptions everywhere: useSessionStore((s) => s.generateForm), or useShallow for several fields.
- In the forms, replace watch() with useWatch on the fields actually displayed, and debounce store persistence.
- Move the add-source form, the Flowchart add/edit dialog and the Ask composer into child components that own their own state.
- Wrap SourceRow and the flowchart CustomNode in React.memo, and wrap FlowchartPage's ReactFlow handlers and MiniMap nodeColor in useCallback.
- Use a native select (or a lighter list) for the five simple option pickers on Generate.
- Isolate Crossfire's 500 ms clock in a small timer component.

**Who it hits**

Typing feels heavy on phones in every core tool (Generate, Attack, Brainstorm, Factoids, Library, Flowchart, Ask), and the cost grows with list sizes (sources, flowchart nodes).

**Independent check**

Code confirmed: whole-store useSessionStore() or useSettingsStore() calls in GeneratePage:35/41, GenerateForm:57, AttackPage:26-27, AttackForm:37, BrainstormPage:24-26, BrainstormForm:36, FactoidsPage:24-25, FactoidsForm:37, LibraryPage:172, FlowchartPage:267, HistoryPage:35, debate-items.ts:88, ModelSelector:40, LanguageSwitcher:12, ThemeToggle:7, AskPage:42/44, CrossfirePage:346 and SettingsPage:45-46. The forms call watch() on the whole form (GenerateForm:108 etc.). CrossfirePage:421-426 ticks setNow every 500 ms. Measured in production at CPU 4x, Generate keydown median 72 ms vs 40 ms for the local-state Ask input, but that figure mixes re-render cost with the persist cost from render-bundle-3; I did not separate them. Not verified: the dev-build component counts (708 per key and so on), the Flowchart and Library row figures, and the claim that Radix Select renders all items while closed.

**Evidence files**

[keys-generate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-generate.json), [keys-attack.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-attack.json), [keys-brainstorm.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-brainstorm.json), [keys-factoids.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-factoids.json), [keys-ask.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-ask.json), [keys-crossfire.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-crossfire.json), [keys-library-content.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-library-content.json), [keys-library-search.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-library-search.json), [keys-flowchart-label.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/keys-flowchart-label.json), [nav-renders.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/nav-renders.json), [prod-build-cpu4x-measurements.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/prod-build-cpu4x-measurements.json), [rc.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/rc.mjs), [typing.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/typing.jsonl)


### render-bundle-5: All three locale catalogs (en, es, hu) are inlined into the entry chunk

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `oversized-entry-chunk` · **Same fix as:** perf-runtime-1

**Where**

- src/i18n.ts:3-5 and :9 (static JSON imports bundled as resources)
- staging /assets/index-B7gkXSCc.js

**What the reviewer saw**

In the local build of 40738ea, the entry chunk index-BlnKlHj_.js is 1,201 KB minified and 371 KB gzip (staging's entry is 367.7 KB transferred).

Rollup's rendered sizes for the locale modules: es.json 101.8 KB, hu.json 100.3 KB, en.json 92.4 KB. Each catalog minified and compressed:
- en: 88.0 KB min, 28.0 KB gzip, 23.6 KB brotli.
- es: 97.1 KB min, 31.1 KB gzip, 26.8 KB brotli.
- hu: 95.6 KB min, 32.9 KB gzip, 28.7 KB brotli.

source-map-explorer attributes 324 KB of the entry to i18next.js (about 40 KB of library plus the inlined catalogs). Fifty long sample strings from each language were all found in both my entry and staging's entry. Every visitor downloads two languages they never see, about 50 to 55 KB brotli or 15% of the entry. Landing LCP on slow 4G with 4x CPU is 12.7 to 13.7 s, bound by the entry download.

**Why it happens**

i18n.ts imports every catalog statically to make init synchronous.

**Suggested fix**

Keep en (the fallback) bundled and load es and hu through import() (i18next-resources-to-backend or a small loader) inside applyAppLanguage before changeLanguage. Pick the initial language from the persisted setting or navigator before mount so there is no flash of English. Add an entry-size budget to scripts/check-build-boundaries.mjs so the catalogs cannot creep back in. Optionally split out the landing/public keys so the landing page doesn't need the app's 2,156 keys.

**Who it hits**

Every first visit, every page, every language. It weighs most on the landing page and on slow mobile networks.

**Independent check**

Sub-fix of perf-runtime-1: lazy-load the es and hu catalogs. src/i18n.ts:3-10 imports all three statically. 50 of 50 sampled strings per language are in staging's entry. Minified catalogs: en 90,075 B, es 99,430 B, hu 97,925 B. My local build's entry is 1,201 KB min / 371 KB gzip, matching the reviewer. I did not measure the slow-4G landing LCP of 12.7-13.7 s.

**Evidence files**

[entry-chunk-composition.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-chunk-composition.json), [entry-import-chains.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-import-chains.txt), [build-sizes-excerpt.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/build-sizes-excerpt.txt), [fonts-render-blocking.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/fonts-render-blocking.json), [source-map-explorer-local-entry.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/source-map-explorer-local-entry.json), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json)


### render-bundle-6: Entry chunk ships signed-in-only code (stores, debate UI, zod, unused Supabase realtime/storage, Capacitor) to landing and login visitors

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `oversized-entry-chunk` · **Same fix as:** perf-runtime-1

**Where**

- src/App.tsx:8-9 (AppLayout, AuthProvider static)
- src/lib/supabase/AuthProvider.tsx:5-12 (session-store, sparring-store, debate stores, crossfire storage)
- src/components/layout/AppLayout.tsx:22-28 (CurrentDebateMenu, DebateDialogs, announcements)
- src/lib/announcements.ts:2 (zod in entry)
- src/lib/stores/sparring-store.ts (zod schemas, voice delivery)
- src/lib/supabase/client.ts (createClient bundles RealtimeClient and StorageClient)
- src/main.tsx:7-10 (native runtime, Capacitor)

**What the reviewer saw**

source-map-explorer on the entry (1,173 KB minified):
- zod: 88.5 KB.
- Stores: 45.0 KB (session-store.ts alone 22.8 KB).
- Debate UI (DebateDialogs, DebateForm, CurrentDebateStrip, CurrentDebateMenu): 12.3 KB.
- Sparring, crossfire and voice libs: 9.7 KB.
- Capacitor core and plugin definitions plus native runtime: 12.5 KB.
- Supabase realtime-js + phoenix + storage-js + iceberg-js: about 84 KB of the 212.6 KB Supabase total.

Realtime and storage are used nowhere outside the hidden Workspace: grep for .channel(, realtime and storage.from in src found nothing.

Import chains:
- index.html -> main.tsx -> App.tsx -> AppLayout.tsx -> announcements.ts -> zod.
- App.tsx -> AuthProvider.tsx -> sparring-store.ts -> ai/schemas/sparring.ts -> voice/delivery.ts.
- main.tsx -> lib/native.ts -> @capacitor/core.

That is roughly 250 KB minified the signed-out landing and login pages never run. Landing LCP on slow 4G with 4x CPU: 12,720 / 13,672 / 13,640 ms. The h1 waits for this entry plus LandingPage and the framer chunk.

**Why it happens**

The protected-app shell (AppLayout and its dialogs) and store hydration are imported statically from App.tsx and AuthProvider, so the public routes inherit them. Zod's classic API doesn't tree-shake. Supabase's createClient always constructs realtime and storage. The native runtime is imported even on the web.

**Suggested fix**

- Make AppLayout lazy, or move RequireAuth, AppLayout and the debate dialogs into one lazy app-shell chunk.
- Have AuthProvider import the store hydrators dynamically after a session exists, or move hydration into the app shell.
- Parse announcements without zod, or lazily.
- Import native-runtime and native-app-url-listener only when isNativeApp() is true.
- Optionally build the client from @supabase/auth-js, postgrest-js and functions-js, without realtime and storage.
- Extend check-build-boundaries.mjs to forbid src/lib/stores/session-store.ts, zod and @supabase/realtime-js in the LandingPage and LoginPage static graphs, and add an entry byte budget.

**Who it hits**

Every signed-out visitor (landing, login, shared links), especially on mobile networks. It also delays first paint of the app shell for signed-in users.

**Independent check**

Sub-fix of perf-runtime-1: a lazy app shell and store hydrators, zod out of the entry, no realtime or storage, and Capacitor only on native. Confirmed: zod 88.5 KB, stores 45 KB, debate UI 12.3 KB, realtime-js 32 + phoenix 25 + storage-js 22 + iceberg 5 KB, @capacitor/core 8 KB plus plugin definitions, all in the entry. announcements.ts:2 and sparring-store.ts:3 import zod. client.ts uses createClient from @supabase/supabase-js. Grepping src outside the Workspace finds no .channel(, realtime or storage.from. native-runtime.ts and native.ts are statically imported from main.tsx:6-10. Landing LCP on slow 4G was not re-measured.

**Evidence files**

[entry-chunk-composition.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-chunk-composition.json), [entry-import-chains.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-import-chains.txt), [bundle-largest-chunks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/bundle-largest-chunks.txt), [fonts-render-blocking.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/fonts-render-blocking.json), [source-map-explorer-local-entry.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/source-map-explorer-local-entry.json), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json)


### render-bundle-7: Generate downloads reactflow + d3 (41 KB transferred) to read one string constant, and the boundary guard meant to stop this misses @reactflow/*

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `generate-imports-reactflow-enum`

**Where**

- src/pages/GeneratePage.tsx:15 (import { MarkerType, ... } from 'reactflow'; used at :287, :316, :349)
- src/lib/stores/session-store.ts:3 (type-only, fine)
- scripts/check-build-boundaries.mjs:24 (forbiddenFeature regex lists 'reactflow' but the code lives in node_modules/@reactflow/core)

**What the reviewer saw**

GeneratePage's chunk statically imports index-BQ_dqVwH.js (126.17 KB minified, 40.51 KB gzip; @reactflow/core 167 KB rendered plus d3-selection, d3-transition, d3-zoom and d3-drag). Chain: GeneratePage.tsx -> reactflow/dist/esm/index.mjs -> @reactflow/core.

On staging, /app/generate loads /assets/index-D92CwHPC.js at 41.4 KB, and its body contains react-flow__* class names. MarkerType.ArrowClosed is the string 'arrowclosed'. Because FlowchartPage shares the module, Rollup puts all of reactflow core in a shared chunk that Generate loads up front.

Testing the forbiddenFeature regex against the bundle graph: it matches no @reactflow/core module, so npm run build passes even though GeneratePage, one of its checked initial routes, pulls reactflow.

**Why it happens**

A value import of an enum from the reactflow barrel, combined with a regex that only names the barrel package and not the @reactflow/* packages that hold the code.

**Suggested fix**

In GeneratePage.tsx, use import type { Node, Edge } from 'reactflow' and the literal markerEnd: { type: 'arrowclosed' as MarkerType } (or a local const). Change the regex in check-build-boundaries.mjs to (?:@reactflow\/[^/]+|reactflow)\/ and add d3-zoom. The same file should also catch react-markdown or framer-motion where those are not wanted.

**Who it hits**

Every Generate visit, Generate being one of the most used tools: about 41 KB brotli plus parse and compile, for nothing. The broken guard would let other regressions through too.

**Independent check**

GeneratePage.tsx:15 has a value import of MarkerType, used at :287, :316 and :349. My local build's GeneratePage closure includes index-BQ_dqVwH.js (126 KB min, 40.5 KB gzip, @reactflow/core plus d3). Applying scripts/check-build-boundaries.mjs:24's forbiddenFeature regex to the Generate closure's 661 modules gives 0 matches even though @reactflow/core is present, so the guard is blind. GeneratePage is one of its checked initial routes (:29). On staging, the first Generate visit loads 36 script files (nav.jsonl).

**Evidence files**

[entry-import-chains.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-import-chains.txt), [load-nojam-_app_generate-pro-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-nojam-_app_generate-pro-mobile.json), [bundle-largest-chunks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/bundle-largest-chunks.txt), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json), [bundle-graph-local-build-40738ea.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-graph-local-build-40738ea.json), [nav.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/nav.jsonl)


### render-bundle-8: Sparring loads recharts (95 KB transferred) before a round starts; only the end-of-round radar chart needs it

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `sparring-scorecard-eager-recharts`

**Where**

- src/pages/SparringPage.tsx:12 (static import of SparringScorecard)
- src/components/features/sparring/SparringScorecard.tsx:4 (recharts RadarChart)
- src/pages/SparringPage.tsx:330

**What the reviewer saw**

In the local build, SparringPage statically imports generateCategoricalChart-*.js (364.63 KB minified, 99.02 KB gzip: recharts, lodash, decimal.js-light, react-smooth, d3-scale). Chain: SparringPage.tsx -> SparringScorecard.tsx -> recharts.

On staging, /app/sparring loads /assets/generateCategoricalChart-BkyWxGBS.js at 95.3 KB, the largest route-level download after the entry. It also loads markdown-*.js (37.8 KB) before any speech exists. The scorecard renders only when session.scorecard exists, after a completed round.

**Why it happens**

The scorecard, and recharts with it, is imported eagerly into the Sparring route chunk.

**Suggested fix**

Load SparringScorecard with React.lazy, and prefetch it when the last speech is submitted so judging stays instant. Or draw the 5-axis radar as a small hand-written SVG and drop recharts from Sparring entirely; AdminPage would then be recharts' only user.

**Who it hits**

Every Sparring visit, mostly on phones, pays about 95 KB brotli plus parse before the setup screen is needed.

**Independent check**

SparringPage.tsx:12 statically imports SparringScorecard, which imports recharts at line 4; the scorecard renders only at :330. SparringPage's static closure includes generateCategoricalChart-*.js at 365 KB min / 99 KB gzip, plus the markdown chunk at 116 KB. Total closure is 637 KB min / 163 KB br. The first Sparring visit takes median 451 ms on mobile at CPU 4x.

**Evidence files**

[load-nojam-_app_sparring-pro-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-nojam-_app_sparring-pro-mobile.json), [entry-import-chains.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-import-chains.txt), [bundle-largest-chunks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/bundle-largest-chunks.txt), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json), [nav.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/nav.jsonl)


### perf-runtime-9: Render-blocking Google Fonts @import chain (three families, two extra origins) delays first paint; Lora is downloaded as CSS on every load but never used

**Severity:** low · **Verdict:** confirmed · **Root cause:** `google-fonts-css-import`

**Where**

- src/index.css:1-3 (@import of Inter, Lora and Space Mono from fonts.googleapis.com)
- tailwind.config.ts:80-113 (font-serif = Lora, but no font-serif class exists in src)
- index.html (no preconnect to fonts.googleapis.com or fonts.gstatic.com)

**What the reviewer saw**

Mobile cold /app waterfall: index CSS 248-597 ms, then fonts CSS (Inter, Lora, Space Mono) 603-805 ms, which the CSS @import blocks on. FCP of the startup card is 860 ms (median 3), roughly 250 ms later than the CSS alone would allow. The Inter woff2 (47.8 KB) is requested only at 3,028 ms and lands at 3,565 ms, so text renders in the fallback font and then swaps (a small '#text 177->176' shift is recorded).

The built CSS has no font-family:Lora rule; only the @import and an unused CSS variable remain. document.fonts reports Lora 400-700 'unloaded' on every route measured. Space Mono is used only on Timer, Sparring, Crossfire and Admin.

**Why it happens**

Fonts are pulled with CSS @import from a third-party origin. @import serialises behind the main stylesheet and blocks rendering, and the serif family was configured but never adopted.

**Suggested fix**

1. Delete the Lora @import and the serif fontFamily entry.
2. Self-host Inter (variable woff2, latin + latin-ext for Hungarian) under /assets with font-display: swap and <link rel=preload as=font crossorigin>, plus a size-adjusted fallback (@font-face with size-adjust) to avoid the swap shift.
3. Load Space Mono only from the pages that use it, or swap it for ui-monospace.

**Who it hits**

Every load. The loading card and first text appear later on slow networks, and two third-party origins need DNS, TCP and TLS on cold visits.

**Independent check**

The staging CSS index-BMQPADaz.css starts with three @import rules for Inter, Lora and Space Mono. Mobile CPU 4x + fast4g: the app CSS loads 321-666 ms and the font CSS requests start only after it finishes (667-842 ms). Two first-visit runs show the same chain. 'Lora' appears only in the @import and the unused --font-serif variable; there is no font-serif class in src (tailwind.config.ts:94). I did not quantify the FCP penalty. The three imports run in parallel, so Lora adds a wasted request but no extra serial round trip. render-bundle-9 is the same finding.

**Evidence files**

[matrix.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix.jsonl), [matrix-medians.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix-medians.json), [last-pro-mobile-_app-cpu4-fast4g.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-mobile-_app-cpu4-fast4g.json), [loads.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/loads.jsonl)


### perf-runtime-10: Settings page jumps 52 px on every load: the subscription card renders one 'Loading…' line, then grows after three sequential queries

**Severity:** low · **Verdict:** confirmed · **Root cause:** `settings-subscription-card-no-skeleton`

**Where**

- src/pages/SettingsPage.tsx:200-235 (subscription.loading ? one line : badge + button + description)
- src/hooks/use-subscription.ts (user_settings -> subscriptions -> ai_requests, awaited one after another)

**What the reviewer saw**

Layout shift on every /app/settings load, warm or cold. Sources: 'Global Settings' and 'Account' cards move from y 351 to 403 on desktop and from 396 to 448 on mobile.
- Desktop CLS: 0.0161 warm, 0.0163 cold.
- Mobile CLS: 0.031 warm and cold.
- Single runs per profile and phase, but the shift repeated in all 4.

The sequential chain on tool and settings pages: subscriptions 1,014-1,060 ms, then pins 1,064-1,105, then ai_requests 1,092-1,151 (desktop cold /app/sparring).

**Why it happens**

No reserved space while the subscription query is pending, and the query is a chain of three awaits.

**Suggested fix**

Render a skeleton with the final card height (badge + button + one text line) while loading, and parallelise the queries in use-subscription.ts (see perf-runtime-5).

**Who it hits**

Every visit to Settings. Small visually, but a visible jump under the user's eyes, which is exactly the kind of glitch Adam asked about.

**Independent check**

/app/settings desktop cold, 3/3 runs: a 0.0161-0.0163 layout shift in which the Global Settings and Account cards move from y 351 to 403 and from 553 to 605 (52 px) once the plan badge renders (SettingsPage.tsx:200-235). The sequential user_settings, subscriptions, ai_requests chain in use-subscription.ts is reproduced: 614-731, then 750-804, then 823-866 ms. Mobile was not re-measured.

**Evidence files**

[matrix.jsonl](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix.jsonl), [last-pro-desktop-_app_settings.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app_settings.json)


### perf-runtime-11: Landing page LCP is held back about 0.8 s by the hero heading's opacity-0 entrance animation

**Severity:** low · **Verdict:** confirmed · **Root cause:** `hero-h1-opacity-entrance`

**Where**

- src/components/landing/Hero.tsx:47-50 (motion.h1 initial opacity 0, y 20, duration 0.6, delay 0.1)

**What the reviewer saw**

Medians of 3, signed out:
- Desktop warm: h1 in the DOM and laid out at 264 ms, LCP (the same h1) 1,124 ms.
- Desktop cold: content 652 ms, LCP 1,464 ms.
- Mobile warm: 1,149 vs 1,892 ms.
- Mobile cold: 5,114 vs 5,884 ms.

Chrome excludes opacity-0 elements from LCP until they become visible, so the 100 ms delay plus the 600 ms fade is added to every landing LCP.

**Why it happens**

The entrance animation starts the LCP element fully transparent.

**Suggested fix**

Keep the h1 opaque: animate only transform (initial={{ y: 12 }}) or start at opacity 0.99. Alternatively, drop the h1 from the stagger and animate the subtitle and CTA only.

**Who it hits**

SEO and Core Web Vitals for the landing page, the first page new students and teachers see. Field LCP would improve by about 0.7-0.8 s at no cost.

**Independent check**

Hero.tsx:47-50 starts the h1 at opacity 0 with a 0.1 s delay and a 0.6 s fade. Signed-out mobile, h1 laid out vs LCP (the same h1): unthrottled 493/680/632 ms vs 1,344/1,404/1,380 ms. CPU 4x: 1,978/2,659/1,679 ms vs 2,840/3,504/2,472 ms. In every run, LCP lands about 720-860 ms after the h1 is laid out.

**Evidence files**

[matrix-medians.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/matrix-medians.json), [last-null-mobile-_.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_.json), [last-null-mobile-_-cpu4.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-null-mobile-_-cpu4.json)


### perf-runtime-12: If production sets VITE_SENTRY_DSN and VITE_POSTHOG_KEY, every visit also downloads ~208 KB br (Sentry 471 KB with Replay and Feedback, PostHog 269 KB), and Sentry Replay buffers the DOM for every session

**Severity:** low · **Verdict:** partly · **Root cause:** `observability-sdks-full-bundles`

**Where**

- src/lib/observability.ts:146-172 (Sentry.init with browserTracingIntegration + replayIntegration, replaysOnErrorSampleRate 1.0)
- src/lib/observability.ts:174-189 (posthog-js init)
- src/main.tsx:12-19, 36-40 (loaded on load + idle for every web visitor)

**What the reviewer saw**

Staging has no DSN or key, so this was not measured live. A local build of 40738ea with dummy values emits:
- assets/index-*.js 471 KB / 132 KB br (@sentry/browser, replay, replay-canvas, feedback, react);
- module-*.js 269 KB / 76 KB br (posthog-js).

The code requests Replay with replaysOnErrorSampleRate 1.0, which keeps the rrweb recorder buffering in every session. In the worst case this stacks with Jam (perf-runtime-2): two session recorders plus a bug-capture iframe after every load.

docs/operations.md shows production uploads Sentry source maps, which suggests the DSN is set; whether the PostHog key is set is unknown.

**Why it happens**

Full-featured SDK bundles are loaded for everyone, including integrations that may be unused (Feedback, Replay canvas), with no sampling at the load step.

**Suggested fix**

1. Confirm which keys production sets.
2. Import from @sentry/browser with explicit integrations instead of @sentry/react's defaults, or lazy-load replayIntegration only when an error happens (Sentry supports adding Replay after init).
3. Drop Feedback and Replay-canvas.
4. Load PostHog only on the first captureProductEvent.

**Who it hits**

Production visitors only, after load. It adds data use and main-thread work on phones in the first seconds of interaction.

**Independent check**

Code confirmed: observability.ts:156-168 sets browserTracingIntegration plus replayIntegration with replaysSessionSampleRate 0 and replaysOnErrorSampleRate 1.0, which runs Replay in buffer mode in every session. PostHog loads at :176-192. My build of 40738ea with a dummy VITE_SENTRY_DSN and VITE_POSTHOG_KEY emitted a Sentry chunk of 471 KB min / 132 KB br (core, browser, replay, replay-canvas, feedback, react) and a posthog-js chunk of 269 KB / 76 KB br. Whether production sets these variables cannot be checked from here: staging has neither and docs/development.md only names them. The impact therefore stays conditional.

**Evidence files**

[bundle-graph-with-dummy-sentry-dsn.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/perf-runtime/bundle/bundle-graph-with-dummy-sentry-dsn.json), [bundle-graph-dummy-sentry-posthog.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-graph-dummy-sentry-posthog.json)


### render-bundle-9: Google Fonts come in through chained, render-blocking CSS @import, and the Lora family is imported but never used

**Severity:** low · **Verdict:** confirmed · **Root cause:** `google-fonts-css-import` · **Same fix as:** perf-runtime-9

**Where**

- src/index.css:1-3 (@import Inter, Lora, Space Mono)
- src/index.css:57 (--font-serif Lora)
- tailwind.config.ts:94 (serif family, no font-serif usage anywhere in src)

**What the reviewer saw**

The built CSS starts with three @import url(fonts.googleapis.com/...) rules. Staging, / signed out, Pixel 7, slow 4G, 4x CPU: index.css loads 526 to 1,696 ms, and the three font CSS requests start only after it finishes (1,703 to 2,283 ms). All are renderBlockingStatus 'blocking'. FCP is 2,320 ms (3 runs: 2,340 / 2,320 / 2,304).

With the font CSS answered instantly, FCP median was 2,176 ms (2,176 / 2,012, plus one noisy 4,428 run), roughly a 150 ms penalty. Lora's CSS is the largest of the three at 18.2 KB (Inter 9.8 KB, Space Mono 2.5 KB). No font-serif class appears anywhere in src (0 usages), and the built CSS never uses the Lora font-family. Space Mono is used only by the Timer, Crossfire and Sparring setup digits.

**Why it happens**

Fonts are loaded with CSS @import, which the browser discovers only after the app CSS downloads, and an unused family was left in.

**Suggested fix**

Delete the Lora import and the serif token. Load Inter from index.html with <link rel=preconnect> and a stylesheet link, or better, self-host the Inter woff2 files with <link rel=preload> and font-display swap. Load Space Mono only where it is used, or use a system monospace with tabular-nums.

**Who it hits**

Every first visit pays an extra render-blocking round trip to fonts.googleapis.com plus 18 KB of unused CSS. It is noticeable on slow mobile networks.

**Independent check**

Same as perf-runtime-9. The built CSS has three @import rules, and the font CSS requests start only after the app CSS finishes. 'Lora' appears only in the @import and the unused --font-serif variable. I did not reproduce the roughly 150 ms FCP delta.

**Evidence files**

[fonts-render-blocking.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/fonts-render-blocking.json), [fonts.mjs](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/scripts/fonts.mjs), [last-pro-mobile-_app-cpu4-fast4g.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-mobile-_app-cpu4-fast4g.json)


### render-bundle-10: Tab icon is a 1024x1024, 279 KB PNG (favicon.ico is the same 279 KB PNG)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `oversized-icons-precached` · **Same fix as:** perf-runtime-7 · **Known in plan:** next-15 #15 (manifest icons; the oversized tab icon is not mentioned there)

**Where**

- index.html:17 (<link rel="icon" href="/favicon.png">)
- public/favicon.png (1024x1024, 279 KB)
- public/favicon.ico (279 KB PNG-in-ICO)
- public/manifest.webmanifest (only icon is the 1024 PNG)

**What the reviewer saw**

PNG headers show public/favicon.png is 1024x1024 and 285,696 bytes on disk. public/favicon.ico is the same PNG payload in an ICO wrapper. index.html links the PNG as the tab icon, so a real browser fetches 279 KB on first visit to draw a 16 to 32 px icon. Headless Chromium skips favicons, so this comes from the files and markup, not a measurement. A 72 px icon (favicon-72.png, 4 KB) already exists and is used in the navbars.

**Why it happens**

The source artwork is used directly as the favicon and the manifest icon.

**Suggested fix**

Generate 32 and 48 px favicons (or an SVG icon), a 180 px apple-touch-icon, and 192, 512 and maskable manifest icons. Point index.html at the small icon. Shrink favicon.ico to a real multi-size ICO of 32 px and below.

**Who it hits**

First visit for every visitor wastes about 279 KB, and crawlers asking for /favicon.ico get 279 KB too.

**Independent check**

public/favicon.png is a 1024x1024 PNG of 279,465 B. Correction: public/favicon.ico is byte-identical to it (cmp), a raw PNG with a .ico name and no ICO wrapper. It is 279,465 B on disk, not 285,696. index.html:17 links the PNG as the tab icon. The manifest lists only the 1024 PNG. Same fix as perf-runtime-7.

**Evidence files**

[favicon.png](/home/codex/Projects/DebateLab/public/favicon.png), [favicon.ico](/home/codex/Projects/DebateLab/public/favicon.ico), [index.html](/home/codex/Projects/DebateLab/index.html), [curl-icon-headers.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/curl-icon-headers.txt)


### render-bundle-11: Landing page and Crossfire load the full framer-motion runtime (41.6 KB transferred) for simple fade and slide effects

**Severity:** low · **Verdict:** confirmed · **Root cause:** `framer-motion-full-runtime`

**Where**

- src/components/landing/Navbar.tsx:3, Hero.tsx:3, Features.tsx:2, SocialProof.tsx:2, DeepDive.tsx:2, FAQ.tsx:8, HowItWorks.tsx:2, UseCases.tsx:2, Pricing.tsx:2, WhatsNew.tsx:2, FinalCTA.tsx:2
- src/pages/CrossfirePage.tsx:3

**What the reviewer saw**

Chunk proxy-*.js is 121.32 KB minified and 39.68 KB gzip (motion-dom 283 KB, framer-motion 83 KB rendered). Its only static importers are LandingPage and CrossfirePage. On staging, / loads proxy-rtEpRdpA.js at 41.6 KB, the largest script after the entry. GeneratePage and AskChat import only useReducedMotion, which is a 0.44 KB chunk.

**Why it happens**

The code uses the full motion component rather than the m component with LazyMotion and domAnimation.

**Suggested fix**

Wrap the landing page and Crossfire in <LazyMotion features={domAnimation}> and replace motion.* with m.*, which typically cuts the runtime to about 15 to 20 KB. Or replace the whileInView fades with the existing CSS motion- classes and an IntersectionObserver.

**Who it hits**

Every signed-out landing visit (it sits on the LCP path on slow networks) and every Crossfire visit.

**Independent check**

proxy-*.js (framer-motion and motion-dom) is 121 KB min / 39.7 KB gzip in my build. It sits in the static closures of LandingPage and CrossfirePage only, not GeneratePage or AskPage. Landing's closure is 169 KB min / 48 KB br. I did not verify the LazyMotion size estimate.

**Evidence files**

[load-_-anon-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-_-anon-mobile.json), [bundle-largest-chunks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/bundle-largest-chunks.txt), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json)


### render-bundle-12: Hydration makes two redundant /auth/v1/user round trips that delay Current Debate data, and selects every row of 9 tables on every app load

**Severity:** low · **Verdict:** confirmed · **Root cause:** `eager-hydration-network` · **Same fix as:** perf-runtime-5

**Where**

- src/lib/stores/debate-store.ts:127 (await supabase.auth.getUser() before fetching debates)
- src/lib/stores/sparring-store.ts:481 (same before sparring_sessions)
- src/lib/supabase/AuthProvider.tsx:133-141 (already has userId when it calls the hydrators)
- session-store hydrateFromServer (select=* without limit on cases, attacks, brainstorms, factoids, chats, flowcharts, sources, source_folders, plus messages)

**What the reviewer saw**

On staging /app, signed-in pro account, every load made 2x GET /auth/v1/user. debates and current_debates (and sparring_sessions) start only after getUser returns, while the session-store tables start immediately.

Timing across 4 runs:
- debates started at 842 vs cases at 560; getUser took 270 to 310 ms.
- 487 vs 398 ms.
- 491 vs 389 ms.
- An earlier run: debates at 2,177 ms vs 521 ms, when getUser took about 1.6 s.

The session-store requests are select=*&order=created_at.desc with no limit, so each app load downloads the full text of every saved result and source the user owns.

**Why it happens**

Each store fetches the user again (a network call) instead of taking the userId AuthProvider already has. Hydration reloads everything with no pagination or column selection.

**Suggested fix**

Pass the userId into hydrate and hydrateSavedSessions, or use supabase.auth.getSession() or the cached session, which needs no round trip. Later, fetch list columns (id, title, created_at, debate_id) for the Current Debate first and load full outputs on demand.

**Who it hits**

Every signed-in app load. The Current Debate strip and dialogs fill one round trip later than needed, and bandwidth grows with history.

**Independent check**

Reproduced on every cold signed-in load: 2 GET /auth/v1/user, and debates, current_debates and sparring_sessions start only after them (desktop: getUser 596-754 ms, debates 712 ms, while cases starts at 588 ms). The session-store queries use select=* with no limit. Same fix as perf-runtime-5, and its getUser part is also perf-runtime-3 fix #1.

**Evidence files**

[hydration-waterfall.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/hydration-waterfall.json), [supabase-requests-_app.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/supabase-requests-_app.json), [last-pro-desktop-_app.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/raw/last-pro-desktop-_app.json)


### render-bundle-13: Hidden Workspace and the Capacitor runtime still ship to the web app (166 Workspace references across 8 tool pages and client.ts; Capacitor in the entry)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `workspace-capacitor-shipped-to-web`

**Where**

- src/pages/GeneratePage.tsx, AttackPage.tsx, BrainstormPage.tsx, FactoidsPage.tsx, AskPage.tsx, CrossfirePage.tsx, SparringPage.tsx, FlowchartPage.tsx (useWorkspaceToolScope and workspace.context branches)
- src/lib/ai/client.ts (35 workspace references)
- src/lib/workspace/tool-context.ts and practice-client.ts (shipped in chunk tool-context-*.js)
- src/lib/workspace/artifact-save-queue.ts (in VoiceModeToggle chunk)
- src/main.tsx:7-10, src/native-runtime.ts, src/native-app-url-listener.ts, src/lib/native.ts (entry)

**What the reviewer saw**

Production does not set VITE_COLLABORATION_URL, so App.tsx:247 never registers the Workspace routes, and workspace.context comes only from route state set by WorkspacePage, which means it is always null on the web. Still, every tool chunk imports WorkspaceToolScope (1.1 KB) and tool-context plus practice-client (5.1 KB rendered, with a zod schema).

Workspace references per file: GeneratePage 12, AttackPage 10, BrainstormPage 8, FactoidsPage 8, AskPage 11, CrossfirePage 34, SparringPage 42, FlowchartPage 6, ai/client.ts 35.

The entry also carries @capacitor/core (23.7 KB rendered), the plugin definitions, native-runtime and native-app-url-listener: 12.5 KB minified that does nothing in a browser. The tiptap and yjs chunk (553 KB) is correctly never loaded in production.

**Why it happens**

Workspace integration was threaded into every tool, and native support into main.tsx, without build-time gating.

**Suggested fix**

Simplest: move Workspace launch handling behind one lazily loaded adapter, or delete the workspace.context branches from the tool pages and client.ts while Workspace is shelved (the git history keeps them). Import the native runtime with import() only when isNativeApp() is true, or move it into a capacitor-mode-only entry.

**Who it hits**

Mostly code complexity: the tool pages are harder to change and review. The web bundle carries about 12 KB minified of Capacitor and a few KB of Workspace code per tool.

**Independent check**

In scope under 'still ships to the web app'. grep -ci workspace counts match exactly: Generate 12, Attack 10, Brainstorm 8, Factoids 8, Ask 11, Crossfire 34, Sparring 42, Flowchart 6, ai/client.ts 35. In the bundle graph, the Generate, Ask and Sparring closures each load WorkspaceToolScope (0.8 KB) and tool-context with practice-client (3.5 KB). Sparring also pulls artifact-save-queue through VoiceModeToggle. The entry contains @capacitor/core, the browser, app, haptics, keyboard and status-bar plugins, native.ts, native-runtime.ts, native-app-url-listener.ts and workspace invite-handoff and collaboration-config. The Capacitor part overlaps render-bundle-6's fix.

**Evidence files**

[bundle-largest-chunks.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/bundle-largest-chunks.txt), [entry-import-chains.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/entry-import-chains.txt), [bundle-graph-local-build-40738ea.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-graph-local-build-40738ea.json), [bundle-analysis-local-build.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-1/bundle-analysis-local-build.json)


### render-bundle-14: next-15 #12 leftovers still open: server-only and native-tooling deps in client dependencies, three copies of the control-character sanitizer, and knip ignores unused exports

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `next-15-12-dep-and-dead-code-cleanup` · **Known in plan:** next-15 #12

**Where**

- package.json:93 (pg; used by services/collaboration and e2e/full-stack/account-deletion.spec.ts)
- package.json:49 (@hocuspocus/server; only services/collaboration/src/server.ts)
- package.json:42, :45 (@capacitor/cli, @capacitor/ios in dependencies)
- package.json:2 (name vite_react_shadcn_ts)
- supabase/functions/_shared/prompts/context.ts:45, supabase/functions/ai/request.ts:29, supabase/functions/ai-stream/index.ts:67
- knip.json include list (no exports or types)

**What the reviewer saw**

The same regex /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g appears in all three files (two of them also strip zero-width characters). Running npx knip@6.40.0 --include exports,types,duplicates reports 37 unused exports and 22 unused exported types, for example unused UI-kit exports (CardFooter, DialogClose, SelectGroup and friends, SheetTrigger), src/components/ui/sonner.tsx toast, src/lib/ai/client.ts classifyAIError and isAIProviderError, and 10 unused sparring schema exports. knip's 'ai unused devDependency' claim is a false positive: ai is a peer dependency of e2e and @openrouter/ai-sdk-provider.

**Why it happens**

Cleanup item 12 from plans/2026-10-01-next-15.md has not been done.

**Suggested fix**

- Move pg and @capacitor/cli to devDependencies (pg is still needed by the e2e spec).
- Move @hocuspocus/server to a services/collaboration package.json or to devDependencies.
- Rename the package.
- Share one sanitizer in supabase/functions/_shared.
- Add exports and types to knip.json's include list, then delete the dead exports.

**Who it hits**

Repo hygiene and install size; no user-facing effect.

**Independent check**

Real on main at 40738ea, but several details in the finding are wrong. Re-read the code:
- package.json:2 still has the name vite_react_shadcn_ts.
- pg (package.json:93) and @hocuspocus/server (:49) are still in dependencies. pg is imported only by services/collaboration/src/index.ts, e2e/full-stack/account-deletion.spec.ts and .claude/skills/verify-debatelab/recipes/account-data.spec.ts. The reviewer missed that third importer. @hocuspocus/server is imported only by services/collaboration/src/server.ts, and services/collaboration has no package.json of its own.
- The control-character regex appears three times: supabase/functions/_shared/prompts/context.ts:46, ai/request.ts:30 and ai-stream/index.ts:68 (the eslint-disable comments sit one line above each).
- eslint.config.js:23 still sets @typescript-eslint/no-unused-vars to off. That is part of next-15 #12 too, and the reviewer did not list it.
- knip.json's include list has files, dependencies, devDependencies, unlisted and binaries, so knip never checks exports or types.

Corrections:
(1) The knip counts are mislabeled. The reviewer used --reporter compact, which prints one line per file. Running npx knip@6.40.0 --include exports,types,duplicates with the default reporter gives 89 unused exports (in 37 files) and 39 unused exported types (in 22 files).
(2) Most of the 89 are used inside their own file, so only the export keyword is dead: classifyAIError, isAIProviderError, RouteErrorBoundary, loadJamRecorder, SparringSessionSchema, ContentionSchema, validateSingleFile. Following the suggested fix ('delete the dead exports') literally would break those. The code that is truly unused is mostly shadcn leftovers: CardFooter, SheetTrigger/Close/Overlay/Portal, DialogClose/Portal/Overlay, SelectGroup/Label/Separator/ScrollUp/ScrollDown, AlertDialogPortal/Overlay, ScrollBar, and the sonner toast re-export. Part of the list is out-of-scope code (src/lib/workspace/*, src/lib/native.ts, native-runtime.ts, native-app-url-listener.ts) or test fixtures (agentic/support/fixtures.ts).
(3) @capacitor/ios in dependencies is where Capacitor's install docs put platform packages (from memory, not re-checked). Only @capacitor/cli is documented as a dev dependency. Neither is in plan item #12, and the review plan puts the iOS shell out of scope and expects Capacitor removal to be its own cleanup. Drop package.json:45 from this finding.
(4) The 'ai' false positive holds: package-lock.json lists ai as a peer dependency of node_modules/@openrouter/ai-sdk-provider and node_modules/e2e. The right knip fix is ignoreDependencies: ["ai"], not removing ai. knip's 'Unlisted binaries: knip' line is an artifact of the stale local node_modules (knip, e2e and ai are not installed), not a repo problem.
(5) Merging the sanitizers into one helper changes behavior slightly: context.ts strips only C0 control characters and DEL, while the other two also strip zero-width characters (​-‍﻿). Context attributes would start losing zero-width characters too. That is harmless and probably desirable, but say it in the PR.

Impact: none for users. Vite bundles only what is imported and tree-shakes unused exports, and Vercel installs devDependencies for the build anyway, so moving pg or @capacitor/cli does not change install size there. Nit is the right severity. knownInPlan: next-15 #12.

**Evidence files**

[knip-with-exports.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/knip-with-exports.txt), [knip-exports-types-duplicates.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/knip-exports-types-duplicates.txt)


### render-bundle-15: About 50 chunks under 1.5 KB mean dozens of tiny script requests per route (46 on /app/generate)

**Severity:** nit · **Verdict:** partly · **Root cause:** `lucide-icons-chunk-per-module`

**Where**

- vite.config.ts build options (no output.experimentalMinChunkSize or manualChunks)
- lucide-react icon imports shared across routes

**What the reviewer saw**

The local build emits 116 chunks; 50 of them have under 1.5 KB of rendered code, mostly single lucide icons such as sparkles, zap, arrow-right, git-branch, timer, dumbbell, brain, swords, users, crown and crosshair. On staging, / requested about 15 icon chunks of 0.3 to 1.6 KB, and /app/generate loaded 46 scripts (529 KB total, of which 367.7 KB is the entry).

**Why it happens**

Rollup gives each module shared between dynamic entries its own chunk, and every lucide icon is its own module.

**Suggested fix**

Set build.rollupOptions.output.experimentalMinChunkSize (for example 4,000), or add a manualChunks rule that groups lucide-react icons into one shared chunk.

**Who it hits**

Small. Per-request overhead and preload fan-out on HTTP/2, most visible on high-latency mobile connections.

**Independent check**

The counts are real, but the claimed cost on high-latency mobile did not reproduce, and both suggested fixes fall short.

Measured:
- My local build (npx vite build --outDir in scratch) emits 116 JS chunks, 54 of them under 1.5 KB, 36 of which are single lucide icons. Vite's own report counts 55 under 1.5 kB. vite.config.ts build options have no rollupOptions.
- Staging, Pixel 7, signed out: / loads 20 own scripts, 15 of them icon chunks of 0.3 to 1.4 KB encoded, about 8.5 KB in total.
- Staging /app/generate as pro: 43 own scripts on every run (the reviewer's 46 also counted the 2 Vercel insights scripts and the Cloudflare beacon), about 540 KB encoded, 27 to 31 of them under 1.5 KB encoded.
- Local file hashes differ from staging because of the release and Sentry environment, but the chunk structure matches.

Why the cost is not real: all route chunks go out in one flat wave through Vite's preload helper, not a waterfall. Unthrottled, they start within 7 ms of each other. With fast-4G CDP throttling (150 ms RTT, 1.6 Mbps), 3 runs at load averages of 2.1 to 4.7 (the box was noisy):
- The 42 route chunks start within 50 to 74 ms of each other.
- All on h2.
- The sub-1.5 KB chunks total 18 to 26 KB encoded, and that figure includes response headers.
- The last small chunk finishes a median 499 ms after the wave starts. The largest chunks, index-D92 (42 KB) and markdown (39 KB), finish at a median 2031 ms.

So the tiny chunks are never on the critical path. Merging them would save only their per-response header bytes, about 200 B each, roughly 6 to 8 KB per route, or about 30 ms at 1.6 Mbps. Assets are content-hashed and cached immutable, so even that is a first-visit cost.

Fix corrections, each tested by building with a scratch config that merges the repo config:
(a) experimentalMinChunkSize: 4000 goes from 116 to 98 chunks and leaves 33 of the 36 icon chunks. Each lucide icon module calls createLucideIcon(...) at top level with no PURE annotation, so Rollup treats the chunk as side-effectful and will not merge it, even though package.json says sideEffects: false.
(b) A manualChunks rule that puts every lucide icon in one chunk gives 81 chunks (20 under 1.5 kB). But the icons chunk becomes a <link rel=modulepreload> in index.html: 37.9 KB raw / 12.5 KB gz on every first page, including the signed-out landing. The entry shrinks by only 5.0 KB gz, so the critical path grows by about 7.5 KB gz everywhere. Landing today loads about 8.5 KB of icons over 15 parallel requests that are off the critical path.

Recommendation: no action, or at most group only the icons the entry does not use. It is not a free win. Severity stays nit. Not a duplicate of render-bundle-14.

**Evidence files**

[load-_-anon-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-_-anon-mobile.json), [load-nojam-_app_generate-pro-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/load-nojam-_app_generate-pro-mobile.json), [build-sizes-excerpt.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/render-bundle/build-sizes-excerpt.txt), [chunk-counts.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/chunk-counts.txt), [build.log](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/build.log), [build-min4000.log](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/build-min4000.log), [build-icons.log](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/build-icons.log), [scripts-_-anon-mobile-run1.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_-anon-mobile-run1.json), [scripts-_app_generate-pro-mobile-run1.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_app_generate-pro-mobile-run1.json), [scripts-_app_generate-pro-mobile-run2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_app_generate-pro-mobile-run2.json), [scripts-_app_generate-pro-mobile-fast4g-run1.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_app_generate-pro-mobile-fast4g-run1.json), [scripts-_app_generate-pro-mobile-fast4g-run2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_app_generate-pro-mobile-fast4g-run2.json), [scripts-_app_generate-pro-mobile-fast4g-run3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/scripts-_app_generate-pro-mobile-fast4g-run3.json), [scripts-_app_generate-pro-1.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/raw/scripts-_app_generate-pro-1.png), [scripts-_-anon-1.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-perf-2/raw/scripts-_-anon-1.png)

