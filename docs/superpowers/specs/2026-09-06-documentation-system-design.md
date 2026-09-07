# DebateLab documentation system design

**Status:** Approved in chat on 2026-09-06

## Goal

Replace DebateLab's stale, duplicated documentation with a concise system that gives people and coding agents accurate orientation without loading the whole repository into context.

The repository is DebateLab. Agents must derive the active checkout with `git rev-parse --show-toplevel` and operate in that current worktree. `/home/codex/Projects/DebateLab` is only the conventional primary checkout on Adam's VPS, not an instruction to leave an assigned worktree.

## Problem

The root `README.md` is a long historical product specification. It still names `debate-navigator`, documents obsolete setup commands, older framework versions, an incomplete route map, one Supabase function, an old database model, and retired CI and deployment examples. Agents read these claims as current instructions, choose the wrong directory, and spend context on information they could discover from source.

`AGENTS.md` has the best current operational guidance, but it carries detailed staging procedures that most tasks do not need and does not route readers to focused documents. `supabase/README.md`, the plan index, dated SEO notes, and a historical security scan also need clearer status or current ownership.

## Design principles

1. Keep always-loaded instructions short. `AGENTS.md` contains durable rules, canonical commands, safety constraints, a shallow architecture map, and links that say when to read deeper documents.
2. Use progressive disclosure. Detailed setup, testing, operations, and backend procedures live in focused files and load only when the task needs them.
3. Keep one source for each fact. Commands come from `package.json`; CI behavior comes from workflow files; schema history comes from migrations; runtime behavior comes from source. Documentation links to those sources instead of copying large inventories.
4. Document non-obvious boundaries. Ports, staging isolation, authentication boundaries, deployment safety, shared state, and generated files belong in documentation because agents cannot safely infer them from one file.
5. Prefer stable maps. Architecture documentation covers system and container-level flows plus entry points. It does not maintain class-level diagrams or exhaustive file trees.
6. Treat drift as a defect. A dependency-free documentation check rejects the retired local directory name and broken local Markdown links.

These principles follow current first-party guidance from OpenAI Codex, Anthropic Claude Code, GitHub Copilot, Diátaxis, C4, and Google's technical-writing course. The decision record will preserve the source links and project-specific reasoning.

## Information architecture

### Always loaded

#### `AGENTS.md`

Target: no more than 150 lines. The current 70-line file is the baseline, so the rewrite must earn every added line and should remain shorter where possible.

Contents:

- Repository identity plus the rule that `git rev-parse --show-toplevel` and the current assigned worktree are authoritative. The VPS primary-checkout path may appear only as labeled host context.
- Node, npm, and clean-install requirements.
- Normal development, browser, and local Supabase ports.
- Short system map and implementation entry points.
- Canonical focused checks and `npm run verify`.
- Hard rules for secrets, staging, production, browser evidence, and local Supabase concurrency.
- A document router that tells agents which focused file to read for development, testing, operations, backend, architecture, or plans.

Detailed staging setup, full command explanations, and long procedures move out of this file.

### Human entry point

#### `README.md`

Target: roughly 200 to 300 lines.

Contents:

- Product purpose and live application link.
- Current feature summary.
- Supported stack at a useful level, without a dependency inventory.
- `npm ci`, `npm run dev`, and the shortest useful verification command.
- Current high-level frontend, backend, database, and deployment map.
- Links to focused documentation.
- Security and contribution expectations at summary level.

It must not include copied database DDL, provider model catalogs, a complete source tree, obsolete deployment recipes, or roadmap claims without an owner.

### Documentation index

#### `docs/README.md`

A compact router grouped by job:

- Understand the system.
- Set up and develop.
- Test and verify.
- Operate or deploy.
- Work on Supabase.
- Review active plans or historical evidence.

Each link says when to open it. The index defines documentation freshness labels for readers: current, plan, evidence snapshot, generated, or historical.

The checker uses one code-owned classification rule instead of duplicating a manifest. Every Markdown file is checked by default. It excludes only generated output, vendor documentation, immutable pricing evidence, historical security scans, and plan/spec artifacts that intentionally quote old state. `plans/README.md` remains included even though other plan files are excluded. Any new Markdown file outside an explicit excluded prefix is checked automatically.

### Focused current documentation

#### `docs/architecture.md`

- System context and major containers.
- Browser-to-Supabase and AI request flows.
- State ownership and persistence boundaries.
- Authentication and authorization boundaries.
- Billing, observability, PWA, and native-shell boundaries.
- Stable entry-point paths and source-of-truth links.

#### `docs/development.md`

- Prerequisites and clean setup.
- Environment resolution without secret values.
- Superset worktree behavior and port allocation.
- Common frontend, Edge Function, database, and iOS workflows.
- Coding conventions that are not already enforced by tooling.
- Troubleshooting tied to current commands.

#### `docs/testing.md`

- Verification ladder and what each command proves.
- Focused unit, Edge Function, database, Chromium, WebKit, and staging gates.
- Local Supabase locking and cleanup.
- Credential handling and the limits of stub sessions.
- Difference between local evidence and current-head CI evidence.

#### `docs/operations.md`

