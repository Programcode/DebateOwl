# Smooth navigation final evidence

Captured on 2026-09-21 from `31549f99cccedba6f4e6c482ada42512520270cc`
with Node `22.23.2`, npm `12.0.2`, Playwright `1.62.1`, Chromium
`151.0.7922.34`, Vite `7.3.6`, and the same unthrottled loopback profiles as
the baseline. This is local lab evidence. Stub sessions and blocked external
requests prove client rendering and request sequencing, not authenticated
backend, staging, field, or production performance.

## Artifacts and method

- [`task-11-audit.json`](task-11-audit.json) is the pre-change run at
  `6d8c9178bb2ebfff65b1c44a934890cfc727a21f`. Its old `sourceCommit` field
  followed the moving `origin/main`; `harnessCommit` is the authoritative code
  revision. This run used the corrected pre-pointer resource boundary, so its
  first-visit request and byte values replace the stale PR #51 values.
- [`final-1.json`](final-1.json) and [`final-3.json`](final-3.json) are the
  accepted repeated runs at `31549f9`. An intermediate run had one 58.2 ms
  warm-navigation outlier, so a third complete run was taken instead of hiding
  it. Runs 1 and 3 stayed within the documented tolerance: maximum timing
  variance was 23.94% with only a 6.8 ms absolute difference, request variance
  was 0%, transferred-byte variance was below 0.001%, and CLS variance was 0.
- [Desktop delayed video](desktop-delayed.webm),
  [desktop filmstrip](desktop-delayed-filmstrip.png),
  [Pixel 5 delayed video](pixel-5-delayed.webm), and
  [Pixel 5 filmstrip](pixel-5-delayed-filmstrip.png) show the 750 ms stalled
  Attack chunk. The shell remains mounted and the route-shaped skeleton stays
  inside the main content region.

Each run has 38 records: 16 cold refreshes, 10 first-visit clicks, 10 warm
clicks, and two delayed clicks. The final harness also records same-origin
resource URLs, route-chunk completion, post-chunk render time, long tasks after
the chunk, controlled Event Timing, and CDP script/task/layout duration. CDP
`ScriptDuration` covers all JavaScript execution inside the measured boundary;
it is not presented as isolated evaluation time for one module. The
`postChunkRenderMs` field covers module execution plus React rendering after
the route response completes.

## Task 11: page data and rendering audit

The first audit showed route files finishing in 9-32 ms while first real
content often arrived 145-455 ms after click. Most of that local-development
gap was module execution and React work, not route-file transfer. Empty stub
data did not reproduce expensive list, Markdown, chart, or storage hydration
that justified virtualization or a new rendering abstraction.

One backend cause reproduced deterministically. Generate -> Attack remounted
`ModelSelector` and repeated the subscription settings and daily-usage reads.
The browser regression failed three times with four reads instead of two.
`useSubscription` now uses the existing TanStack Query client with a 60-second
freshness window and an explicit refresh path. Desktop and mobile regressions
now record one settings read and one usage read across both routes.

No private data or AI generation is prefetched.

## Task 12: public rendering audit

The landing page renders one image asset twice: `/favicon.png` was 1024x1024,
transferred 279,765 bytes in the production browser audit, and lacked intrinsic
dimensions while displayed at 32-36 px. The new 72x72 display asset transfers
4,274 bytes, a 275,491-byte reduction, and both callers declare their rendered
width and height. Desktop and Pixel 5 CLS remained `0`.

Production CSS coverage marked 29,400 of 116,213 bytes used on desktop and
27,330 bytes used on Pixel 5. This does not by itself prove that the unused
rules can be removed because the stylesheet is shared by lazy application
routes.

A `content-visibility` prototype for all below-fold sections cut some desktop
long-task time but overestimated initial scroll height by 36% on desktop and
22% on mobile. Limiting it to the Features section gave no repeatable mobile
benefit and still changed initial scroll height. It was rejected. The current
SEO DOM, anchor navigation, find-in-page behavior, and visual layout remain
unchanged.

## Task 13: HTTP and service-worker audit

Vercel already sends no-cache headers for `index.html`, `theme-init.js`, and
`sw.js`, plus one-year immutable caching for hashed assets. Nginx previously
let its generic one-year JavaScript rule catch `sw.js`; exact no-cache locations
now cover both `index.html` and `sw.js`.

