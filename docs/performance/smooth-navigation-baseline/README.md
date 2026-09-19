# Smooth navigation baseline

Captured 2026-09-19 from the merged-main application source at
`origin/main` commit `b2ba178dee148d06d9bf89793f044add69d705b8`.
The current harness checkout is `59c1982759b722365946562de269800943e7d0c4`;
its commits contain only the performance documents and measurement harness.

This is local Chromium lab evidence. It is not Lighthouse, field Core Web
Vitals, authenticated backend proof, staging proof, or a production result.
Protected routes use the repository's credential-free stub session, so they
prove rendering and browser timing only.

## Reproduce

Use Node 22.23.2 and the committed npm lockfile:

```text
export PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH
node --version                         # v22.23.2
npm --version                          # 12.0.2
npm ci
npm run build                          # writes dist/.vite/manifest.json and bundle-graph.json
BASELINE_RUN=run-1 node scripts/measure-navigation-performance.mjs
BASELINE_RUN=run-2 node scripts/measure-navigation-performance.mjs
```

The script allocates a free loopback port, starts a new Vite development
server, launches a new browser for the matrix, and terminates the exact Vite
process group before returning. Run 1 used port `38407`; run 2 used port
`39951`. No measurement or network dependency was added.

The measurement server ran in Vite development mode (`vite 7.3.6`). The
production build graph was captured separately from the `npm run build` output.
Cold route contexts disable Chromium HTTP cache through CDP and block service
workers. First-visit clicks use a fresh browser cache. Warm clicks visit the
destination once before returning to the source. External API, analytics, Jam,
and auth requests are aborted at the browser boundary. The network profile is
unthrottled loopback and the CPU profile is Chromium's default CPU with no
emulation.

## Tool and browser profile

- Playwright `1.62.1` using installed Chromium `151.0.7922.34`.
- Desktop: `1280x800`, device scale factor `1`, touch disabled.
- Pixel 5: `393x727`, device scale factor `2.75`, touch enabled, Chromium's
  Pixel 5 Android user agent.
- The script records the exact executable, user agent, viewport, cache policy,
  Vite port, source commit, harness commit, and tool versions in each JSON
  run file.

## Matrix and measurements

Each run contains 38 measurements:

- 16 cold refreshes: `/`, `/login`, `/app`, `/app/generate`, `/app/attack`,
  `/app/flowchart`, `/app/history`, and `/app/admin` on both profiles.
- 10 first-visit clicks: landing CTA -> `/app`, Home -> Generate, Generate ->
  Attack, Home -> Flowchart, and Home -> History on both profiles.
- 10 warm clicks over the same five transitions and profiles.
- 2 deterministic delayed clicks: Generate -> Attack with the destination
  `AttackPage.tsx` request held for exactly 750 ms, one per profile.

For each route or transition the harness records:

- click timestamp, destination chunk request start/end/duration, and transfer
  and decoded bytes for the exact route module request;
- first animation frame containing the route fallback and first animation frame
  containing route-specific real text;
- every observed long task and layout-shift entry, cumulative CLS, request count,
  transferred/encoded/decoded byte totals, navigation timing, and whether the
  persistent app-shell header retained the same DOM identity.

The real-content markers include route text such as `Generate`, `Attack`,
`Argument Flowchart`, and `History`. This prevents the previous route's generic
`main h1` from being mistaken for destination content while the fallback is
visible.

## Results

The two runs had identical request counts and byte totals. Representative run
1 values are below; all values are milliseconds unless stated otherwise.

Desktop cold refreshes:

- `/`: skeleton `2621.4`, real content `2911.4`, 143 requests,
  7,455,868 transferred bytes, 3 long tasks, CLS `0.0000`.
- `/app`: skeleton `555.6`, real content `650.5`, 140 requests,
  7,142,818 transferred bytes, 1 long task, CLS `0.0000`.
- `/app/generate`: skeleton `559.8`, real content `895.3`, 184 requests,
  8,770,111 transferred bytes, 2 long tasks, CLS `0.0029`.
- `/app/attack`: skeleton `545.1`, real content `843.1`, 185 requests,
  8,366,088 transferred bytes, 2 long tasks, CLS `0.0110`.
- `/app/admin`: skeleton `521.5`, real content `760.8`, 160 requests,
  8,980,386 transferred bytes, 2 long tasks, CLS `0.0000`.

Pixel 5 cold refreshes:

- `/`: skeleton `500.6`, real content `772.8`, 143 requests,
  7,455,868 transferred bytes, 2 long tasks, CLS `0.0000`.
- `/app`: skeleton `608.9`, real content `663.1`, 140 requests,
  7,142,818 transferred bytes, 2 long tasks, CLS `0.0647`.
- `/app/generate`: skeleton `560.1`, real content `901.9`, 184 requests,
  8,770,111 transferred bytes, 2 long tasks, CLS `0.1105`.
- `/app/attack`: skeleton `621.2`, real content `956.2`, 185 requests,
  8,366,088 transferred bytes, 2 long tasks, CLS `0.1114`.
