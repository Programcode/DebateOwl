# DebateLab documentation system implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale DebateLab documentation with a concise, progressive-disclosure system and prevent the retired checkout path or broken local links from returning.

**Architecture:** Keep `AGENTS.md` and `README.md` short, route specialized work to focused documents, and make checked-in source files the owners of operational facts. Add one dependency-free Node checker that includes Markdown by default, uses explicit exclusions, validates the repository's supported local-link forms, and runs locally and in PR CI.

**Tech stack:** Markdown, Node.js 22 standard library, TypeScript 5.8, Vitest 4, npm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-documentation-system-design.md`

## Global constraints

- The current result of `git rev-parse --show-toplevel` and the assigned worktree are authoritative.
- Do not add dependencies.
- Keep `AGENTS.md` at or below 150 lines.
- Include new Markdown in checks by default; exclusions must be exact path prefixes.
- Do not alter product behavior, production infrastructure, secrets, migrations, pricing evidence, generated iOS docs, or public machine-readable assets.
- Do not claim remote URLs, Markdown syntax, or heading fragments are validated.

---

### Task 1: Documentation drift gate

**Files:**
- Create: `src/test/docs/check-docs.test.ts`
- Create: `scripts/check-docs.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `checkDocs(rootDir: string): Promise<DocIssue[]>` exported from `scripts/check-docs.mjs`.
- Produces: `DocIssue` runtime objects with `file`, `line`, and `message` string properties.
- Produces: `npm run docs:check`, with exit code 0 when no issues exist and 1 when issues exist.

- [ ] **Step 1: Write the failing tests**

Create `src/test/docs/check-docs.test.ts`. Import `checkDocs` from `../../../scripts/check-docs.mjs`. Use `mkdtemp`, `mkdir`, `writeFile`, and `rm` from Node's standard library. Cover:

1. A root `README.md` with an existing inline local link returns no issues.
2. A new Markdown file in an arbitrary directory is included by default.
3. `plans/README.md` is checked while another file under `plans/` is excluded.
4. Each exact excluded prefix is ignored.
5. `cd debate-navigator`, `/tmp/debate-navigator/file`, and `/home/codex/Projects/debate-navigator` produce stale-path issues.
6. Historical prose containing bare `debate-navigator` does not fail.
7. Missing inline and reference-definition targets fail.
8. Existing percent-encoded targets and targets with query or fragment suffixes pass.
9. HTTP(S), `mailto:`, `tel:`, `data:`, and fragment-only targets pass.

- [ ] **Step 2: Run the focused test and confirm RED**

Run `npx vitest run src/test/docs/check-docs.test.ts`.

Expected result: failure because `scripts/check-docs.mjs` does not exist.

- [ ] **Step 3: Implement the minimum checker**

Create `scripts/check-docs.mjs` with:

