# DebateLab verification map

This directory is the maintained source for verifying DebateLab's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe. The skill's `SKILL.md` covers launch, doctor, evidence, and cleanup.

## Baseline preconditions

- `bin/verify.sh up` has printed `READY http://127.0.0.1:18081`, and `bin/verify.sh doctor` exits 0.
- The browser client is the `up` instance at `http://127.0.0.1:18081`. Never use the `debatelab` container on `:8080` or a plain `npm run dev`, because both reach production.
- Each scripted test signs in with its own fresh demo-code user (a Pro account with a daily limit of 999) and deletes it afterwards.
- Model answers come from the fake provider and contain the marker `FAKE-PROVIDER`.

## Driving conventions

- Scripted runs go in `recipes/<feature>.spec.ts`, import from `./fixtures`, and run with `bin/verify.sh drive <feature>`.
- Interactive runs use `bin/verify.sh user` to get a code, then sign in on `/login`.
- Prefer roles and accessible names. Crossfire's `data-testid` handles are the exception.
- Wait for the `FAKE-PROVIDER` text or a named element, never a fixed sleep. AI calls can take up to about 30 s on a cold function.
- Run both `desktop-chromium` and `mobile-chromium` when the change touches layout.

## Proof and skip reporting

- UI proof is an ARIA snapshot plus a screenshot before and after the action, with `steps.log` naming each action.
- Side-effect proof is `providerCall("<feature>")` (what the Edge Function sent upstream) plus the rows read back through `admin`.
- Record the feature ID and entry point with every artifact.
- Report as unverified anything that needs live models, Exa web research, real Jev judgement, Stripe Checkout, Google export, staging, or production. Local runs cannot prove those.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections, in this order:

- `Sub-features`
- `How to get to it (user POV)`
- `Driving it with verify.sh + Playwright`
- `Gotchas`

## Features

- [Demo-code sign-in](./auth-demo-login.md) covers sign-in, session persistence, a rejected code, and sign-out.
- [Case generation](./case-generation.md) covers generating, provider failure and retry, quota block, saving to History, and export. It has a recipe: `recipes/case-generation.spec.ts`.
- [Library sources](./library-sources.md) covers adding, toggling, and deleting sources, and grounding AI prompts in active sources.
- [AI tools](./ai-tools.md) covers Attack, Brainstorm, Factoids, and Ask, both streamed and cited.
- [Practice](./practice.md) covers Sparring rounds and Crossfire.

Not yet mapped: Workspaces and collaboration (needs `up --collab`; see `e2e/workspace-collaboration.spec.ts`), Flowchart, Timer, Settings, billing and promo codes, Admin announcements, public share links, and the public landing pages.
