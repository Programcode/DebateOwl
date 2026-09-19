# Task 5 report: centralize lazy route loaders

Status: verified

## RED

Command:

```text
npm test -- src/test/route-modules.test.ts
```

Before `src/lib/route-modules.ts` existed, Vitest failed at the intended missing-module boundary:

```text
FAIL src/test/route-modules.test.ts
Error: Failed to resolve import "@/lib/route-modules"
Test Files  0
```

The tests cover one loader invocation, promise reuse, rejected-promise retry, and unknown-path no-op behavior.

## GREEN and verification

- `npm test -- src/test/route-modules.test.ts`: passed, 1 file and 4 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 109 files and 1,066 tests.
- `npm run build`: passed. Vite emitted existing dependency annotation and chunk-size warnings; the command's emitted-graph gate passed.
- `node scripts/check-build-boundaries.mjs`: passed.
- Emitted graph inspection: entry `assets/index-oR-kx5jX.js`, 1 static graph file, 0 initial page modules.

Task 4 route-skeleton/intent E2E was not run because it remains intentionally RED and is outside Task 5's completion gate.

## Files

- `src/lib/route-modules.ts`: one stable loader registry for all 21 existing lazy pages, including the parameter and fallback routes; cached preloads remove rejected promises for retry.
- `src/App.tsx`: every `lazy(...)` page component now uses the corresponding registry loader.
- `src/test/route-modules.test.ts`: focused registry contract tests.

## Commit

`perf: share lazy route import promises`

## Self-review

- All former App page imports appear once in the registry, with no page dynamic imports left in `App.tsx`.
- Route ownership and code-splitting boundaries are unchanged.
- `/share/:code` and `*` remain explicit registry entries; unknown concrete paths do not trigger speculative matching.
- No dependency, production, deployment, or E2E changes were made.
