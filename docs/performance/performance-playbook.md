# Performance loading playbook

Status: current research snapshot, accessed 2026-09-19.

This document answers the loading and navigation questions for DebateLab before
implementation. It is intentionally limited to supported browser and library
APIs. It does not authorize a router migration, data prefetching of private
records, or a bundle-layout redesign.

## Current DebateLab baseline

The checked-out app is a Vite React SPA using declarative `BrowserRouter`:

- React `18.3.1` and React DOM `18.3.1`.
- React Router DOM `7.18.3`.
- Vite `7.3.6` with `@vitejs/plugin-react-swc`.
- TanStack React Query `5.102.8`.
- The route tree is in `src/App.tsx`. Every page is already loaded through a
  top-level `lazy(() => import(...))`; each route has a `Suspense` boundary and
  `RouteErrorBoundary`.
- `vite.config.ts` leaves chunking and module-preload dependency computation to
  Vite. It does not define `manualChunks`.
- `public/sw.js` uses a versioned cache, network-first navigations, and
  cache-first same-origin scripts, styles, images, fonts, and `/assets/`.
  Supabase API paths are excluded from the service worker.
- `MotionConfig reducedMotion="user"`, CSS `prefers-reduced-motion` rules, and
  several existing `role="status"`/`aria-busy` states already cover parts of
  the accessibility contract.

The source tree is therefore close to the native solution. The next change
should make route import functions reusable for intent prefetch and should keep
data loading separate from code loading.

## Findings

### Core Web Vitals define the measurement target

Sources:

- <https://web.dev/articles/vitals>
- <https://web.dev/articles/vitals-field-measurement-best-practices>

Accessed: 2026-09-19.

Supported API or tool: LCP, INP, and CLS field metrics; the `web-vitals`
library's `onLCP`, `onINP`, and `onCLS` callbacks; reporting by the 75th
percentile, split by mobile and desktop.

Browser constraints: these are browser-observed metrics, not a single
cross-browser synchronous API. Lab tools and local traces do not replace field
data. CLS may remain open for the page lifetime, and INP requires real input.

Failure mode: an average hides slow devices and networks. A local cold load can
look good while the 75th percentile of real mobile users is poor. Blocking
analytics can also hurt LCP, and expensive analytics work can hurt INP.

DebateLab implication: measure and report at least LCP <= 2.5 s, INP <= 200 ms,
and CLS <= 0.1 at the 75th percentile. Keep startup telemetry asynchronous
and non-blocking. Treat the existing production filmstrips and DevTools traces
as lab evidence, not as a Core Web Vitals pass.

### Chrome Performance, Network, and Coverage answer different questions

Sources:

- <https://developer.chrome.com/docs/devtools/performance/overview>
- <https://developer.chrome.com/docs/devtools/performance/reference/>
- <https://developer.chrome.com/docs/devtools/network/>
- <https://developer.chrome.com/docs/devtools/network/reference/>
- <https://developer.chrome.com/docs/devtools/coverage/>

Accessed: 2026-09-19.

Supported API or tool: Chrome DevTools Performance records CPU/runtime and load
traces, local LCP/INP/CLS, and screenshots. Network records requests, sizes,
timings, initiators, cache behavior, offline mode, and throttled networks.
Coverage records used and unused JavaScript/CSS bytes during a reload and the
interactions performed while recording.

Browser constraints: these are Chromium DevTools tools. The Network panel only
records while DevTools is open. Coverage measures the paths exercised in that
recording, not every possible user path. Throttling is a lab simulation, not a
field network measurement.

Failure mode: a green local trace can miss a later interaction, a different
browser, or a slow device. Coverage can label code unused simply because the
test did not open the feature. Disabling cache is needed for a first-visit
comparison; a warm browser can hide the cost of route imports.

DebateLab implication: keep a repeatable cold and warm navigation matrix. For
each change, record a fresh Chromium trace with cache disabled, then repeat
warm navigation and at least one throttled mobile profile. Use Coverage to
validate that startup does not execute feature-only modules, and Network to
check that a proposed prefetch starts only after intent. Do not turn a DevTools
trace into a field-performance claim.

### React `lazy` and `Suspense` are the native code-loading boundary

Sources:

- <https://react.dev/reference/react/lazy>
- <https://react.dev/reference/react/Suspense>

Accessed: 2026-09-19.

