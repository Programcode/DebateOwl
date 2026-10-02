# PR 1: Current Debate

**Status:** Shipped in #72 (merged 2026-09-27 as `5ee0b05`). Kept as the record.

## What Adam wants

DebateLab's existing features feel like separate tools. A student enters the same motion repeatedly, manually carries material between pages, and can accidentally use sources from an older topic. Adam wants a lightweight personal debate context now, without rebuilding the postponed collaborative Workspace.

Current Debate is the personal foundation that a future Workspace can add teammates and shared editing around. It is not a document editor, team system, or smaller copy of the failed Workspace.

## Product rules

- One Current Debate follows the signed-in user throughout the app.
- It represents the whole motion because students prepare both A favor and En contra. The debate itself has no fixed side.
- Results record A favor, En contra, both, or neutral when relevant.
- Generate, Attack, Brainstorm, Factoids, Ask, Flowchart, Crossfire, and Sparring results attach automatically to the Current Debate.
- Every source belongs to exactly one debate. There is no global source library because each school debate is usually a different topic.
- If a user enters another motion in a feature, DebateLab must ask whether to switch to an existing debate, create a new debate, or use the motion once without attaching it.
- One-off work stays outside every debate unless the user later attaches it.
- After five days without meaningful work, DebateLab blocks the app and asks whether the user is still preparing the Current Debate. The only choices are Continue, Start a new debate, or Switch debate.
- Starting another debate does not delete the old one. Old debates remain available until the user deletes them.
- Each debate has structured settings plus short free-form instructions for format, roles, judge expectations, agreed definitions, school conventions, and writing preferences.
- Keep collaborative Workspace hidden and untouched.

## Exactly where Current Debate lives

### Desktop header

Replace the crowded feature navigation with:

`DebateLab | Home | Current debate ▾ | Library | History | spacer | Language | Theme | Settings`

- Current debate sits immediately after Home and before Library.
- Do not keep Generate, Attack, Ask, Crossfire, Sparring, More, or any other feature in the header.
- The compact header control says `Current debate` and has a chevron. Its accessible label includes the current motion.
- Clicking it opens a small popover with the full motion, last activity, source/output counts, and four actions: Open debate, Switch debate, Start new debate, and Use one-off mode.
- If no debate exists, the control says `Start debate`.
- Language, theme, and Settings remain grouped on the far right.

### Mobile header

- First row: DebateLab logo/name on the left, language, theme, and menu on the right.
- Second compact row: `Current debate ▾` plus the motion truncated to one line.
- The mobile menu contains only Home, Current debate, Library, History, and Settings.
- Do not put every feature back into the mobile menu.

### Home

- Keep Home as the main tool launcher.
- At the top, show the Current Debate motion, last activity, sources, output count, and an Open debate action.
- Keep the existing Prepare and Practice tool groups below it.
- Opening a tool from Home automatically uses the Current Debate unless the user deliberately chooses one-off mode.

### Current Debate dashboard

- Show the full motion first.
- Show A favor and En contra as equal sections, with their latest relevant work and counts.
- Show debate-specific sources, recent work, and direct actions for the existing preparation and practice tools.
- This page organizes existing results. It does not add files, collaborative editing, comments, teammates, or Workspace concepts.

### Inside every feature

- Directly below the feature title, show a compact strip: `Working in: <motion>` with the selected side where relevant.
- The strip offers Change and Use once actions.
- The form starts with the Current Debate motion already filled. Do not silently overwrite text the user has already edited.
- A different motion triggers the Switch, Create, or Use once choice before submission.
- PR 2 will add the detailed “Using 6 sources and 2 outputs” control above the submit button.

### Library and History

- Library shows sources for the Current Debate only. Switching debates switches the Library.
- A user must select or create a debate before adding or importing a source.
- History defaults to the Current Debate, with older debates and one-off work still reachable. It must never flatten all material into one context again.

## Data migration

- Keep legacy cases, attacks, brainstorms, factoids, chats/messages, flowcharts, sparring sessions, and sources created within the last 30 days.
- Put that recent material in an Unsorted view. Suggest a debate using exact motion/title matches, but require the user to confirm attachment.
- Delete older legacy material and dependent source files/messages in the migration.
- This is a one-time cleanup. Do not add permanent 30-day deletion for new debates.
- Write and test the migration locally, but do not apply the destructive migration remotely without Adam's explicit authorization for that environment.

## Proof

- Database tests for ownership, current-debate switching, source isolation, and the 30-day cutoff.
- Focused UI/store tests for the five-day blocking gate, motion mismatch choices, and automatic result attachment.
- One desktop/mobile browser journey covering two debates and proving their motions, sources, and results never mix.
- Run locally at final head:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run verify
./.superset/db-gate.sh
```

GitHub Actions are currently unreliable. Record local results in the PR and do not weaken tests to satisfy CI.

## Agent prompt

Implement PR 1 from `plans/2026-09-25_074255-current-debate-foundation.md` in a fresh worktree from current `origin/main`.

Adam wants DebateLab's existing tools to feel like one product. Build a personal Current Debate that carries the whole motion, both sides, debate-specific sources, and automatically saved results across every existing feature. Follow the plan's header, mobile, Home, debate-dashboard, feature-strip, Library, History, five-day gate, one-off, and migration behavior exactly. Preserve DebateLab's current visual style.

Do not revive collaborative Workspace, build a document editor, add teams, add a second storage system, or create abstractions for future Workspace work. Use the smallest changes that fit the existing stores and tables. Start with focused failing tests, then implement the complete browser journey.

Run focused checks while working, followed by `npm run verify` and `./.superset/db-gate.sh` once at final head because GitHub Actions are currently unreliable. Commit, push, and open a PR titled `feat: add personal current debate context`. Include exact local results. Do not merge, deploy, or apply the destructive migration remotely.
