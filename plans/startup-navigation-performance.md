# Startup and navigation performance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the startup flash and third-party render gate, keep the app shell mounted during protected navigation, and restore route-level code splitting without weakening offline or telemetry behavior.

**Architecture:** Keep the existing React and visual systems. Make the Vite entry load React and CSS synchronously, defer optional services after render, let Rollup preserve lazy-route boundaries, and put loading/error handling around page content instead of the router tree. Cache route assets only after the browser requests them.

**Tech Stack:** Node 22.23.2, npm, Vite 7, React 18, React Router 7, Vitest 4, Playwright 1.60.

**Spec:** Adam's T3 task request dated 2026-09-19 in this thread.

## Global constraints

- Preserve the current visual design, SEO metadata, structured data, reduced-motion behavior, authentication, PWA behavior, and route errors.
- Add no dependency unless the installed platform and dependencies cannot provide the required behavior.
- Do not deploy or merge. Open a separate PR, wait for current-head CI and CodeRabbit, fix valid findings, and leave the PR open.
- Run repository commands with Node 22 and the committed package-lock.json.

## Review focus

- Jam requests never settle: the branded shell and real React UI still paint without waiting.
- A service-worker update arrives while a user is editing: no automatic reload or lost state.
- A protected sibling route chunk loads slowly: AppLayout remains mounted and usable.
- Build graph changes: the static entry graph does not gain PDF, DOCX, chart, ReactFlow, or Admin code.
- Telemetry initializes after render: privacy filters remain identical and early safe events are not allowed to interrupt the app.

---

### Task 1: Pin startup contracts with failing tests

**Files:**
- Modify: `src/test/jam-loader.test.ts`
- Modify: `src/test/vercel-deployment-config.test.ts`
- Modify: `src/test/register-service-worker.test.ts`
- Create: `e2e/loading-performance.spec.ts`

**Interfaces:**
- Produces: regression expectations for non-blocking Jam scheduling, non-flashing HTML, SPA CTA navigation, stable AppLayout identity, and shell-visible lazy navigation.

- [ ] Change the Jam unit test to require parallel asynchronous scripts and a load/idle scheduler that does not return a render-blocking promise.
- [ ] Change deployment-source tests to require a static main import, a branded boot shell, no visible SEO-directory sentence, and no all-route preload call.
- [ ] Change the service-worker unit test to require registration without update-triggered reload listeners.
- [ ] Add browser tests that stall Jam indefinitely, count document navigations for a landing CTA, mark AppLayout DOM identity, and delay a sibling route module while asserting the header remains visible.
- [ ] Run the focused unit and browser tests and record the expected failures against `origin/main`.

### Task 2: Repair startup and optional services

**Files:**
- Modify: `index.html`
- Modify: `src/bootstrap.ts`
- Modify: `src/jam-loader.ts`
- Modify: `src/main.tsx`
- Modify: `src/lib/observability.ts`
- Modify: `src/test/observability.test.ts`
- Delete: `src/offline-route-preload.ts`

**Interfaces:**
- Consumes: Task 1 startup contracts.
- Produces: immediate React/CSS discovery, branded boot content, deferred Jam, deferred observability, and no idle route stampede.

- [ ] Import `./main` statically from the entry and schedule Jam only after window load plus idle time.
- [ ] Replace the SEO directory in `#root` with a small branded boot shell while retaining head metadata and JSON-LD.
- [ ] Remove all-route idle imports and rely on browser/runtime caching for visited chunks.
- [ ] Dynamically import Sentry and PostHog behind the existing safe telemetry facade, preserving every privacy option.
- [ ] Run the focused startup and observability tests until green.

### Task 3: Keep the protected shell mounted

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/landing/Navbar.tsx`
- Modify: `src/components/landing/Hero.tsx`
- Modify: `src/components/landing/Pricing.tsx`
- Modify: `src/components/landing/FinalCTA.tsx`

**Interfaces:**
- Consumes: Task 1 navigation contracts.
- Produces: React Router landing CTAs, unkeyed router/layout providers, and page-only Suspense/error boundaries.

- [ ] Replace internal `/app` anchors with `Link` or a Motion-compatible React Router link.
- [ ] Remove full-tree `AnimatePresence mode="wait"` and pathname keying.
- [ ] Wrap each lazy page in a keyed page-content error boundary and Suspense fallback so `AppLayout` and providers stay mounted.
- [ ] Run focused route/component tests and the loading/navigation browser tests until green on desktop and mobile.

### Task 4: Restore lazy bundle and offline boundaries

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `scripts/check-build-boundaries.mjs`
- Modify: `public/sw.js`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: Task 2 entry and Task 3 route boundaries.
- Produces: a Vite manifest assertion for the static entry graph and a service worker that caches visited assets without forcing updates.

- [ ] Remove forced manual chunks and enable a build manifest so Rollup can preserve dynamic route and feature boundaries.
- [ ] Add a post-build check that walks only static imports from `index.html` and rejects PDF, DOCX, chart, ReactFlow, and Admin modules.
- [ ] Reduce the service-worker install shell to navigation/static essentials and remove automatic skip-waiting update activation.
- [ ] Update architecture and testing docs for deferred services, visited-route caching, and the build boundary gate.
- [ ] Build and inspect `dist/index.html`, `.vite/manifest.json`, and emitted sizes.

### Task 5: Measure, verify, review, and publish the PR

**Files:**
- Create or modify only focused test/evidence documentation needed by the PR.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: before/after desktop/mobile recordings, exact resource metrics, full local gates, independent review, and an open PR.

- [ ] Record cold desktop/mobile loads for `/`, `/login`, `/app`, `/app/generate`, and `/app/attack`, plus blocked Jam and warm Generate-to-Attack navigation.
- [ ] Report request count, transferred and decoded bytes, critical JS gzip, first real app paint, cold-load timing, and warm sibling navigation timing.
- [ ] Run docs, lint, typecheck, coverage, Edge tests, build, and desktop/mobile E2E on a verified-free port.
- [ ] Inspect the final diff and dispatch an independent reviewer against `origin/main...HEAD`; fix every valid Critical or Important issue with regression proof.
- [ ] Commit explicit files, push, open and link the separate PR, then wait for current-head CI and CodeRabbit. Leave the PR open.
