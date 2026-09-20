# Smooth navigation baseline

Captured 2026-09-19 from merged-main application source at
`origin/main` commit `b2ba178dee148d06d9bf89793f044add69d705b8`. The baseline
harness was committed at `c68c6c3` before this round-1 accounting correction;
the follow-up commit contains the corrected harness and recaptured evidence.

This is local Chromium lab evidence. It is not Lighthouse, field Core Web
Vitals, authenticated backend proof, staging proof, or a production result.
Protected routes use the credential-free stub session and blocked backend
requests, so they prove rendering and browser timing only.

## Reproduce

```text
export PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH
node --version                         # v22.23.2
npm --version                          # 12.0.2
npm ci
npm run build                          # writes dist/.vite/manifest.json and bundle-graph.json
BASELINE_RUN=run-1 node scripts/measure-navigation-performance.mjs
BASELINE_RUN=run-2 node scripts/measure-navigation-performance.mjs
```

Each matrix run allocates a verified free loopback port, starts a fresh Vite
development server, launches a browser, and terminates the exact Vite process
group. Final runs used ports `43915` and `42453`. No measurement dependency was
added.

Vite ran in development mode (`7.3.6`). The production graph came from
`npm run build`. Cold route contexts disable Chromium HTTP cache through CDP
and block service workers. First-visit clicks use a fresh browser cache. Warm
clicks use same-document destination navigation, same-document return to the
source, and the measured destination navigation. External API, analytics, Jam,
and auth requests are aborted at the browser boundary.

## Tool and browser profile

- Node `22.23.2`, npm `12.0.2`.
- Playwright `1.62.1`, Chromium `151.0.7922.34`.
- Desktop: `1280x800`, device scale factor `1`, touch disabled.
- Pixel 5: `393x727`, device scale factor `2.75`, touch enabled, Chromium's
  Pixel 5 Android user agent.
- Network: unthrottled loopback. CPU: Chromium default with no emulation.

## Matrix and boundary method

Each run contains 38 measurements:

- 16 cold refreshes: `/`, `/login`, `/app`, `/app/generate`, `/app/attack`,
  `/app/flowchart`, `/app/history`, and `/app/admin` on both profiles.
- 10 first-visit clicks and 10 warm clicks: landing CTA -> `/app`, Home ->
  Generate, Generate -> Attack, Home -> Flowchart, and Home -> History on both
  profiles.
- 2 deterministic delayed clicks: Generate -> Attack with the destination
  `AttackPage.tsx` request delayed exactly 750 ms.

The transition boundary is the capture-phase click event on the final
destination anchor. Opening a mobile menu or desktop More menu happens before
that event and is excluded. Resources, long tasks, and layout shifts are
filtered from that boundary. Request and byte totals count same-origin app
resources; browser-wide and external blocked-request counts remain in the JSON
for context. Route chunk timings are exact `PerformanceResourceTiming`
start/end/duration values after the boundary.

The real-content marker uses route-specific visible text such as `Generate`,
`Attack`, `Argument Flowchart`, and `History`, so the old route cannot count as
destination content while Suspense is pending. Warm records include the first
destination response transfer and prove the measured navigation issued no
second destination request after the same-document return.

The harness records click time, route chunk request timing, fallback and real
content frames, boundary-scoped long tasks, CLS/layout shifts, request and
byte totals, navigation timing, cache state, and app-shell DOM identity.

## Results

Run 1 desktop cold examples. Request counts are same-origin app resources;
the JSON also records browser-wide and external counts:

- `/`: fallback `2631.6 ms`, real content `2885.4 ms`, 133 app requests,
  7,455,868 transferred bytes, 3 long tasks, CLS `0.0000`.
- `/app`: fallback `544.4 ms`, real content `617.4 ms`, 119 app requests,
  7,142,818 transferred bytes, 1 long task, CLS `0.0000`.
- `/app/generate`: fallback `595.8 ms`, real content `940.5 ms`, 162 app
  requests, 8,770,111 transferred bytes, 2 long tasks, CLS `0.0029`.