- exact excluded prefixes `.git/`, `node_modules/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `ios/App/CapApp-SPM/`, `docs/pricing-snapshots/`, `security/scans/`, `docs/superpowers/`, and `plans/`;
- an explicit `plans/README.md` inclusion before prefix exclusion;
- recursive `readdir` with directory entries;
- stale command/path regexes limited to actionable forms;
- inline-link and reference-definition extraction;
- local-target normalization that strips query/fragment, decodes percent encoding, and resolves from the document directory;
- executable CLI behavior guarded by comparison with `pathToFileURL(process.argv[1]).href`.

Print each issue as `<file>:<line> <message>` and set `process.exitCode = 1` when issues exist.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run `npx vitest run src/test/docs/check-docs.test.ts`.

Expected result: all documentation-check tests pass.

- [ ] **Step 5: Wire local and CI gates**

Add `"docs:check": "node scripts/check-docs.mjs"` to `package.json`. Insert `npm run docs:check` at the start of `verify`. Add a `Documentation` step after install and before lint in `.github/workflows/deploy.yml`.

Update `.gitignore` to track `docs/**/*.md` while retaining the existing local-note ignores. Do not unignore generated or dependency output.

- [ ] **Step 6: Verify the gate**

Run `npm run docs:check`, `npm run lint`, and `npm run typecheck`.

Expected result: all three exit 0 after documentation rewrites in Tasks 2 and 3. Before those rewrites, record stale-document findings and continue directly to Task 2.

### Task 2: Current orientation and focused docs

**Files:**
- Modify: `AGENTS.md`
- Rewrite: `README.md`
- Create: `docs/README.md`
- Create: `docs/architecture.md`
- Create: `docs/development.md`
- Create: `docs/testing.md`
- Create: `docs/operations.md`
- Create: `docs/decisions/001-agent-friendly-documentation.md`

**Interfaces:**
- `AGENTS.md` is the always-loaded rule and routing file.
- `README.md` is the human quick start.
- `docs/README.md` is the on-demand documentation router.
- Operational facts link to their owning source files.

- [ ] **Step 1: Map current source owners**

Read only the entry points needed for factual claims: `src/App.tsx`, `src/main.tsx`, `src/lib/supabase/env.ts`, `src/lib/ai/client.ts`, `src/lib/stores/`, `supabase/config.toml`, `supabase/functions/`, `.github/workflows/`, `playwright.config.ts`, `vite.config.ts`, `Dockerfile`, `nginx.conf`, `.superset/`, and `capacitor.config.ts`.

- [ ] **Step 2: Rewrite `AGENTS.md`**

Keep it at or below 150 lines. Include:

- current-worktree authority using `git rev-parse --show-toplevel`;
- Node 22, npm, and `npm ci`;
- ports 8080, isolated browser 18080, and local Supabase 54321;
- a five-line architecture map;
- focused commands and `npm run verify`;
- Superset worktree and database-lock safety;
- staging and secret prohibitions that must be known before opening deeper docs;
- routing links to architecture, development, testing, operations, Supabase, and plans.

- [ ] **Step 3: Replace `README.md`**

Keep it between 200 and 300 lines. Cover product purpose, current feature groups, quick start, current stack, high-level architecture, repository map, environment behavior, verification, security boundaries, deployment summary, iOS shell, documentation links, and contribution expectations. Remove obsolete DDL, provider-model lists, full source trees, Watchtower instructions, old workflow examples, and the missing roadmap link.

- [ ] **Step 4: Write focused documentation**

Create:

- `docs/README.md`: current/plan/evidence/generated/historical labels and task-based routing.
- `docs/architecture.md`: browser, Supabase, AI, data, auth, billing, observability, PWA, and iOS boundaries with source entry points.
- `docs/development.md`: setup, environment resolution, Superset ports, frontend/backend/database/iOS workflows, and current troubleshooting.
- `docs/testing.md`: focused checks, full gate, DB gate, Chromium, WebKit, staging, artifacts, cleanup, and evidence limits.
- `docs/operations.md`: CI, Docker/Nginx packaging, staging contract, production authorization, CORS, migrations/functions, rollback, and live verification.
- `docs/decisions/001-agent-friendly-documentation.md`: progressive-disclosure decision, rejected duplicated-agent files and giant README approach, maintenance triggers, and official research links.

- [ ] **Step 5: Check size and links**

Run `npm run docs:check`. Confirm `AGENTS.md` is no more than 150 lines and `README.md` is between 200 and 300 lines.

### Task 3: Supabase, plans, and historical status

**Files:**
- Rewrite: `supabase/README.md`
- Modify: `plans/README.md`
- Move: `plans/done/bugs.txt` to `plans/bugs.md`
- Modify: `docs/seo-authority-opportunities-2026-07-05.md`
- Modify: `docs/seo-debatelab-2026-07-05.md`
- Modify: `docs/seo-escalation-2026-07-05.md`
- Modify: `security/scans/2026-08-19-codex-security-06d93a47/README.md`

**Interfaces:**
- `supabase/README.md` owns backend orientation.
- `plans/README.md` owns plan status, not implementation truth.
- Historical files state their date and evidentiary limits at the top.

- [ ] **Step 1: Rewrite Supabase orientation**

Document function groups, shared modules, auth boundaries, migrations, pgTAP, local DB locking, environment/secret names without values, and local/staging/production rules. Link to testing and operations docs.

- [ ] **Step 2: Reconcile plan status**

Update `plans/README.md` with the current review date and the rule that every plan must be revalidated against current source and branch state. Move `plans/done/bugs.txt` to `plans/bugs.md` after checking its four entries still describe current code; remove resolved entries instead of preserving stale backlog.

- [ ] **Step 3: Label historical evidence**

Add a short historical-snapshot notice to each dated SEO note. Update the security-scan README to state that it covers revision `7305a87`, is not current proof, and that only `findings.json` is retained. Remove the broken `report.md` pointer. Search for inbound links to the moved backlog and removed report pointer and update any maintained link in the same change.

- [ ] **Step 4: Run documentation validation**

Run `npm run docs:check` and the focused Vitest test.

Expected result: both exit 0.

### Task 4: Repository verification and review

**Files:**
- Review all files changed by Tasks 1 through 3.

- [ ] **Step 1: Run focused checks**

Run:

```bash
npx vitest run src/test/docs/check-docs.test.ts
npm run docs:check
npm run lint
npm run typecheck
npm run build
```

Expected result: every command exits 0.

- [ ] **Step 2: Run the credential-free full gate**

Run `npm run verify`.

Expected result: lint, typecheck, coverage, Edge Function tests, documentation checks, build, and desktop/mobile Chromium all pass. If browser dependencies or an external service block the run, record the exact failure without substituting mocks.

- [ ] **Step 3: Inspect the final diff**

Confirm no secrets, production mutation, generated files, immutable pricing evidence, or unrelated product code changed. Confirm `AGENTS.md` and `README.md` stay within their size limits and every changed factual claim names or links to its source owner.

- [ ] **Step 4: Request independent review**

Ask CodeRabbit or the configured reviewer to review correctness, stale duplication, link-check behavior, CI wiring, and context-window impact. Resolve every valid Critical or Warning finding and rerun affected checks.
