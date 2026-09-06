# Bugs and polish backlog

**Status:** Active backlog. Reverified against `super-cauliflower` at `cc39416` on 2026-09-06.

All four items below still reproduce in current source. Recheck them again before implementation because line numbers and product decisions can change.

## Preconditions

- Use the current assigned worktree. Confirm it with `git rev-parse --show-toplevel`, then inspect the branch and working tree.
- Use Node 22, npm, and the committed lockfile. Run `npm ci` before verification.
- Keep changes scoped to one backlog item at a time and add its failing proof first.
- Do not deploy, publish, alter Supabase state, or change secrets during this frontend and localization work.

## Retained items

### 1. Static consultation date

`src/pages/SourcesPage.tsx` still renders `[Consulta: 8 de marzo de 2026]` for every source.

Remove the stale fixed date or derive it from an intentional source/research timestamp. Add a focused render test and browser assertion that the stale hard-coded date is absent.

Likely files:

- `src/pages/SourcesPage.tsx`
- `src/test/pages/SourcesPage.test.tsx`
- `e2e/quality-backlog.spec.ts`

### 2. Factoids save button lacks an accessible name

`src/components/features/factoids/FactoidsResults.tsx` still renders an icon-only save button with a translated `title` but no `aria-label` or visible text.

Add a localized accessible name tied to the factoid claim and test it with a role-and-name query. Recheck the other icon-only controls in that file while staying within this item.

Likely files:

- `src/components/features/factoids/FactoidsResults.tsx`
- `src/test/components/FactoidsResults.test.tsx`
- `e2e/quality-backlog.spec.ts`

### 3. Navigation and feature headings use different vocabulary

The English `nav.*` keys still use short labels such as `Generate`, `Attack`, `Brainstorm`, and `Ask`, while feature headings use longer names.

Choose one product vocabulary, reuse the matching keys for navigation and H1 text, and update English, Spanish, and Hungarian together. Add authenticated browser assertions for nav-to-heading agreement in each locale.

Likely files:

- `src/components/layout/AppLayout.tsx`
- `src/pages/GeneratePage.tsx`
- `src/pages/AttackPage.tsx`
- `src/pages/BrainstormPage.tsx`
- `src/pages/FactoidsPage.tsx`
- `src/pages/AskPage.tsx`
- `src/locales/en.json`
- `src/locales/es.json`
- `src/locales/hu.json`
- `e2e/quality-backlog.spec.ts`

### 4. Selected Flowchart node deletion has no feedback

`deleteSelectedNode` in `src/pages/FlowchartPage.tsx` still removes a node and connected edges immediately, clears selection, and provides no confirmation, undo path, success message, or error path. Saved-flowchart deletion has separate toast handling and remains out of scope.

Add a confirmation or undo path appropriate for the editor, then localized feedback. Cover both accepted and cancelled or recovered behavior with a focused page test.

Likely files:

- `src/pages/FlowchartPage.tsx`
- `src/locales/en.json`
- `src/locales/es.json`
- `src/locales/hu.json`
- `src/test/pages/FlowchartPage.test.tsx`
- `e2e/quality-backlog.spec.ts`

## Verification

Run the focused test for each item, then:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e -- e2e/quality-backlog.spec.ts
```

Do not reuse an existing Vite server. State which desktop, mobile, and locale flows ran. Static search alone is not browser proof.