- `/app/attack`: fallback `597.1 ms`, real content `883.7 ms`, 163 app
  requests, 8,366,088 transferred bytes, 2 long tasks, CLS `0.0110`.

Run 1 Pixel 5 cold examples:

- `/`: fallback `400.2 ms`, real content `620.1 ms`, 133 app requests,
  7,455,868 transferred bytes, 2 long tasks, CLS `0.0000`.
- `/app`: fallback `596.4 ms`, real content `652.4 ms`, 119 app requests,
  7,142,818 transferred bytes, 1 long task, CLS `0.0647`.
- `/app/generate`: fallback `547.3 ms`, real content `869.0 ms`, 162 app
  requests, 8,770,111 transferred bytes, 2 long tasks, CLS `0.1105`.
- `/app/attack`: fallback `591.2 ms`, real content `877.1 ms`, 163 app
  requests, 8,366,088 transferred bytes, 2 long tasks, CLS `0.1114`.

Run 1 desktop first-visit transitions:

- Home -> Generate: real content `345.0 ms`, route chunk `14.1 ms`, 44 app
  requests, 1,652,826 transferred bytes, shell identity `true`.
- Generate -> Attack: real content `184.8 ms`, route chunk `7.5 ms`, 8 app
  requests, 221,821 transferred bytes, shell identity `true`.
- Home -> Flowchart: real content `172.6 ms`, route chunk `15.0 ms`, 11 app
  requests, 799,036 transferred bytes, shell identity `true`.
- Home -> History: real content `141.3 ms`, route chunk `21.1 ms`, 10 app
  requests, 257,018 transferred bytes, shell identity `true`.

Warm transitions issued zero destination chunk requests and zero same-origin
app requests after the measured click. For example, the desktop Home ->
Generate warm visit recorded the warm `GeneratePage.tsx` response at
`78,506` transferred bytes during the warm destination visit, then measured no
destination request after returning to Home. This is same-document module-cache
proof, not a claim that an HTTP reload reused the browser cache.

Delayed destination evidence from run 1:

- Desktop `AttackPage.tsx`: request start `1132.7 ms`, end `1917.9 ms`,
  duration `785.2 ms`, transfer `33,746` bytes, fallback visible in 5 frames,
  real content `926.4 ms`, shell identity `true`.
- Pixel 5 `AttackPage.tsx`: request start `2117.2 ms`, end `2873.1 ms`,
  duration `755.9 ms`, transfer `33,746` bytes, fallback visible in 4 frames,
  real content `942.6 ms`, shell identity `true`.

## Repeatability

The documented tolerance is 35% relative timing variance or 50 ms absolute
variance, whichever is larger, plus 5% request/byte variance and 0.1 absolute
CLS variance. This accounts for local Vite transform, JIT, and shared-host
scheduling noise.

Run 1 versus run 2:

- maximum first fallback-frame relative variance: `47.14%`, with an absolute
  difference below `50 ms`;
- maximum first real-content-frame relative variance: `29.27%`;
- same-origin request count variance: `0.00%`;
- transferred, encoded, and decoded app-byte variance: `0.00%`;
- maximum absolute CLS difference: `0.0000`;
- every warm case proved same-document module-cache reuse with zero measured
  destination requests.

The two runs stayed inside the documented tolerance. The large relative
fallback percentage came from a small desktop Home -> Generate frame value,
not a large absolute delay.

## Manifest and bundle graph

The production build emitted 95 manifest entries and 94 JavaScript chunks. Each
run JSON contains the complete `manifestEntries`, `routeStaticGraphs`, and
`chunks` records. Every chunk includes raw bytes, gzip bytes, imports, normalized
module membership, static route membership, and dynamic-entry key. Criticality
is not inferred from filenames.

Static graph totals:

