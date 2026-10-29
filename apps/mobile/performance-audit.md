# Mobile startup and render performance audit

Branch: `t3/mobile-startup-render-speed`. Base: `ebbc75bc6402e6cc2a30ee82d65346c3c5aeb9e7`.

## 1. Done. Copy-first reads

Optional `onCopy` paints an account-owned disk copy while the original promise refreshes. Pending refreshes do not mark data offline. Status-0 failure keeps the copy and raises the notice; server refusals still throw, including when storage is slow. Owner/generation, read tickets, CopyHolder release and write invalidation remain in place. Debate, Library, Prepare and History use the callback.

Files: [src/lib/offline-cache.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.ts), [src/lib/debates.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/debates.ts), [src/lib/history.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/history.ts), [src/lib/sources.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/sources.ts), [src/lib/debate-context.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/debate-context.tsx), [src/app/(tabs)/(debate)/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(debate)/index.tsx), [src/app/(tabs)/(library)/library.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(library)/library.tsx), [src/app/(tabs)/(prepare)/prepare.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(prepare)/prepare.tsx), [src/app/history.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/history.tsx), [src/lib/offline-cache.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.test.ts).

## 2. Done. Date imports

Functions and en-GB, Spanish and Hungarian locales use date-fns subpaths.

Files: [src/lib/dates.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/dates.ts).

## 3. Done. Streamed drafts

`useLiveRun` writes to a LiveValue store. Only LiveToolRun subscribes; section parsing runs there instead of in the parent screen render. Activity updates, cancellation and finished-result behavior remain.

Files: [src/components/live-run.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/live-run.tsx), [src/app/generate.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/generate.tsx), [src/app/attack/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/attack/index.tsx), [src/app/brainstorm/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/brainstorm/index.tsx), [src/app/factoids/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/factoids/index.tsx).

## 4. Done. Sparring clock

Display components tick independently from the session. A deadline timeout and foreground check commit only expiry, while pause/reset/submit keep using the existing session helpers. The setup form and model picker were not edited.

Files: [src/app/sparring/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/sparring/index.tsx).

## 5. Done, with two protected skips. React Compiler

Counters call module nextId functions. Render-time ref writes use useLatest or layout effects. Hooks suppressions use latest handlers with explicit dependencies. Request error handling and cleanup run through a module helper. Failed selection and deletion still stop before follow-up actions. The remaining skips are outside the allowed Sparring-clock and CountUp edits.

Files: [src/lib/run-request.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/run-request.ts), [src/lib/run-request.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/run-request.test.ts), [scripts/compiler-audit.mjs](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/scripts/compiler-audit.mjs).

## 6. Done. Unchanged source copies

Sources have no updated_at column, so the cache compares the exact serialized value before writing it again. This avoids stale text from an ids-only signature. Unchanged full-text entry writes are skipped; the small LRU index still updates. Serialization and reading the existing value still cost work.

Files: [src/lib/offline-cache.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.ts), [src/lib/offline-cache.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.test.ts).

## 7. Done. Startup

The root onLayout hides the splash after readiness. Settings preload alongside auth restore and are applied only to the matching confirmed owner. A tagged snapshot keeps another account settings out of context; the preload is consumed once and later account changes reread their own copy.

Files: [src/app/_layout.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/_layout.tsx), [src/lib/settings.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings.tsx), [src/lib/settings-cache.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings-cache.ts), [src/lib/settings-cache.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings-cache.test.ts).

## 8. Done. Catalog loading

English and the device language initialize synchronously. changeAppLanguage requires the other bundled translation and tools namespaces before selecting that language; offline switching retains synchronous key resolution.

Files: [src/lib/i18n.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/i18n.ts), [src/lib/i18n.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/i18n.test.ts).

## 9. Done. Growing lists

Debates and saved maps use SheetList, a FlatList whose native scroll view remains the direct sheet child. SourceView owns a virtualized paragraph list in both its sheet and iPad pane, with no outer scroll view. Chunks retain the text, cap native Text work at 4,000 characters, and preserve surrogate pairs. Copy/share/edit still use the full source. Native sheet position and phone layout have not been exercised.