Supported API: `lazy(() => import('./Page'))` defers a component's module until
first render. React caches the loader promise and the resolved component.
`Suspense` renders its fallback while the lazy component suspends. A rejected
lazy import is thrown to the nearest Error Boundary.

Browser constraints: dynamic `import()` support and chunk loading come from the
bundler/browser target. `lazy` requires a default component export. Suspense
does not detect data fetched inside an Effect or event handler.

Failure mode: a fallback replaces the nearest boundary's content when an
already revealed tree suspends during an urgent update. A first render that
suspends does not preserve state before it mounts. A failed or evicted chunk
must reach an Error Boundary or the route is unusable.

DebateLab implication: keep one stable loader function per page and pass that
function to both `lazy` and an intent prefetch helper. Keep `RouteErrorBoundary`
around the route. Use an immediate destination-shaped route fallback for every
route change; use smaller boundaries for independent panels. Do not preload all
page modules at startup.

### React transitions can retain a prior screen, but DebateLab must not use that for route changes

Sources:

- <https://react.dev/reference/react/Suspense#preventing-already-revealed-content-from-hiding>
- <https://react.dev/reference/react/startTransition>
- <https://reactrouter.com/start/modes>
- <https://reactrouter.com/api/declarative-routers/BrowserRouter>
- <https://reactrouter.com/explanation/react-transitions>

Accessed: 2026-09-19.

Supported API: installed `react-router-dom@7.18.3` exposes declarative
`BrowserRouter` with `useTransitions`, while React's `startTransition` marks a
state update as non-urgent. If that
update suspends, React can keep already revealed content visible while the new
tree loads. Newly rendered boundaries may still show their own fallbacks.
React Router's declarative `BrowserRouter` accepts `useTransitions`; when it is
undefined, router state updates use `React.startTransition`, and
`useTransitions={false}` opts out. React Router v7 makes the transition-wrapped
state-update behavior the default.

Browser constraints: this is render scheduling, not a transaction across the
URL, route data, effects, focus, and controls. `BrowserRouter` uses the browser
History API and Declarative Mode does not expose Data Mode's navigation state.
The enhanced `useTransitions` behavior described for Data/Framework Mode
requires React 19, while DebateLab is on React 18.3.1. A transition can be
interrupted by a newer update.

Failure mode: the browser history URL can change while the old route is still
painted. Buttons, forms, and links in that old route remain interactive unless
the app explicitly gates them. Route effects keyed from `location.pathname`
can also observe the new URL before the destination content is visible. A
status or control gate reduces harm, but it does not remove this URL/content
mismatch.

DebateLab implication: reject prior-route retention for route changes in this
BrowserRouter architecture. Set `useTransitions={false}` for the declarative
router and show an immediate route-shaped skeleton beneath the persistent app
shell. Keep `startTransition` available for non-route state where retaining
content cannot create a URL/content mismatch. Do not claim that a pending
status or stale-control gate makes route retention consistent.

### React Router 7.18 does not prefetch BrowserRouter route modules natively

Sources:

- <https://reactrouter.com/start/modes>
- <https://reactrouter.com/api/components/Link>
- <https://reactrouter.com/explanation/lazy-route-discovery>
- <https://reactrouter.com/api/components/PrefetchPageLinks>

Accessed: 2026-09-19.

Supported API: React Router's `Link prefetch="intent|render|viewport"` and
`PrefetchPageLinks` emit module/data prefetch links in Framework Mode. `discover`
controls lazy route discovery in Framework Mode. The official mode matrix marks
`prefetch`, `PrefetchPageLinks`, `useNavigation`, and lazy route discovery as
unavailable in Declarative mode.

Installed-source check: `react-router@7.18.3`'s `usePrefetchBehavior` returns
`[false, ref, {}]` when `FrameworkContext` is absent. DebateLab renders
`BrowserRouter`, not a Framework/Data router, so adding `prefetch` to the
existing links would be a no-op for route modules. `discover` is not a dynamic
import prefetch substitute.

Browser constraints: native Router prefetch requires a Framework/Data setup and,
for framework route discovery, a manifest endpoint. That is a different
architecture from this Vite SPA.

Failure mode: assuming `Link prefetch` works in `BrowserRouter` creates a silent
performance regression. Migrating to `createBrowserRouter` solely for prefetch
would expand the scope to data-router pending/error semantics and route
configuration changes.

DebateLab implication: keep `BrowserRouter` and call stable dynamic-import
functions directly from a small intent handler. For example, a page loader can
be the same function passed to `lazy` and called from `focus`, `pointerenter`,
or touch intent. The import warms the browser module cache without fetching
private data. Revisit native Router prefetch only if DebateLab deliberately
migrates to Data or Framework Mode.