```text
index.html       1 file   1,138,188 raw     351,547 gzip
/                10 files 1,307,551 raw     403,940 gzip
/login           5 files  1,154,131 raw     357,485 gzip
/app             4 files  1,142,701 raw     353,345 gzip
/app/generate    31 files 1,530,191 raw     482,388 gzip
/app/attack      28 files 1,387,865 raw     436,303 gzip
/app/flowchart   16 files 1,333,376 raw     417,172 gzip
/app/history    13 files 1,179,425 raw     365,129 gzip
/app/admin      21 files 1,623,190 raw     488,345 gzip
```

Route-entry chunks:

```text
LandingPage.tsx   45,725 raw   11,133 gzip  29 modules
LoginPage.tsx      6,791 raw    2,207 gzip   1 module
HomePage.tsx       3,353 raw    1,254 gzip   1 module
GeneratePage.tsx  28,552 raw    8,162 gzip   5 modules
AttackPage.tsx    19,037 raw    5,369 gzip   5 modules
FlowchartPage.tsx 50,503 raw   16,770 gzip  47 modules
HistoryPage.tsx   11,679 raw    2,619 gzip   2 modules
AdminPage.tsx     77,425 raw   20,319 gzip  21 modules
```

## Artifacts

- [run 1 JSON](run-1.json) and [run 2 JSON](run-2.json): full corrected
  boundary-scoped measurements, warm proofs, and graph data.
- [desktop delayed video](desktop-delayed.webm) and
  [desktop delayed filmstrip](desktop-delayed-filmstrip.png).
- [Pixel 5 delayed video](pixel-5-delayed.webm) and
  [Pixel 5 delayed filmstrip](pixel-5-delayed-filmstrip.png).

Trace archives were not committed because Playwright traces may contain source
snapshots. The committed JSON, videos, and filmstrips contain no credentials.

## Concerns and limits

- This is local Chromium/Vite lab evidence, not a field-performance or
  Lighthouse claim. No staging or production environment was substituted.
- Stub sessions and blocked backend requests do not prove authenticated API
  behavior, RLS, staging, or production.
- Pixel 5 cold `/app/generate` and `/app/attack` recorded CLS above the 0.1 lab
  guideline (`0.1105` and `0.1114`). This is baseline evidence for later work.
- The script records unthrottled loopback and does not represent WAN, CPU, or
  field percentile behavior.
- `npm ci` emitted existing package deprecation and install-script warnings;
  the lockfile and package manifest remained unchanged.

## Task 10 current-branch audit (2026-09-20)

This audit ran in the `t3code/smooth-performance` worktree at `2e40767`
before the Task 10 edits. The harness metadata records `origin/main` as
`sourceCommit` (`b2ba178`) even though the invocation ran from this current
branch. Node was `22.23.2`, npm was `12.0.2`, Vite was `7.3.6`, and Chromium
was `151.0.7922.34`. These are local, unthrottled Chromium runs. The
authenticated route harness seeds a completed onboarding state, so the cold
`/app` comparison measures the completed-user path that should not request the
tour chunk.

The accepted boundary is onboarding. `App.tsx` now reads the small persisted
store and lazy-loads `OnboardingTour` only for an incomplete `/app` user or an
already-running tour. The existing 500 ms start delay remains in
`OnboardingTour.tsx`. The build gate checks normalized module membership, not
chunk filenames. It requires both onboarding modules to be absent from the
initial static graph and present in a dynamic graph.

The new gate was run RED before the import change. `npm run build` failed with
the initial `index-D4jHDNYl.js` membership for both
`src/components/features/onboarding/OnboardingTour.tsx` and
`node_modules/react-joyride/dist/index.mjs`. After the change, the same build
and gate completed GREEN.

Build graph evidence:

```text
                         before             after                 delta
index entry raw         1,147,759          1,043,703             -104,056
index entry gzip          354,128            322,028              -32,100
/ static graph raw      1,317,211          1,213,150             -104,061
/ static graph gzip       406,561            374,462              -32,099
/app static graph raw   1,152,363          1,048,307             -104,056
/app static graph gzip    355,933            323,835              -32,098
```