Files: [src/components/sheet.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/sheet.tsx), [src/components/list-screen.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/list-screen.tsx), [src/app/debates.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/debates.tsx), [src/app/flowchart/maps.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/flowchart/maps.tsx), [src/components/source-view.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/source-view.tsx), [src/app/source/[id].tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/source/[id].tsx), [src/app/(tabs)/(library)/library.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(library)/library.tsx), [src/lib/source-paragraphs.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-paragraphs.ts), [src/lib/source-paragraphs.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-paragraphs.test.ts).

## 10. Done. Scroll and count updates

The outline retains scroll offsets in a ref and sets state only when the selected section changes. CountUp keeps its easing and final tick but updates text at most ten times per second. All other celebration code and timer-ring code were left alone.

Files: [src/components/outline.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/outline.tsx), [src/components/celebration.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/celebration.tsx).

## Compiler skips before and after

The logger scanned 126 TSX files under the mobile source tree, excluding .web.tsx, with target React 19. This is a Babel compiler diagnostic run, not a Metro build or iPhone performance measurement.

Before: 228 successful compilations, 48 diagnostics in 34 files. After: 267 successful compilations, 2 diagnostics in 2 files. The earlier progress note saying 33 files was a counting error.

Before:

- [src/app/(tabs)/(debate)/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(debate)/index.tsx): Cannot access refs during render.
- [src/app/(tabs)/(library)/library.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(library)/library.tsx): Cannot access refs during render.
- [src/app/(tabs)/(you)/you.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(you)/you.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/add-file.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/add-file.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/app/add-link.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/add-link.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/app/ask.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/ask.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause; (BuildHIR::lowerStatement) Support ThrowStatement inside of try/catch; (BuildHIR::lowerExpression) Handle ??= operators in AssignmentExpression.
- [src/app/attack/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/attack/index.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/brainstorm/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/brainstorm/index.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/context-review.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/context-review.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/debate-check.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/debate-check.tsx): Cannot access refs during render.
- [src/app/debates.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/debates.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/factoids/[id].tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/factoids/[id].tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/factoids/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/factoids/index.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/app/flowchart/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/flowchart/index.tsx): (BuildHIR::lowerStatement) Handle TryStatement without a catch clause.
- [src/app/flowchart/maps.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/flowchart/maps.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/generate.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/generate.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/history.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/history.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/app/limit.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/limit.tsx): Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement.
- [src/app/new-note.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/new-note.tsx): Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement.
- [src/app/sparring/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/sparring/index.tsx): Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement.
- [src/app/welcome.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/welcome.tsx): Cannot access refs during render.
- [src/components/action-menu.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/action-menu.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/components/celebration.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/celebration.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/components/debate-form.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/debate-form.tsx): (BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause.
- [src/components/live-run.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/live-run.tsx): Cannot access refs during render.
- [src/components/outline.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/outline.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled; Existing memoization could not be preserved.
- [src/components/source-file-reader.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/source-file-reader.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/components/source-view.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/source-view.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/components/sparring-views.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/sparring-views.tsx): Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement.
- [src/components/success-check.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/success-check.tsx): React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled.
- [src/components/toast.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/toast.tsx): (BuildHIR::lowerExpression) Support UpdateExpression where argument is a global.
- [src/lib/debate-context.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/debate-context.tsx): Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement.
- [src/lib/settings.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings.tsx): (BuildHIR::lowerStatement) Handle TryStatement without a catch clause.
- [src/lib/source-file.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-file.tsx): (BuildHIR::lowerExpression) Support UpdateExpression where argument is a global.

After:

- [src/app/sparring/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/sparring/index.tsx):187: Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement. The request bodies are outside the clock-only scope.
- [src/components/celebration.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/celebration.tsx):130: React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled. The trigger effect is outside the CountUp-only scope.

## Verification

All checks used Node 22.23.2 with NODE_OPTIONS=--max-old-space-size=3072. Dependencies were already installed; npm ci was not run.

- Mobile typecheck: passed.
- ESLint on every changed TypeScript file: passed with no warnings.
- Focused Vitest: 11 files, 68 tests passed. The paragraph test passed again after adding the empty-source case.
- Compiler audit: passed, with the two protected skips listed above.
- git diff --check: passed.

The new early-copy cases failed before implementation, then passed. An additional slow-disk/fast-401 case reproduced delayed error delivery and passed after racing the disk and network answers. Intermediate typechecks found declaration ordering, closure narrowing and nullable-preload typing errors; those were corrected before the final pass.

Exact final commands:

```sh
export NVM_DIR=$HOME/.nvm
. $NVM_DIR/nvm.sh
nvm use 22
export NODE_OPTIONS=--max-old-space-size=3072
npm run -w @debatelab/mobile typecheck
node apps/mobile/scripts/compiler-audit.mjs
npx eslint \
  'apps/mobile/src/app/(tabs)/(debate)/index.tsx' \
  'apps/mobile/src/app/(tabs)/(library)/library.tsx' \
  'apps/mobile/src/app/(tabs)/(prepare)/prepare.tsx' \
  'apps/mobile/src/app/(tabs)/(you)/you.tsx' \
  apps/mobile/src/app/_layout.tsx \
  apps/mobile/src/app/add-file.tsx \
  apps/mobile/src/app/add-link.tsx \
  apps/mobile/src/app/ask.tsx \
  apps/mobile/src/app/attack/index.tsx \
  apps/mobile/src/app/brainstorm/index.tsx \
  apps/mobile/src/app/context-review.tsx \
  apps/mobile/src/app/debate-check.tsx \
  apps/mobile/src/app/debates.tsx \
  'apps/mobile/src/app/factoids/[id].tsx' \
  apps/mobile/src/app/factoids/index.tsx \
  apps/mobile/src/app/flowchart/index.tsx \
  apps/mobile/src/app/flowchart/maps.tsx \
  apps/mobile/src/app/generate.tsx \
  apps/mobile/src/app/history.tsx \
  apps/mobile/src/app/limit.tsx \
  apps/mobile/src/app/new-note.tsx \
  'apps/mobile/src/app/source/[id].tsx' \
  apps/mobile/src/app/sparring/index.tsx \
  apps/mobile/src/app/welcome.tsx \
  apps/mobile/src/components/action-menu.tsx \
  apps/mobile/src/components/celebration.tsx \
  apps/mobile/src/components/debate-form.tsx \
  apps/mobile/src/components/list-screen.tsx \
  apps/mobile/src/components/live-run.tsx \
  apps/mobile/src/components/outline.tsx \
  apps/mobile/src/components/sheet.tsx \
  apps/mobile/src/components/source-file-reader.tsx \
  apps/mobile/src/components/source-view.tsx \
  apps/mobile/src/components/sparring-views.tsx \
  apps/mobile/src/components/success-check.tsx \
  apps/mobile/src/components/toast.tsx \
  apps/mobile/src/lib/dates.ts \
  apps/mobile/src/lib/debate-context.tsx \
  apps/mobile/src/lib/debates.ts \
  apps/mobile/src/lib/history.ts \
  apps/mobile/src/lib/i18n.ts \
  apps/mobile/src/lib/offline-cache.test.ts \
  apps/mobile/src/lib/offline-cache.ts \
  apps/mobile/src/lib/settings.tsx \
  apps/mobile/src/lib/source-file.tsx \
  apps/mobile/src/lib/sources.ts \
  apps/mobile/src/lib/i18n.test.ts \
  apps/mobile/src/lib/run-request.test.ts \
  apps/mobile/src/lib/run-request.ts \
  apps/mobile/src/lib/settings-cache.test.ts \
  apps/mobile/src/lib/settings-cache.ts \
  apps/mobile/src/lib/source-paragraphs.test.ts \
  apps/mobile/src/lib/source-paragraphs.ts
npx vitest run \
  apps/mobile/src/lib/offline-cache.test.ts \
  apps/mobile/src/lib/live-value.test.ts \
  apps/mobile/src/lib/sources.test.ts \
  apps/mobile/src/lib/settings-cache.test.ts \
  apps/mobile/src/lib/i18n.test.ts \
  apps/mobile/src/lib/source-paragraphs.test.ts \
  apps/mobile/src/lib/run-request.test.ts \
  apps/mobile/src/lib/ask.test.ts \
  apps/mobile/src/lib/results.test.ts \
  apps/mobile/src/lib/offline-queue.test.ts \
  packages/core/src/sparring/session.test.ts --maxWorkers=1
npx vitest run apps/mobile/src/lib/source-paragraphs.test.ts --maxWorkers=1
git diff --check
```

No iPhone, Expo Go, simulator, browser, bundle-size, startup-time or frame-rate proof was collected. No build, export, Metro, Expo, EAS, Playwright, Docker, Supabase stack, full verify, hosted check, push, PR, merge or rebase was run.

## Changed files

- [AGENTS.md](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/AGENTS.md)
- [scripts/compiler-audit.mjs](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/scripts/compiler-audit.mjs)
- [src/app/(tabs)/(debate)/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(debate)/index.tsx)
- [src/app/(tabs)/(library)/library.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(library)/library.tsx)
- [src/app/(tabs)/(prepare)/prepare.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(prepare)/prepare.tsx)
- [src/app/(tabs)/(you)/you.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/(tabs)/(you)/you.tsx)
- [src/app/_layout.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/_layout.tsx)
- [src/app/add-file.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/add-file.tsx)
- [src/app/add-link.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/add-link.tsx)
- [src/app/ask.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/ask.tsx)
- [src/app/attack/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/attack/index.tsx)
- [src/app/brainstorm/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/brainstorm/index.tsx)
- [src/app/context-review.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/context-review.tsx)
- [src/app/debate-check.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/debate-check.tsx)
- [src/app/debates.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/debates.tsx)
- [src/app/factoids/[id].tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/factoids/[id].tsx)
- [src/app/factoids/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/factoids/index.tsx)
- [src/app/flowchart/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/flowchart/index.tsx)
- [src/app/flowchart/maps.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/flowchart/maps.tsx)
- [src/app/generate.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/generate.tsx)
- [src/app/history.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/history.tsx)
- [src/app/limit.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/limit.tsx)
- [src/app/new-note.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/new-note.tsx)
- [src/app/source/[id].tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/source/[id].tsx)
- [src/app/sparring/index.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/sparring/index.tsx)
- [src/app/welcome.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/app/welcome.tsx)
- [src/components/action-menu.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/action-menu.tsx)
- [src/components/celebration.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/celebration.tsx)
- [src/components/debate-form.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/debate-form.tsx)
- [src/components/list-screen.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/list-screen.tsx)
- [src/components/live-run.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/live-run.tsx)
- [src/components/outline.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/outline.tsx)
- [src/components/sheet.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/sheet.tsx)
- [src/components/source-file-reader.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/source-file-reader.tsx)
- [src/components/source-view.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/source-view.tsx)
- [src/components/sparring-views.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/sparring-views.tsx)
- [src/components/success-check.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/success-check.tsx)
- [src/components/toast.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/components/toast.tsx)
- [src/lib/dates.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/dates.ts)
- [src/lib/debate-context.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/debate-context.tsx)
- [src/lib/debates.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/debates.ts)
- [src/lib/history.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/history.ts)
- [src/lib/i18n.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/i18n.test.ts)
- [src/lib/i18n.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/i18n.ts)
- [src/lib/offline-cache.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.test.ts)
- [src/lib/offline-cache.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/offline-cache.ts)
- [src/lib/run-request.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/run-request.test.ts)
- [src/lib/run-request.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/run-request.ts)
- [src/lib/settings-cache.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings-cache.test.ts)
- [src/lib/settings-cache.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings-cache.ts)
- [src/lib/settings.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/settings.tsx)
- [src/lib/source-file.tsx](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-file.tsx)
- [src/lib/source-paragraphs.test.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-paragraphs.test.ts)
- [src/lib/source-paragraphs.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/source-paragraphs.ts)
- [src/lib/sources.ts](/home/codex/.t3/worktrees/DebateLab/t3-a50e262e/apps/mobile/src/lib/sources.ts)