### Vite already computes module-preload dependencies for dynamic imports

Sources:

- <https://vite.dev/config/build-options.html#build-modulepreload>
- <https://vite.dev/guide/features.html#async-chunk-loading-optimization>

Accessed: 2026-09-19.

Supported API: Vite turns dynamic imports into async chunks and computes their
module-preload dependency list. Its default `build.modulePreload` includes a
polyfill for HTML entries. `build.modulePreload.resolveDependencies` can alter
the list, but it is an experimental fine-grained hook.

Browser constraints: generated filenames and dependency graphs are content
hashed and can change on every build. Relative `base` values use
`import.meta.url`; custom entries may need the polyfill imported manually.

Failure mode: hand-authored chunk URLs go stale after a build. Arbitrary
`manualChunks` can merge unrelated feature code, increase initial bytes, or
create new request waterfalls. Preloading too many chunks competes with the
current route and starves useful work.

DebateLab implication: leave module-preload dependency calculation to Vite.
Use route-level dynamic imports for code splitting. Do not add
`resolveDependencies` or `manualChunks` for this plan unless a bundle graph
shows a specific, measured problem and the new graph is verified on cold mobile
loads.

### TanStack Query can warm known data, but this plan should not speculate on private data

Source:

- <https://tanstack.com/query/latest/docs/framework/react/guides/prefetching>

Accessed: 2026-09-19.

Supported API: installed TanStack Query `5.102.8` exposes `queryClient.query`
and the deprecated-compatible `prefetchQuery`. Current documentation recommends
`queryClient.query({ queryKey, queryFn, staleTime })`, which runs the query and
caches the result. For non-critical prefetches, discard the promise and swallow
the error so the mounted `useQuery` remains responsible for retries and error
display. A prefetched query without an observer is garbage-collected after
`gcTime`.

Browser constraints: the cache is client-side and keyed by the exact query key;
freshness depends on `staleTime`. A prefetched request still consumes network,
server, and possibly AI/API budget. Authentication and authorization still
apply to the request.

Failure mode: speculative private-data fetches can leak timing or cached
content across account changes if keys or invalidation are wrong. Stale data can
also make a fast route show incorrect account state. Prefetch failures should
not turn a hover into a visible error.

DebateLab implication: do not prefetch private account/history/admin/AI data
from navigation intent. If a later feature identifies a safe, non-sensitive
query, prefetch it only with an account-scoped key, an explicit `staleTime`, and
`void queryClient.query(...).catch(() => undefined)`. Code prefetch and data
prefetch remain separate decisions.

### Resource hints: use the smallest hint that matches the work

Sources:

- <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload>
- <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload>
- <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/prefetch>
- <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect>

Accessed: 2026-09-19.

Supported API: `preload` schedules a resource needed very soon, at high
priority, and requires a correct `as` value. `modulepreload` fetches, parses,
and compiles an ES module and can prepare dependencies. `prefetch` is a low
priority hint for a likely future same-site navigation or subresource.
`preconnect` opens a connection to a future origin.

Browser constraints: `modulepreload` is Baseline widely available since 2023,
but dependency fetching can vary by browser. `prefetch` is limited availability,
can be blocked by cache headers, and may be dropped under resource pressure.
`preconnect` has no benefit for same-origin requests because that connection is
already open. `preload` has CORS/credentials matching requirements even when a
resource is same-origin.

Failure mode: a wrong `as`, `crossorigin`, or MIME type can cause a duplicate
fetch or unused preload warning. `preload` for a route the user never opens
wastes bandwidth at the most important time. `prefetch` is not a guarantee and
must never be required for correctness.

DebateLab implication: do not add `preconnect` for Vite chunks. Do not put
hashed route chunks in `index.html` as `preload`. Let Vite emit module-preload
dependencies for the current entry, and use a stable import function on
deliberate route intent for a likely next page. Add a narrowly scoped
`prefetch` hint only if network evidence shows it beats the import approach on
target browsers; it must remain optional and same-origin.

### Network Information and Save-Data are hints, not a gate for navigation

Sources:

- <https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/effectiveType>
- <https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData>

Accessed: 2026-09-19.

Supported API: feature-detect `navigator.connection`; when present,
`effectiveType` reports `slow-2g`, `2g`, `3g`, or `4g`, and `saveData` reports a
user request for reduced data use. The connection object can emit `change`.