The first controlled page could load route assets before the newly installed
worker claimed it. The client now reports only same-origin `/assets/` resources
for five seconds after registration. The worker validates and caps that list,
then backfills those already visited assets into the runtime cache. It still
does not call `skipWaiting`, listen for `controllerchange`, or reload the page.

The committed production-build smoke in
[`scripts/test-service-worker-offline.mjs`](../../../scripts/test-service-worker-offline.mjs)
provides direct browser proof:

- a seeded v2 worker cache is removed when v3 activates and claims the page;
- first-visited Generate reloads offline;
- an unvisited Attack route shows the existing route error offline;
- an intent-prefetched Attack route opens offline after its prefetch finishes;
- runtime cache inspection found zero `/auth/v1`, `/rest/v1`, `/functions/v1`,
  or `/storage/v1` entries;
- stale or unavailable chunks return the existing `504 Offline` response and
  route-level recovery UI rather than a blank document.

## Complete matrix

Cold rows use `requests/transferred/decoded/real-content-ms/CLS/long-tasks`.
Final values are accepted run 1 and run 3.

```text
profile route          before                                  final 1                                 final 3
desktop /              133/7274710/7234810/3049.5/0/3         133/7004559/6964659/2715.8/0/2         133/7004547/6964647/2925.0/0/2
desktop /login         121/6750638/6714338/711.8/0/1          121/6755453/6719153/582.5/0/1          121/6755441/6719141/564.3/0/1
desktop /app           119/6960389/6924689/865.8/0/1          119/6689713/6654013/773.4/0/1          119/6689701/6654001/654.9/0/1
desktop /app/generate  162/8586542/8537942/922.1/.0029/2      162/8312240/8263640/863.6/.0029/2      162/8312228/8263628/893.3/.0029/2
desktop /app/attack    163/8182519/8133619/1186.9/.0110/2     163/7908217/7859317/880.9/.0110/2      163/7908205/7859305/906.0/.0110/2
desktop /app/flowchart 129/7732752/7694052/1064.1/0/2         129/7462076/7423376/792.4/0/2          129/7462064/7423364/708.0/0/1
desktop /app/history   128/7190734/7152334/959.4/.0105/3      128/6920058/6881658/705.3/.0105/1      128/6920046/6881646/739.0/.0105/1
desktop /app/admin     135/8830912/8790412/972.0/0/2          135/8560236/8519736/820.5/0/2          135/8560224/8519724/835.7/0/2
Pixel 5 /              133/7274710/7234810/975.9/0/3          133/7004559/6964659/777.2/0/2          133/7004547/6964647/679.8/0/2
Pixel 5 /login         121/6750638/6714338/632.5/0/1          121/6755453/6719153/527.3/0/1          121/6755441/6719141/530.6/0/1
Pixel 5 /app           119/6960389/6924689/715.1/0/1          119/6689713/6654013/693.4/0/1          119/6689701/6654001/582.5/0/1
Pixel 5 /app/generate  162/8586542/8537942/1466.0/0/3         162/8312240/8263640/973.4/0/2          162/8312228/8263628/868.7/0/2
Pixel 5 /app/attack    163/8182519/8133619/970.2/0/3          163/7908217/7859317/888.7/0/2          163/7908205/7859305/883.4/0/2
Pixel 5 /app/flowchart 129/7732752/7694052/1261.3/0/4         129/7462076/7423376/858.4/0/2          129/7462064/7423364/713.4/0/2
Pixel 5 /app/history   128/7190734/7152334/1409.7/.0464/3     128/6920058/6881658/800.0/.0464/1      128/6920046/6881646/663.2/.0464/1
Pixel 5 /app/admin     135/8830912/8790412/1322.3/.0825/3     135/8560236/8519736/801.8/.0825/2      135/8560224/8519724/705.9/.0825/2
```

First-visit rows use
`requests/transferred/decoded/real-content-ms/route-chunk-ms/CLS/long-tasks`.

