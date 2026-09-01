# Rate-limit UI cleanup plan

**Status as of 2026-08-31:** Partially complete. Marketing and upgrade copy was already softened; the remaining change is the prominent numeric usage block in Settings.

## Goal

Keep server-side quota protection and the blocked-request explanation intact while removing numeric daily-limit messaging from routine marketing and account chrome. Users should still understand why a request was blocked and when access can return.

## Prerequisites and isolation

- Use Node 22.x as declared in `package.json`, npm, and the checked-in `package-lock.json`.
- Work in this plan's own isolated T3 Code worktree and feature branch. Before editing, run `pwd`, `git branch --show-current`, `git status --short --untracked-files=all`, and `git worktree list`. Confirm the worktree is not `main` and is not another plan worktree.
- Preserve every pre-existing dirty or untracked change. Do not reset, clean, checkout, or edit files outside this plan's scope.
- This plan has no Supabase operation. Publishing the frontend change still requires Adam's explicit production approval; do not change quotas, secrets, or production data.
- Before browser checks, confirm port `18080` is unoccupied. With `CI=1`, the current `playwright.config.ts` starts a fresh Vite server instead of reusing another checkout.

## Current verified baseline

- Commit `5286005` changed the landing Hero, pricing copy, FAQ, and upgrade note in all three locales so they no longer advertise fixed daily counts. The current `src/components/landing/Hero.tsx`, `Pricing.tsx`, and `PricingModal.tsx` use the softened keys.
- `src/hooks/use-subscription.ts` still reads the server entitlement and usage values needed for gating. `src/pages/SettingsPage.tsx` currently renders the explicit `dailyUsed / dailyLimit` fraction, a percentage `Progress`, a reset countdown, and a tooltip describing paused access.
- `src/components/features/subscription/LimitReachedModal.tsx` intentionally shows the current/limit values when a request is blocked. `src/hooks/use-subscription-error.ts` and the AI client preserve the subscription error variant and values. This is the explanatory error surface and must remain.
- `supabase/functions/ai/index.ts`, `supabase/functions/ai-stream/index.ts`, and `supabase/functions/import-source/index.ts` reserve quota through the server-only `consume_daily_quota` RPC. `src/test/security-hardening.test.ts` covers the shared reservation contract. The admin dashboard still needs its usage/limit data for operations.
- `src/locales/en.json`, `src/locales/es.json`, and `src/locales/hu.json` still contain the Settings-specific daily usage/countdown/tooltip strings used by `SettingsPage.tsx`. There is no Settings page test for the numeric block, and `e2e/authed-pages.spec.ts` only checks that the route renders.

## Remaining scope

Make the routine Settings card non-numeric. Replace the usage fraction, progress bar, reset countdown, and numeric-limit tooltip with a concise localized access-status note, while retaining subscription tier, billing controls, and the error modal shown after a blocked AI request. Remove only the now-unused Settings copy keys from all locales or replace them with the new non-numeric key set. Do not alter quota calculations, RPCs, admin usage, server error payloads, pricing amounts, or the already-landed marketing copy.

## Likely files

- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Create: `src/test/pages/SettingsPage.test.tsx`
- Create: `src/test/components/LimitReachedModal.test.tsx`
- Create: `e2e/rate-limit-ui.spec.ts`
- Do not modify for this plan: `supabase/functions/ai/index.ts`, `supabase/functions/ai-stream/index.ts`, `supabase/functions/import-source/index.ts`, or `src/hooks/use-subscription.ts`

## Sequenced implementation

### 1. Simplify the Settings presentation

In `SettingsPage.tsx`, keep `useSubscription()` for entitlement and billing state but remove the visible `dailyUsed / dailyLimit` row, progress bar, reset countdown, and tooltip. Render one localized access-status line that does not disclose a daily number. Remove imports and derived values made unused by this change. Keep the tier badge and upgrade/manage billing controls.

### 2. Align all locale files

Add or update the same Settings key in English, Spanish, and Hungarian. The copy should explain access status without promising unlimited use or hiding the fact that an expired trial needs an upgrade. Remove obsolete keys only if no component references them, and keep locale key counts equal.

### 3. Preserve blocked-request transparency

Add a focused `LimitReachedModal` test that verifies the blocked-request variant still renders the server-provided current/limit explanation and upgrade action. Do not soften or remove `limitModal.limitReachedDesc`, the AI error payload, or the server quota checks.

### 4. Add Settings and browser coverage

Test the Settings page with trial, Pro, and expired subscription fixtures. Assert that routine Settings markup does not contain a numeric daily fraction or progress meter, while tier/billing controls remain. Extend browser coverage with an authenticated Settings visit in all supported locales and a blocked-request/modal assertion using mocked responses. Keep the existing authed route smoke suite passing.

## Verification

Run focused checks first:

```bash
npm test -- --run src/test/pages/SettingsPage.test.tsx src/test/components/LimitReachedModal.test.tsx src/test/i18n.test.ts src/test/hooks/use-subscription-error.test.ts
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e -- e2e/rate-limit-ui.spec.ts
```

Then run all gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Also run `rg -n -i 'requests/day|daily limit|daily requests|limit reached' src/components/landing src/components/features/subscription src/pages/SettingsPage.tsx src/locales` and inspect every remaining hit. Expected remaining user-facing limit hits are the blocked-request modal/error copy only; backend, admin, and test references are allowed.

## Acceptance criteria

- Landing, pricing, FAQ, upgrade prompts, and routine Settings UI do not advertise fixed daily request counts or a numeric daily-limit meter.
- Settings still shows the user's tier and the appropriate upgrade/manage-billing action. It does not promise unlimited access or change entitlement behavior.
- When the server rejects an AI request for an exhausted limit or expired trial, the existing modal/error path remains understandable, localized, and actionable, including current/limit values where supplied by the server.
- The atomic server quota checks, admin observability, provider error handling, and subscription hooks are unchanged.
- English, Spanish, and Hungarian locale files remain structurally identical and the Settings route renders without console errors on desktop and mobile.

## Rollout, rollback, and authorization

This is a frontend/localization-only change. No Supabase migration, Edge Function, quota policy, or production data mutation is required. Validate in a staging/preview build and obtain Adam's explicit approval before publishing to production.

Rollback by reverting the frontend/locale commit. That restores the prior Settings presentation without touching server quota state. If the product decision changes to show detailed usage again, restore the removed Settings block in a separate reviewed change; do not weaken backend enforcement to match UI copy.