Browser constraints: MDN marks the Network Information API, `effectiveType`,
and `saveData` as limited availability. Firefox and Safari may not expose the
properties. Values are estimates based on observed round-trip/downlink data,
not a promise about the next request.

Failure mode: assuming the API exists breaks unsupported browsers. Treating
`4g` as a guarantee can still overfetch on a congested network. Treating an
unknown connection as offline would make normal navigation unreliable.

DebateLab implication: use the API only to suppress speculative route-code
prefetch. Always skip it when `saveData` is true or `effectiveType` is
`slow-2g`/`2g`; prefer `4g` for hover/focus prefetch and allow the click to
navigate when no hint exists. Keyboard focus must count as intent, desktop
hover should be lightly debounced, and touch needs a `pointerdown`/`touchstart`
path because touch has no hover. Touch prefetch must use the same Save-Data and
slow-connection guard. The actual click must never wait for the prefetch.

### Service workers help repeat/offline loads, not intent correctness

Sources:

- <https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API>
- <https://web.dev/articles/service-worker-lifecycle>

Accessed: 2026-09-19.

Supported API: service workers intercept same-origin requests and can use the
Cache API. Their lifecycle is download, install, activate, then fetch. A new
worker normally waits until old controlled pages close; `clients.claim()` can
claim existing pages. DebateLab's worker already version-cleans old caches,
claims clients, caches the app shell, and caches successful same-origin static
assets.

Browser constraints: service workers require HTTPS, with `http://localhost`
treated as secure for development. They are origin/scope-bound, have no DOM,
and cannot use dynamic `import()` in the worker global scope. The first page may
not yet be controlled until a subsequent navigation unless the worker claims
it.

Failure mode: an install rejection discards the new worker. A waiting worker
means one tab can keep an old version while another uses the new one. A
cache-first stale asset strategy can return an old chunk or a missing chunk if
the deployment's versioning and cache policy do not agree.

DebateLab implication: keep hashed Vite assets cacheable and keep API paths out
of the runtime cache. Do not add every route chunk to `APP_SHELL`, and do not
use the worker as a speculative private-data fetcher. If the worker cache policy
changes, bump `CACHE_VERSION` and test a first visit, reload, offline static
asset, and deployment update. A route import failure must still be handled by
the app's Error Boundary.

### `aria-busy` and `status` make loading states understandable

Sources:

- <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy>
- <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role>
- <https://www.w3.org/TR/wai-aria-1.2/#aria-busy>

Accessed: 2026-09-19.

Supported API: `aria-busy="true"` tells assistive technology to wait while a
region is being modified and `false` when the update is complete. `role="status"`
is a polite, atomic live region for advisory updates. Status should not receive
focus or move the user's focus.

Browser constraints: announcements vary by browser and assistive technology.
`aria-busy` suppresses/interleaves updates; it does not announce "loading" by
itself. A skeleton with no text is silent to a screen reader.

Failure mode: leaving `aria-busy` true silences later updates. Replacing a
focused route subtree can destroy focus. Marking the whole route busy while it
is being replaced gives assistive technology an inaccurate state.

DebateLab implication: keep a mounted polite status node for route transitions,
for example "Opening Attack" and then "Attack ready" or an actionable error.
Mark only the region being rewritten busy. Use `aria-hidden="true"` on purely
decorative skeleton blocks. Do not move focus for routine navigation and do not
announce every streaming chunk.

### `prefers-reduced-motion` is an accessibility constraint, not a loading strategy

Source:

- <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>

Accessed: 2026-09-19.

Supported API: the CSS media feature detects a user preference for reduced
non-essential motion. `@media (prefers-reduced-motion: reduce)` can remove,
shorten, or replace animation. MDN marks it Baseline widely available.

Browser constraints: the preference comes from the operating system/browser and
is not a signal that a network operation finished. Users may change it while
the app is open.

Failure mode: shimmer, scale, and large panning animations can trigger
vestibular discomfort. Motion can also make a genuinely unresolved route look
busy without reducing the wait.

DebateLab implication: preserve the existing reduced-motion handling. New
loading UI should work as a static skeleton or short opacity change, and never
use animation to conceal unresolved route work. Motion is polish after the
state contract is correct.

## Direct answers for implementation

### Router prefetch decision