- `/app/admin`: skeleton `575.4`, real content `777.7`, 160 requests,
  8,980,386 transferred bytes, 2 long tasks, CLS `0.0000`.

Warm and first-visit navigation timing shows the current interruption is mostly
the destination route's main-thread/module/render work, not a large network
payload. On desktop, first-visit real-content times were 384.0 ms for Home ->
Generate, 236.9 ms for Generate -> Attack, 269.9 ms for Home -> Flowchart, and
282.1 ms for Home -> History. The same transitions retained the exact header
DOM identity. Pixel 5 Generate -> Attack was the slowest sibling transition at
1,213.8 ms first visit and 1,214.7 ms warm, with 204 requests and 8,991,932
transferred bytes in both runs.

The delayed desktop Generate -> Attack run requested
`/src/pages/AttackPage.tsx` at `1030.9 ms`, ended at `1859.8 ms`, showed the
fallback in four filmstrip frames, and reached route-specific content at
`1092.9 ms`. The delayed Pixel 5 run showed the fallback in two frames and
reached real content at `1952.0 ms`. Both retained the shell DOM identity and
observed the exact 750 ms route-delay handler.

## Repeatability

The documented tolerance is 35% relative variance for animation-frame timing
values, 5% for request and byte totals, and 0.1 absolute CLS variance. This is
appropriate for a local Vite dev server and a shared Chromium host. The actual
run-1/run-2 maximums were:

- first skeleton frame: `31.56%`;
- first real-content frame: `31.72%`;
- request count and transferred/encoded/decoded bytes: `0.00%`;
- maximum absolute CLS difference: `0.0647`.

The two runs therefore stayed inside the documented tolerance. The largest
timing difference was desktop warm Home -> History skeleton detection
(`117.3 ms` versus `171.4 ms`), and the largest real-content difference was
desktop cold `/login` (`556.3 ms` versus `814.7 ms`).

## Manifest and bundle graph

The build emitted 95 manifest entries and 94 JavaScript chunks. Each run JSON
contains the complete `manifestEntries`, `routeStaticGraphs`, and `chunks`
records. Every chunk record includes raw bytes, gzip bytes, imported files,
normalized module membership, the routes whose static graph contains it, and
the manifest dynamic-entry key when present. Criticality is not inferred from
file names.

Static graph summaries from the production build:

- `index.html`: 1 file, 1,138,188 raw bytes, 351,547 gzip bytes.
- `/`: 10 files, 1,307,551 raw bytes, 403,940 gzip bytes.
- `/login`: 5 files, 1,154,131 raw bytes, 357,485 gzip bytes.
- `/app`: 4 files, 1,142,701 raw bytes, 353,345 gzip bytes.
- `/app/generate`: 31 files, 1,530,191 raw bytes, 482,388 gzip bytes.
- `/app/attack`: 28 files, 1,387,865 raw bytes, 436,303 gzip bytes.
- `/app/flowchart`: 16 files, 1,333,376 raw bytes, 417,172 gzip bytes.
- `/app/history`: 13 files, 1,179,425 raw bytes, 365,129 gzip bytes.
- `/app/admin`: 21 files, 1,623,190 raw bytes, 488,345 gzip bytes.

Route-entry chunk membership and gzip size:

- `LandingPage.tsx`: `assets/LandingPage-C861HgyL.js`, 45,725 raw,
  11,133 gzip, 29 source modules.
- `LoginPage.tsx`: `assets/LoginPage-NBbG4nMQ.js`, 6,791 raw, 2,207 gzip,
  1 source module.
- `HomePage.tsx`: `assets/HomePage-CejS6iLs.js`, 3,353 raw, 1,254 gzip,
  1 source module.
- `GeneratePage.tsx`: `assets/GeneratePage-BVMnUHTy.js`, 28,552 raw,
  8,162 gzip, 5 source modules.
- `AttackPage.tsx`: `assets/AttackPage-P8XAOh8x.js`, 19,037 raw,
  5,369 gzip, 5 source modules.
- `FlowchartPage.tsx`: `assets/FlowchartPage-BJaDG0uJ.js`, 50,503 raw,
  16,770 gzip, 47 source modules.
- `HistoryPage.tsx`: `assets/HistoryPage-Dq0oiiwR.js`, 11,679 raw,
  2,619 gzip, 2 source modules.
- `AdminPage.tsx`: `assets/AdminPage-D-E666bh.js`, 77,425 raw,
  20,319 gzip, 21 source modules.

## Artifacts

- [run 1 JSON](run-1.json) and [run 2 JSON](run-2.json): full structured
  measurements and graph data.
- [desktop delayed video](desktop-delayed.webm) and
  [desktop delayed filmstrip](desktop-delayed-filmstrip.png).
- [Pixel 5 delayed video](pixel-5-delayed.webm) and
  [Pixel 5 delayed filmstrip](pixel-5-delayed-filmstrip.png).

Trace archives were not committed. Playwright traces can contain source
snapshots, and the JSON, videos, and filmstrips contain no credentials.