```text
profile transition           before                               final 1                              final 3
desktop Landing -> app       2/36896/36296/94.3/9.4/0/0          2/36896/36296/118.6/17.2/0/1        2/36896/36296/113.2/11.4/0/1
desktop Home -> Generate     44/1652826/1639626/396.5/9.0/0/1    44/1649200/1636000/279.2/11.2/0/1   44/1649200/1636000/315.2/10.1/0/1
desktop Generate -> Attack   8/221821/219421/323.5/17.4/0/3      8/221821/219421/154.1/9.7/0/1       8/221821/219421/154.4/8.8/0/0
desktop Home -> Flowchart    13/811783/807883/198.2/12.2/0/1     11/799036/795736/203.4/9.8/0/0      11/799036/795736/169.0/11.0/0/0
desktop Home -> History      12/269765/266165/144.6/15.8/0/0     10/257018/254018/118.3/12.4/0/0     10/257018/254018/136.8/10.4/0/0
Pixel 5 Landing -> app       3/242473/241573/168.8/27.2/0/1      2/36896/36296/99.0/10.7/0/0         2/36896/36296/81.8/7.1/0/0
Pixel 5 Home -> Generate     44/1652826/1639626/455.0/21.2/0/2   44/1649200/1636000/301.7/10.3/0/1   44/1649200/1636000/314.2/6.5/0/1
Pixel 5 Generate -> Attack   8/221821/219421/320.2/19.2/0/3      8/221821/219421/146.9/12.6/0/0      8/221821/219421/150.2/8.1/0/0
Pixel 5 Home -> Flowchart    11/799036/795736/328.1/32.3/0/2     11/799036/795736/154.9/11.6/0/0     11/799036/795736/143.9/10.8/0/0
Pixel 5 Home -> History      10/257018/254018/205.8/15.5/0/0     10/257018/254018/125.6/10.1/0/0     10/257018/254018/103.3/12.3/0/0
```

Warm rows use `real-content-ms/controlled-event-ms/script-ms/long-tasks`.
Every warm navigation issued zero requests and transferred zero bytes.

```text
profile transition           before real   final 1                 final 3
desktop Landing -> app       32.5          40.2/96/64.3/0          45.4/160/71.1/0
desktop Home -> Generate     91.4          86.4/136/127.1/1        79.7/96/104.9/1
desktop Generate -> Attack   67.9          75.7/96/85.3/1          63.0/96/75.3/1
desktop Home -> Flowchart    52.2          48.4/88/72.5/1          50.6/104/86.9/1
desktop Home -> History      26.0          29.0/56/38.5/0          25.7/40/39.6/0
Pixel 5 Landing -> app       37.4          29.9/48/46.2/0          30.6/56/52.5/0
Pixel 5 Home -> Generate     72.9          78.3/88/112.9/1         71.3/80/97.7/1
Pixel 5 Generate -> Attack   102.3         65.4/80/87.8/1          62.5/72/84.8/1
Pixel 5 Home -> Flowchart    76.2          47.9/72/83.3/0          41.7/64/66.6/0
Pixel 5 Home -> History      28.6          28.4/40/40.9/0          21.6/32/31.3/0
```

## Bundle and budget result

Static graph gzip changed as follows:

```text
route          before       final       delta
index.html     322,213      322,480       +267
/              374,629      374,938       +309
/app           324,010      324,288       +278
/app/generate  453,060      456,162     +3,102
/app/attack    406,960      410,059     +3,099
```

The largest critical gzip increase is 0.76%, below the 10% startup budget.
The build gate still excludes PDF, DOCX, chart, ReactFlow, Admin, and unrelated
page modules from initial routes.

Accepted-run budget result:

- warm real-content maximum: 86.4 ms desktop and 78.3 ms Pixel 5;
- ordinary controlled Event Timing maximum: 160 ms;
- first-visit and warm CLS: `0` for every tested transition;
- intent-warmed and warm transitions show no generic route loader;
- constrained-connection tests issue no speculative route request;
- the delayed chunk keeps shell identity, shows the route skeleton, and records
  CLS `0.0110` desktop and `0` Pixel 5.

The delayed Pixel 5 recording reports 272-280 ms Event Timing because the
test captures screenshots synchronously around an artificial 750 ms stalled
request. It is filmstrip instrumentation, not the ordinary controlled INP
result. All non-instrumented first-visit and warm interactions remain below
200 ms.

## Limits

- The baseline did not record CDP script duration or Event Timing, so those
  fields are reported for the final runs without inventing before values.
- Local Vite timings include transform and shared-host noise. Request and byte
  evidence is more stable than absolute cold timing.
- Stub sessions do not prove Supabase authorization, RLS, billing, or real
  account data. No production or staging target was used.
