# Animation polish plan

**Status:** Remaining work as of 2026-08-31 on `main` (`acaac0d`).

## Preconditions

- Create and use your own isolated T3 Code worktree and feature branch for this plan; do not edit `main` or reuse another plan's worktree. Before edits, verify `pwd`, `git branch --show-current`, `git status --short --branch`, and `git worktree list --porcelain`, and keep this branch/worktree independent through its PR lifecycle.
- Use Node `22.x` from `package.json`, npm, and the committed `package-lock.json`; verify `node --version`, `npm --version`, and `test -f package-lock.json`, then run `npm ci` before the gates.

## Goal

Keep DebateLab responsive and readable in dense debate workflows. Motion should explain state changes, never hide content, shift layout unexpectedly, or ignore a user's reduced-motion preference.

## Current implementation

The route transition in `src/App.tsx:84-98` is already 160ms, below the old 180ms target, and Framer Motion receives `useReducedMotion()`. Shared motion tokens and loading/reveal classes live in `src/index.css:170-421`; the reduced-motion media block is at `src/index.css:1222-1250`. `AnimatedSection` and `StaggeredContainer` also have reduced-motion handling (`src/components/ui/animated-section.tsx:10-65`).

The only broad browser proof is the Sparring E2E test (`e2e/sparring.spec.ts:123-140`), which checks mobile overflow and Tailwind `animate-*` elements. Component tests cover class names and timers but do not inspect computed animation or transition behavior. The source still has unscoped `animate-spin`, `animate-pulse`, `animate-bounce`, and custom CSS animations in loading, landing, timer, Ask, and feature-page states. Feature loading pages also nest `motion-swap`/`motion-shimmer` wrappers around `StreamingIndicator`, which has its own motion classes.

## Remaining work, in order

### 1. Add a route/state motion audit

**Files likely to change:**

- New `e2e/motion.spec.ts`
- `e2e/authed-pages.spec.ts` only if the shared authenticated fixture is the cleanest reuse
- Existing route components only where the audit finds a concrete issue

Cover the authenticated Home, Generate, Attack, Brainstorm, Factoids, Ask, Crossfire, Sparring, History, Library, Timer, Flowchart, and Settings routes at the configured desktop and mobile widths. Exercise empty, loading, result, and options-open states where the route exposes them. Intercept provider calls with deterministic fixtures. Capture a desktop and mobile screenshot for the dense Generate, Factoids, Ask, and Sparring states during review, and assert no horizontal overflow, hidden primary content, or unexpected scroll jump.

### 2. Make reduced motion stop every non-essential animation

**Files likely to change:**

- `src/index.css:1222-1250`
- `src/components/ui/animated-section.tsx:10-65`
- `src/components/ui/loading-spinner.tsx`
- `src/components/ui/streaming-indicator.tsx`
- `src/App.tsx`
- `src/components/auth/RequireAuth.tsx`
- `src/pages/SharedPage.tsx`, `src/pages/AdminPage.tsx`, `src/pages/TimerPage.tsx`
- `src/components/features/ask/AskChat.tsx`
- `src/components/features/generate/GenerateForm.tsx`
- `src/components/landing/Hero.tsx`
- `src/components/ui/skeleton.tsx`

Use one clear reduced-motion policy. Persistent utility animations and custom keyframes must resolve to no animation under `prefers-reduced-motion: reduce`; transitions and scroll behavior must not animate. Add explicit `motion-reduce:animate-none` only where a component-specific class is clearer, and avoid selectors that leave an infinite animation active at a 0.001ms duration. Preserve visible loading text and state changes without requiring movement. Ensure Framer Motion and the generated stagger `<style>` keep content visible immediately.

### 3. Remove duplicate loading motion and layout-shifting wrappers

**Files likely to change:**

- `src/pages/GeneratePage.tsx:340-345`
- `src/pages/AttackPage.tsx:124-129`
- `src/pages/BrainstormPage.tsx:115-120`
- `src/pages/FactoidsPage.tsx:125-135`
- `src/components/features/ask/AskChat.tsx:556-570`
- `src/components/ui/streaming-indicator.tsx`

Keep one entrance animation for a loading state and one bounded shimmer or status indicator. Do not animate both a state wrapper and its child. Verify that swapping loading, result, and empty states keeps the result column's height and scroll position stable enough for keyboard and mobile users. If the browser audit finds another nested animated card, fix that concrete instance and add it to the focused test rather than broadening the motion system.

## Verification and acceptance

Add component assertions where they provide fast coverage, then run:

```bash
npx vitest run src/test/components/AnimatedSection.test.tsx src/test/components/StreamingIndicator.test.tsx src/test/components/ui.test.tsx
CI=1 PORT=18083 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18083 npm run test:e2e -- e2e/motion.spec.ts e2e/sparring.spec.ts
```

Confirm port `18083` is free before the browser run; the explicit `PORT` and `PLAYWRIGHT_BASE_URL` prevent reuse of the dev server's default `8080`.

Run the full gates: `npm run lint`, `npm run typecheck`, `npm test -- --coverage`, and `npm run build`. No Deno gate applies because this plan is frontend-only. The E2E suite must prove both normal and reduced-motion rendering at desktop and mobile widths. Under reduced motion, computed non-essential animations must be `none`, transition durations must not produce visible travel, route content must appear immediately, and no route may gain horizontal overflow. Normal motion must keep route transitions at or below 180ms and retain readable loading/status feedback.

## Rollout and authorization boundary

This is a frontend-only change. Do not deploy, publish, change backend state, or touch production during implementation. After local and browser gates pass, release through the normal frontend review/deploy path with screenshots and the E2E report. Roll back by restoring the previous frontend build or commit if the audit finds content hidden, a scroll jump, a layout shift, or a regression in reduced-motion behavior.