No. Installed React Router `7.18.3` cannot prefetch DebateLab's declarative
`BrowserRouter` route modules through `Link prefetch`; that prop is Framework
Mode only and the installed implementation disables it without framework
context. Keep the router and use stable dynamic-import functions directly.

### Transition decision

No, not safely in this architecture. React transitions can keep already
revealed route content visible while a new lazy component suspends, but
BrowserRouter updates History before the transition-wrapped state commit. The
destination URL can therefore show the old route, and a status/control gate
only reduces the harm. Reject prior-route retention for route changes. Use
`useTransitions={false}` and an immediate route-shaped skeleton instead.

### Loading-state decision

Use these four states. Keep the app shell and page chrome stable unless the
failed region itself owns them.

- **Route module pending.** Prefer a completed route-code intent prefetch. If
  the module is still pending, retain the stable shell and replace the route
  region immediately with a destination-shaped skeleton. With
  `useTransitions={false}`, do not retain the previous route under the new URL.
- **Initial page data pending.** Keep the page chrome and controls stable. Use a
  skeleton only for the region whose data is unknown, with dimensions reserved
  to protect CLS.
- **Mutation or AI work pending.** Preserve the user's input and existing result
  context. Use the existing inline progress or streaming states instead of
  replacing the page with a skeleton.
- **Recoverable error.** Replace only the failed region with its error state and
  a retry action. Keep unrelated content available and do not hide the failure
  behind motion.

Use a small skeleton vocabulary with DebateLab's existing spacing, radius,
color, and typography tokens: heading line, control row, form card, list row,
result block, chat thread, and admin table. Every skeleton must reserve stable
dimensions, contain no fake text or misleading clickable controls, set
`aria-busy="true"` on the pending region, expose one polite status announcement
for the operation, and remain correct with reduced-motion styling.

Prototype timing decision: swap immediately to the appropriate skeleton for an
unresolved route module or unknown data region. Preserve known page chrome,
surrounding panel content, and mutation context only as required by the states
above. Do not add a fixed delay; add one only if traces show that it shortens,
rather than lengthens, user friction.

### Resource-hint decision

Use Vite's automatic module-preload graph and stable import functions. Do not
preconnect to same-origin Vite assets, hand-preload hashed route chunks, or
preload every route at idle. Treat `prefetch` as a low-priority, optional hint
only after deliberate intent and network gating prove it useful.

### Intent decision

Keyboard `focus`, desktop hover/pointer intent, and touch `pointerdown`/
`touchstart` are all valid signals for route-code intent. Debounce desktop
intent briefly, skip speculative work for `saveData` and `slow-2g`/`2g`, and
allow navigation to proceed without waiting. When Network Information is
unsupported, keep intent prefetching but do not block navigation. Never attach
private data fetches to these code-intent signals.

## Decision matrix

| Concern | Smallest supported choice | Decision | Why |
| --- | --- | --- | --- |
| Route code split | Existing `lazy` + Vite dynamic import | Use | Already present and supported |
| Route code intent prefetch | Stable `() => import('./Page')` called from guarded events | Use | Works with BrowserRouter and keeps URL/data separate |
| React Router `Link prefetch` | Framework/Data Router prefetch | Reject for now | No effect in current BrowserRouter |
| Route data prefetch | TanStack Query `query` with safe key and `staleTime` | Only for a later, proven safe query | Private data and AI work are not speculative work |
| Vite modulepreload | Automatic generated dependency list | Use | Handles hashed chunks and dependency order |
| Manual `manualChunks` | Hand-authored vendor graph | Reject | No measured need; graph can regress startup bytes |
| Idle preload of every route | Browser idle callback or all-route imports | Reject | Wastes bandwidth and defeats code splitting |
| Resource hints | Narrow, same-origin, optional intent hint | Limit | `preload` is too eager; `preconnect` is useless same-origin |
| Route transition | `BrowserRouter useTransitions={false}` plus destination-shaped skeleton | Use | Removes prior-route URL/content mismatch while keeping the shell |
| Loading animation | Static/short reduced-motion-safe state | Use | Animation cannot resolve or measure work |

## Verification contract for the implementation task

The next implementation should prove the behavior with a cold desktop and
mobile Chromium run, a warm route navigation, and a throttled slow-network run.
The Network panel must show no route import before the chosen intent event, and
the destination must still load when the prefetch is skipped or fails. Coverage
must show feature-only modules absent from startup execution. The accessible
loading state must expose a polite status, preserve focus, and clear
`aria-busy`. Reduced-motion emulation must remove loading animation without
changing route correctness.