- Current GitHub Actions workflow and Docker packaging.
- Staging environment contract.
- Production deployment boundaries and required authorization.
- CORS, migrations, Edge Functions, rollback evidence, and live verification.
- Links to workflow, Docker, Nginx, and Supabase configuration sources.

#### `supabase/README.md`

- Current function directory map grouped by responsibility.
- Shared modules and authentication model.
- Migration and pgTAP workflow.
- Required secret names without values.
- Local, staging, and production boundaries.
- Links to deeper testing and operations docs rather than copied procedures.

### Decision record

#### `docs/decisions/001-agent-friendly-documentation.md`

A concise record of the progressive-disclosure decision, rejected alternatives, maintenance rules, and official source links. It is explanatory evidence, not an always-loaded instruction file.

### Plans and historical material

- `plans/README.md` remains the active plan index. It records the last reconciliation point and warns that every plan must be checked against current source before execution.
- `plans/done/bugs.txt` moves to `plans/bugs.md` only after each item is checked against current source. The misleading `done` location is removed.
- Pricing snapshots remain immutable evidence.
- Dated SEO notes receive a clear historical-snapshot banner and stay out of current guidance.
- The historical security scan either gets an accurate artifact index or loses its broken `report.md` pointer. It must not imply that an old revision proves current security.
- Generated iOS documentation and public machine-readable assets remain untouched unless a verified contradiction is found.

## Documentation check

Add `scripts/check-docs.mjs` using Node's standard library and expose it as `npm run docs:check`.

The checker exports its core function for tests and uses a fail-closed file policy:

1. Walk repository Markdown files and include new files by default.
2. Exclude only these exact repository-relative prefixes: `.git/`, `node_modules/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `ios/App/CapApp-SPM/`, `docs/pricing-snapshots/`, `security/scans/`, `docs/superpowers/`, and `plans/`. `plans/README.md` is an explicit included exception. These exclusions live in one constant in the checker, with comments naming the owner and reason.
3. Reject actionable retired checkout forms: `cd debate-navigator`, a path segment named `debate-navigator`, and `/home/codex/Projects/debate-navigator`. Historical prose may name the former repository only when it does not form a command or path.
4. Validate inline Markdown links and reference definitions. For local targets, strip query and fragment suffixes, decode percent-encoded paths, resolve relative to the document, and require the target file or directory to exist. Ignore HTTP(S), `mailto:`, `tel:`, `data:`, and fragment-only targets. Fragment-anchor validity is explicitly out of scope.
5. Print the document, line, and failing value.

Put tests at `src/test/docs/check-docs.test.ts`, which the current Vitest include already executes. Tests use temporary directories and cover default inclusion, each excluded class, the plan-index exception, retired command/path forms, valid and missing inline links, reference definitions, percent-encoded paths, query/fragment suffixes, external schemes, and fragment-only links.

Add `npm run docs:check` to `npm run verify` and as its own step in `.github/workflows/deploy.yml`. The explicit CI step is required because that workflow runs quality commands individually rather than invoking `npm run verify`.

The check does not claim to validate Markdown syntax, remote URLs, heading fragments, or factual prose. Documentation names a finite set of copied operational facts and their owners: scripts and runtime versions come from `package.json`; test selection from Vitest and Playwright config; CI behavior from `.github/workflows/`; ports from Vite, Playwright, Supabase, and `.superset/` config; CORS from Edge Function shared code; packaging from `Dockerfile` and `nginx.conf`. Changes to an owning source require reviewing the linked document in the same change.

## Scope and non-goals

In scope:

- Update `.gitignore` to track maintained `docs/**/*.md`; generated, evidence, and historical exclusions remain explicit rather than relying on the blanket `*.md` rule.
- Rewrite maintained orientation, development, testing, operations, and backend documentation.
- Correct stale repository identity and command claims.
- Add the focused documentation check and tests.
- Label or index existing plans and historical evidence accurately.

Out of scope:

- Product feature changes.
- Database migrations, Edge Function deployment, production changes, or secret changes.
- Rewriting immutable pricing evidence or generated/vendor files.
- Creating per-agent copies such as `CLAUDE.md` or Copilot instructions that duplicate `AGENTS.md`.
- Exhaustive API, component, route, dependency, or schema catalogs that source code already provides.

## Verification

Focused checks:

- Run the documentation-check unit test.
- Run `npm run docs:check`.
- Search maintained guidance for stale repository names and obsolete setup commands.
- Review every local Markdown link reported by the checker.

Repository checks:

- Run `npm run lint` and `npm run typecheck` because the new checker and tests are JavaScript and package-script changes.
- Run the relevant Vitest suite.
- Run `npm run build` to confirm documentation and package-script edits do not disturb packaging.
- Run the full `npm run verify` gate if time and installed browser dependencies permit. Report any browser or credential-bound gate that did not run.

## Success criteria

- A fresh agent can identify DebateLab and remain inside its assigned Git worktree without guessing or jumping to the primary checkout.
- Root instructions fit in a small context budget and route specialized tasks to focused documents.
- Current setup, architecture, testing, Supabase, CI, staging, and deployment descriptions agree with checked-in source.
- Maintained documentation contains no broken local links or retired checkout instructions.
- Historical evidence is clearly labeled and cannot be mistaken for current operational guidance.
- The standard verification gate prevents the original stale-path failure from returning.