The natural `OnboardingTour` dynamic chunk is `103,039` raw and `31,727`
gzip. It contains both `src/components/features/onboarding/OnboardingTour.tsx`
and `node_modules/react-joyride/dist/index.mjs`. The initial entry retains the
small `use-onboarding` store but no tour component or Joyride module.

Cold route evidence from the complete runs is in
[`task-10-before.json`](task-10-before.json) and
[`task-10-after-final.json`](task-10-after-final.json). Same-origin request and transferred
byte totals, followed by first real-content timing, were:

```text
route/profile       before requests/bytes/ms       after requests/bytes/ms
desktop /           136 / 7,553,487 / 2,796.9      133 / 7,270,431 / 2,948.3
desktop /app        122 / 7,239,166 /   729.7      119 / 6,956,110 /   693.9
Pixel 5 /           136 / 7,553,487 /   803.1      133 / 7,270,431 /   780.0
Pixel 5 /app        122 / 7,239,166 /   601.6      119 / 6,956,110 /   829.3
```

Desktop `/app` improved by `35.8 ms` and three requests in the complete final
run. The final Pixel 5 `/app` result was `227.7 ms` slower (`37.8%` relative),
but three focused cold `/app` probes after the first Vite transform measured
`673.4-738.9 ms` on Pixel 5 and `676.5-713.8 ms` on desktop, with the same
117-119 request range and no tour request for the completed-user state. This
is not a field-performance claim. A separate full-matrix follow-up stopped at
`scripts/measure-navigation-performance.mjs:474` after a 30-second timeout
waiting for `button[aria-label="Open menu"]`; it wrote no artifact. The split
remains accepted because it removes a measured 32 KB gzip from every initial
route, creates no required tour request for completed users, and the
desktop/mobile onboarding E2E passes for incomplete users.

Rejected candidates:

- Noncurrent locale JSON stays synchronous in `src/i18n.ts`. No persisted-locale
  startup proof showed that dynamic loading would avoid an English flash or
  produce a net win.
- `WebTelemetry` stays in the entry. Its vendor integrations are already lazy,
  and the small wrapper had no measured material saving at a natural boundary.
- Native URL/runtime adapters stay in `main.tsx`. They run startup lifecycle
  work and deferring them could break Capacitor behavior without a safe proof.

This remains local lab evidence, not Lighthouse, field Core Web Vitals,
staging, production, or authenticated backend proof. The repeatability limits
and the historical baseline above still apply.

## Task 10 fix-round evidence (2026-09-20)

This section supersedes the preceding Task 10 measurements. The code fix is
committed at `30b13675fc5104f3a8c2862a832a678fba2c2ede`. The clean recapture is
[`task-10-after-final.json`](task-10-after-final.json), whose
`metadata.harnessCommit` matches that hash. The older
[`task-10-before.json`](task-10-before.json) remains the clean pre-split
comparison from `2e40767`. The harness `sourceCommit` field records
`origin/main` by design and is not the worktree revision.

Release correction: the saved transition request counts and byte totals in
this artifact exclude route work started by `pointerdown` before the recorded
`click` boundary, so they must not be used as first-visit network evidence. The
current harness starts its resource boundary before pointer intent; a later
full-plan recapture will replace those transition values. Cold-refresh and
production bundle-graph results are unaffected.

The timing fix keeps the original 500 ms deadline. `TimedOnboardingTour`
records eligibility with a state initializer outside its Suspense boundary;
the retrying lazy subtree computes `max(0, 500 - elapsed)` when the chunk is
actually ready. A protected direct route does not consume that deadline before
the user reaches `/app`.

The graph gate now checks `index.html` plus every emitted `src/pages/*.tsx`
manifest entry for both onboarding modules. It still uses the existing
`initialRoutes` list for the separate feature-only page rule. The pre-split
gate RED output named both onboarding modules in `index-D4jHDNYl.js`; the clean
code commit build is GREEN and finds both modules together in the natural
dynamic chunk.

