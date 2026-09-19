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