Current production graph totals:

```text
                         before             after                 delta
index entry raw         1,147,759          1,043,946             -103,813
index entry gzip          354,128            322,114              -32,014
/ static graph raw      1,317,211          1,213,393             -103,818
/ static graph gzip       406,561            374,552              -32,009
/app static graph raw   1,152,363          1,048,550             -103,813
/app static graph gzip    355,933            323,923              -32,010
```

The dynamic onboarding chunk is `103,062` raw and `31,750` gzip. Its module
membership includes both `src/components/features/onboarding/OnboardingTour.tsx`
and `node_modules/react-joyride/dist/index.mjs`. No initial route graph
contains either module.

The complete clean recapture reports same-origin requests, transferred bytes,
and first real-content timing as follows:

```text
route/profile       before requests/bytes/ms       after requests/bytes/ms
desktop /           136 / 7,553,487 / 2,796.9      133 / 7,272,949 / 2,862.8
desktop /app        122 / 7,239,166 /   729.7      119 / 6,958,628 /   683.1
Pixel 5 /           136 / 7,553,487 /   803.1      133 / 7,272,949 /   776.0
Pixel 5 /app        122 / 7,239,166 /   601.6      119 / 6,958,628 /   779.8
```

The Pixel 5 result remains noisy local lab evidence. Request count and bytes
drop on every route. Three focused post-build `/app` probes measured the
completed-user path without a tour request; the delayed-chunk E2E covers the
incomplete-user path instead.

The delayed-chunk regression delays the onboarding source by 750 ms and waits
for the source plus the Joyride dependency to finish. Desktop and Pixel 5 both
pass the no-extra-500-ms assertion. The protected-route-to-home regression and
the existing tour flow also pass. The focused run was 4/4, and the full serial
home-navigation run was 15 passed, 1 skipped.

Rejected candidates have reproducible evidence below. Source gzip is a
comparison aid. The emitted graph records membership in a chunk, but this
harness cannot isolate parse/evaluation time for one module, so no per-module
evaluation claim is made.

```text
candidate                         source raw/gzip       emitted membership / chunk evidence
en.json                           71,079 / 20,779       initial entry, no dynamic chunk
es.json                           78,317 / 22,985       initial entry, no dynamic chunk
hu.json                           80,645 / 24,288       initial entry, no dynamic chunk
src/i18n.ts                           414 / 224          initial entry, no dynamic chunk
WebTelemetry.tsx                       991 / 457         initial entry wrapper
Vercel Analytics vendor              2,665 / 1,242       existing dynamic vendor chunk
Vercel Speed Insights vendor         2,350 / 1,107       existing dynamic vendor chunk
native-app-url-listener.ts          2,118 / 744          initial entry
native-runtime.ts                   3,339 / 1,054        initial entry
register-service-worker.ts            460 / 300          initial entry
Capacitor modules (source sum)     29,267 / 8,410        initial entry dependencies
```

Locale splitting stayed rejected. `src/i18n.ts` initializes all three
resources synchronously with English as the initial language, while the
persisted settings store applies a saved language during hydration. Dynamic
locale imports would need a startup gate to avoid an English flash. The i18n
unit tests passed `14` tests covering `changeLanguage('es')`,
`changeLanguage('hu')`, fallback English, and key parity. The existing locale
navigation E2E passed `6/6` on desktop and mobile.

WebTelemetry stayed rejected. The `991`-byte wrapper already lazy-loads both
vendors after `load` and `requestIdleCallback`; splitting that wrapper would
not remove the existing vendor requests from their natural dynamic boundary.

Native-only adapters stayed rejected. `main.tsx` calls the URL listener,
Capacitor runtime setup, and service-worker registration at startup. The
native source modules and Capacitor dependency sizes are listed above. Native
unit coverage passed `12` tests across URL handling, runtime link policy,
service-worker registration, and native helpers. Deferring lifecycle setup
would need a native runtime proof that this task does not have.
