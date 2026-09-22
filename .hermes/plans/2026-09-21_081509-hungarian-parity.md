# Full Hungarian parity implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for native execution, or `superpowers:subagent-driven-development` if Adam explicitly chooses delegated execution. Work task by task and keep every task's test cycle intact.

**Goal:** Make Hungarian a complete product language across visible UI copy, accessibility text, browser metadata, locale formatting, speech input, saved/exported artifacts, and every AI-output path.

**Architecture:** Keep the existing React, i18next, Zustand, Supabase Edge Function, and Tailwind structure. Add one typed client-side language catalog for locale codes and labels, route all language-sensitive behavior through it, and make every AI client send the selected output language explicitly. Preserve the current interface and component system.

**Tech stack:** React 18, TypeScript 5.8, i18next/react-i18next, Zustand, Vitest, Playwright, date-fns 3, Web Speech API, Supabase Edge Functions with Deno.

**Spec:** This file is the authoritative scope and acceptance specification, based on current head `6d8c9178bb2ebfff65b1c44a934890cfc727a21f`.

**Owner:** DebateLab implementation agent. A fluent Hungarian reviewer owns linguistic signoff.

**Target environment:** The existing clean isolated worktree `/home/codex/.t3/worktrees/DebateLab/t3code-e5e1ff71`, branch `t3code/verify-hungarian-support`, using Node 22 and npm.

## Global constraints

- Planning only in this artifact. Do not implement until Adam approves execution.
- Preserve the existing visual design, route structure, analytics names, field order, and component library.
- Add no package. i18next, `Intl`, date-fns locales, Vitest, and Playwright already cover the work.
- Update `en.json`, `es.json`, and `hu.json` together whenever a translation key is added.
- Keep source titles, model names, provider names, file-format names, keyboard keycaps, debate-format abbreviations, prices, and the `DebateLab` brand in their canonical form.
- Do not translate user-authored content or provider-supplied source titles.
- Do not change database schema, RLS, quotas, billing, secrets, or deployment configuration.
- Do not run protected staging or spend provider credits without the credentials and authorization already required by `docs/testing.md`.
- Use a failing test first for each behavior change. Run the smallest relevant test before broader verification.
- No production deployment is part of this plan.

## Acceptance criteria

- Selecting `Magyar` immediately changes the interface, persists across reload and authenticated hydration, and sets `<html lang="hu">`.
- Every locale contains the same non-empty keys. Hungarian has no English-identical value except an explicit allowlist of brands, formats, prices, placeholders, and debate abbreviations.
- The 26 currently untranslated values in `askChat`, `onboarding`, and `libraryPage` are Hungarian.
- Public, authenticated, admin, error, dialog, toast, loading, empty, and accessibility-only UI has Hungarian copy.
- Dates, date-times, relative time, times, and UI number formatting use `hu-HU` while Hungarian is active.
- Dictation requests `hu-HU` from the Web Speech API while the UI language is Hungarian.
- Generate, Attack, Brainstorm, Factoids, Ask, streaming Ask, Crossfire, and Sparring all send `language: "hu"` when Hungarian AI output is selected.
- Edge prompts contain an explicit Hungarian output instruction for all AI paths. They do not rely on guessing from user content.
- Auto-saved folders, auto-generated saved-item titles, runtime toasts, and PDF/export boilerplate are localized.
- Desktop and mobile Chromium exercise representative Hungarian public and authenticated flows without English fallback or console errors.
- The Capacitor iOS build renders the same Hungarian copy and locale behavior, or the final status is explicitly scoped to web and reported `partially_verified` for the full product.
- A fluent Hungarian reviewer approves the complete `hu.json` catalog and the representative runtime flows listed below. Without that review, report `partially_verified`, never full parity.
- `npm run verify` passes at the final commit. Database tests are not required because this plan changes no database object.

## Review focus

- Persisted or server-provided invalid language values must fall back to `en`, not reach i18next, `Intl`, or prompt construction unchecked.
- Changing language after mount must update document metadata, date output, relative time, dictation locale, and visible component copy without a reload.
- Structured, streaming, and Crossfire requests must all preserve `language: "hu"`; none may silently fall back to user-message detection.
- Proper nouns and source titles may remain English while surrounding chrome is Hungarian. Tests must not mistake content for interface leakage.
- Browser speech support is conditional. Unsupported browsers must retain the existing localized unavailable/error behavior.

---

## Task 1: Add a typed language catalog and metadata contract

**Objective:** Define supported languages once and make runtime language values safe and observable.

**Files:**

- Create: `src/lib/languages.ts`
- Modify: `src/i18n.ts`
- Modify: `src/lib/stores/settings-store.ts`
- Modify: `src/components/LanguageSwitcher.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/test/i18n.test.ts`
- Modify: `src/test/stores/settings-store-additional.test.ts`
- Modify: `src/test/stores/settings-store-branches.test.ts`

**Interfaces:**

- Produce `APP_LANGUAGES`, `AppLanguage`, `isAppLanguage(value)`, `toIntlLocale(language)`, and `languageName(language)`.
- Preserve persisted values `en`, `es`, and `hu` and the existing settings-store API.

- [ ] Create the shared catalog without adding a dependency:

```ts
export const APP_LANGUAGES = {
  en: { label: 'English', intlLocale: 'en-GB', aiName: 'English' },
  es: { label: 'Español', intlLocale: 'es-ES', aiName: 'Spanish' },
  hu: { label: 'Magyar', intlLocale: 'hu-HU', aiName: 'Hungarian' },
} as const;

export type AppLanguage = keyof typeof APP_LANGUAGES;
```

- [ ] Replace repeated `'en' | 'es' | 'hu'` declarations and duplicated selector arrays with the shared type/catalog. Do not change stored values or UI layout.
- [ ] Parse hydrated local and server settings through `isAppLanguage`. Test valid `hu`, missing values, and an invalid value such as `zz`.
- [ ] Centralize language application in `src/i18n.ts`: call `i18n.changeLanguage`, set `document.documentElement.lang`, update `meta[name="language"]`, and update the browser title from locale keys. Guard DOM access for tests.
- [ ] Use the same application function from explicit setting changes, authenticated hydration, local rehydration, and reset.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/i18n.test.ts \
  src/test/stores/settings-store-additional.test.ts \
  src/test/stores/settings-store-branches.test.ts
```

Expected: language parsing, selector rendering, and document-metadata tests pass.

- [ ] Commit: `refactor(i18n): centralize language metadata`

## Task 2: Finish the Hungarian catalog and shared/public UI copy

**Objective:** Remove the known catalog gaps and localize public, shared, error, loading, and accessibility chrome.

**Files:**

- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `src/App.tsx`
- Modify: `src/pages/SourcesPage.tsx`
- Modify: `src/pages/CrossfirePage.tsx`
- Modify: `src/pages/TimerPage.tsx`
- Modify: `src/components/landing/UseCases.tsx`
- Modify: `src/components/landing/Navbar.tsx`
- Modify: `src/components/landing/Footer.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/features/sparring/SparringRound.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/toast.tsx`
- Modify: `src/components/ui/streaming-indicator.tsx`
- Modify: `src/test/pages/SourcesPage.test.tsx`
- Modify: `src/test/components/StreamingIndicator.test.tsx`
- Modify: `src/test/app-route-analytics-error-boundary.test.tsx`

- [ ] Add the failing Hungarian-copy test before changing translations. Flatten English and Hungarian as the existing test already does, then reject identical values outside this exact allowlist:

```ts
const HU_IDENTICAL_VALUE_ALLOWLIST = new Set([
  'common.pdf', 'common.docx', 'common.googleDocs',
  'home.title', 'settings.tierPro', 'settings.admin',
  'login.googleTab', 'login.verificationCodePlaceholder', 'login.demoCodePlaceholder',
  'notFound.title', 'pricing.trialPrice', 'pricing.pro', 'pricing.proPrice',
  'generateForm.lengthStandard', 'generateResults.durationMs', 'generateResults.word',
  'generateResults.pdf', 'generateResults.googleDocs', 'generateResults.exordio',
  'pricingModal.pro', 'pricingModal.freePrice', 'pricingModal.proPrice',
  'timer.formatStandard', 'timer.formatLD',
  'timer.speeches.policy.1ac', 'timer.speeches.policy.1nc',
  'timer.speeches.policy.2ac', 'timer.speeches.policy.2nc',
  'timer.speeches.policy.1nr', 'timer.speeches.policy.1ar',
  'timer.speeches.policy.2nr', 'timer.speeches.policy.2ar',
  'export.exordio', 'sparring.format.ld', 'sparring.format.pf',
  'sparring.turns.standard-1', 'sparring.turns.standard-3',
  'sparring.turns.standard-5', 'sparring.turns.standard-7',
  'sparring.scorecard.exportPdf',
  'langSwitcher.en', 'langSwitcher.es', 'langSwitcher.hu',
]);
```

Expected failure: the test reports the current 26 English entries under `askChat`, `onboarding`, and `libraryPage`.

- [ ] Translate these 26 existing Hungarian values and leave their keys unchanged:
  - `askChat.savedChats`, `savedChatsDesc`, `openSavedChats`, `newChat`, `noSavedChats`, `noSavedChatsDesc`, `messageCount`
  - `onboarding.library`, `libraryDesc`, `timer`, `timerDesc`, `flowchart`, `flowchartDesc`, `history`, `historyDesc`, `settings`, `settingsDesc`
  - `libraryPage.importUrlHelp`, `unsupportedFile`, `unsupportedFileDesc`, `totalSources`, `activeSources`, `syncedFolders`, `manualSource`, `searchSources`, `searchPlaceholder`
- [ ] Add synchronized `en`, `es`, and `hu` keys for route-error heading/reload, Sources page heading/introduction/references, navigation labels, logo alt text, timer display label, transcript references, loading, close, and the keyboard shortcut word `or`.
- [ ] Pass translated strings into the class-based route error boundary from its functional wrapper. Do not call hooks from the class.
- [ ] Use `useTranslation` inside shared `forwardRef` UI primitives where needed. Confirm that Dialog, Sheet, Toast, and StreamingIndicator update after a runtime language switch.
- [ ] Translate the single hardcoded Use Cases sentence. Preserve publication titles and author names on Sources exactly as published.
- [ ] Add focused Hungarian assertions for the Sources page, error boundary, shared close controls, navigation aria-labels, and loading status.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/i18n.test.ts \
  src/test/pages/SourcesPage.test.tsx \
  src/test/components/StreamingIndicator.test.tsx \
  src/test/app-route-analytics-error-boundary.test.tsx
```

Expected: all tests pass, including the identical-value catalog gate.

- [ ] Commit: `feat(i18n): complete shared Hungarian interface copy`

## Task 3: Localize the complete admin experience

**Objective:** Make the protected admin route and announcement manager follow the selected language without changing admin behavior.

**Files:**

- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/components/admin/AdminAnnouncements.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `src/test/pages/AdminPage.test.tsx`
- Modify: `src/test/components/AdminAnnouncements.test.tsx`

- [ ] Add structured keys under `admin.dashboard`, `admin.users`, `admin.promos`, `admin.subscribers`, `admin.giftTrial`, and `admin.announcements`. Reuse existing `admin.*` and `common.*` keys where wording already matches.
- [ ] Replace every literal currently reported in `AdminPage.tsx:599-1297`, including access denied, dashboard metrics, tabs, graph labels, user actions, promo-code form/status, subscriber status, gift-trial dialog, placeholders, toast titles, and singular/plural request/day labels.
- [ ] Replace every literal currently reported in `AdminAnnouncements.tsx:80-432`, including validation, toasts, form labels, recipient search, dates, empty/loading states, and deactivate/delete confirmations.
- [ ] Format interpolation rather than concatenate English fragments around email, count, date, and duration values. Use i18next plural keys for request, code, redemption, and day counts.
- [ ] Add one Hungarian render test for each admin tab group and both announcement confirmation dialogs. Keep service responses mocked as existing tests do.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/pages/AdminPage.test.tsx \
  src/test/components/AdminAnnouncements.test.tsx \
  src/test/i18n.test.ts
```

Expected: the admin tests find Hungarian labels and no former English label.

- [ ] Commit: `feat(i18n): localize admin surfaces`

## Task 4: Make formatting, relative time, and dictation locale-aware

**Objective:** Apply Hungarian conventions to machine-formatted values and speech recognition.

**Files:**

- Modify: `src/lib/date-format.ts`
- Modify: `src/pages/FlowchartPage.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/hooks/use-speech-to-text.ts`
- Create: `src/test/use-speech-to-text.test.tsx`
- Modify: `src/test/date-format.test.ts`
- Modify: `src/test/pages/FlowchartPage.test.tsx`

- [ ] Add failing date tests using the same local date and explicit language:

```ts
expect(formatEuropeanDate(localDate, 'N/A', 'hu')).toBe('2026. 05. 19.');
expect(formatEuropeanDateTime(localDate, 'N/A', 'hu')).toBe('2026. 05. 19. 13:45');
expect(formatEuropeanTime(localDate, '', 'hu')).toBe('13:45');
```

- [ ] Keep the current function names to avoid broad churn, but make them read an `AppLanguage` argument or the active i18next language. Cache three `Intl.DateTimeFormat` and `Intl.NumberFormat` sets keyed by `AppLanguage`.
- [ ] Add `formatRelativeDate` in the same module using the already-installed date-fns locale objects `enGB`, `es`, and `hu`. Replace Flowchart's direct English `formatDistanceToNow` call.
- [ ] Replace Admin's browser-default `toLocaleString()` with the shared locale-aware number formatter.
- [ ] Make `useSpeechToText` subscribe to the interface language and set `recognition.lang` to `en-GB`, `es-ES`, or `hu-HU`. Recreate or update recognition safely when the language changes and preserve cleanup/abort behavior.
- [ ] Test the Web Speech mock constructor, initial `hu-HU`, change from `en-GB` to `hu-HU`, unavailable-browser behavior, and cleanup.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/date-format.test.ts \
  src/test/use-speech-to-text.test.tsx \
  src/test/pages/FlowchartPage.test.tsx
```

Expected: Hungarian dates and relative time are emitted, and recognition receives `hu-HU`.

- [ ] Commit: `feat(i18n): apply Hungarian locale behavior`

## Task 5: Send the selected output language through every AI path

**Objective:** Make the AI-output selector truthful for structured, streaming, Crossfire, and Sparring requests.

**Files:**

- Modify: `src/lib/ai/client.ts`
- Modify: `src/lib/ai/streaming.ts`
- Modify: `src/test/ai/control-payload-matrix.test.ts`
- Modify: `src/test/ai/streaming.test.ts`
- Modify: `src/test/ai/crossfire-client.test.ts`
- Modify: `supabase/functions/ai/prompt-builder.ts`
- Modify: `supabase/functions/ai/prompt-builder.test.ts`
- Modify: `supabase/functions/ai/control-matrix.test.ts`
- Modify: `supabase/functions/ai/index.ts`
- Modify: `supabase/functions/ai-stream/index.ts`
- Modify: `supabase/functions/ai-stream/prompt.test.ts`
- Modify: `supabase/functions/ai-stream/handler_test.ts`
- Modify: `supabase/functions/_shared/control-enforcement.ts`
- Modify: `supabase/functions/_shared/control-enforcement.test.ts`

- [ ] Add one small client helper that reads the validated `outputLanguage` and merges it into request input. Use it for Generate, Attack, Brainstorm, Factoids, and Ask. For Crossfire, validate the existing strict client input first, then add the language only to the outgoing request body. Preserve Sparring's explicit session language and use the setting only as its existing fallback.
- [ ] Add `language` to streaming Ask's request body. Parse and bound it on the Edge Function before prompt construction.
- [ ] Validate `language` at both Edge trust boundaries as exactly `en`, `es`, or `hu`. Extend `validateControlInput` for normal and streaming requests. Extend Crossfire's strict `allowedKeys` and returned `CrossfireInput` in `supabase/functions/ai/index.ts`; reject `zz` before quota or provider work.
- [ ] Update `buildUserPrompt` so Attack, Brainstorm, Factoids, Ask, Sparring, and both Crossfire operations contain:

```text
Language: Hungarian (hu) - Write ALL output in this language.
```

Generate already has the same explicit contract and should reuse the same helper text. Unknown/missing language continues to fall back to English.

- [ ] Update streaming Ask's system prompt to include the same explicit instruction. Do not infer the output language from the user's message.
- [ ] In `control-payload-matrix.test.ts`, set `outputLanguage: 'hu'`, invoke every non-streaming feature, and assert `body.input.language === 'hu'` for each call.
- [ ] In streaming tests, parse `fetch.mock.calls[0][1].body` and assert the same field.
- [ ] In Edge prompt tests, assert Hungarian instructions for Attack, Brainstorm, Factoids, Ask, Sparring, Crossfire next-turn, and Crossfire debrief. Keep the existing prompt-injection and output-schema tests unchanged.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/ai/control-payload-matrix.test.ts \
  src/test/ai/streaming.test.ts \
  src/test/ai/crossfire-client.test.ts
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run test:edge
```

Expected: all client payloads carry `hu`, and all Edge prompt paths explicitly request Hungarian.

- [ ] Commit: `fix(ai): honor Hungarian output language everywhere`

## Task 6: Localize saved content, notifications, and exports

**Objective:** Remove English boilerplate generated by the app after the main screen has rendered.

**Files:**

- Modify: `src/lib/ai/client.ts`
- Modify: `src/lib/stores/session-store.ts`
- Modify: `src/lib/pdf-export-utils.ts`
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/pages/SharedPage.tsx`
- Modify: `src/pages/FlowchartPage.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/hu.json`
- Modify: `src/test/ai/client.test.ts`
- Modify: `src/test/session-store.test.ts`
- Modify: `src/test/pdf-export-utils.test.ts`
- Modify: `src/test/pages/LibraryPage.test.tsx`

- [ ] Localize `Input was shortened`, its description, `Source save failed`, the per-source failure description, and the `Auto-saved` folder name through i18next.
- [ ] Replace auto-generated `Brainstorm` and `Factoids` saved-item titles with locale keys at creation time. Do not rewrite existing user data.
- [ ] Localize PDF footer boilerplate `Generated by DebateLab`, `Page`, and `of`, and pass the active language into date formatting.
- [ ] Replace remaining literal toast title `Error` in Library, Shared, Flowchart, and Admin call sites with existing or new keys. Translate Flowchart's starter-node descriptions rather than persisting the current English strings for new Hungarian charts.
- [ ] Keep source titles, generated AI content, saved user titles, and pre-existing stored folder/title values unchanged.
- [ ] Add focused tests that create the artifact under `hu`, then assert the stored title/folder, toast text, and PDF footer are Hungarian.
- [ ] Run:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run \
  src/test/ai/client.test.ts \
  src/test/session-store.test.ts \
  src/test/pdf-export-utils.test.ts \
  src/test/pages/LibraryPage.test.tsx
```

Expected: newly generated app boilerplate is Hungarian while user/provider content is untouched.

- [ ] Commit: `feat(i18n): localize generated app artifacts`

## Task 7: Prove Hungarian parity in the browser, document it, and run the full gate

**Objective:** Verify the complete user path at desktop and mobile sizes and record what automated tests do and do not prove.

**Files:**

- Create: `e2e/hungarian-parity.spec.ts`
- Modify: `e2e/helpers/auth.ts` only if a reusable helper is missing
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`

- [ ] Add a focused Playwright spec using the existing `setLocale(page, 'hu')` and session stub. Do not scan all text for English because source titles and user content may legitimately be English.
- [ ] Assert these stable contracts on desktop and mobile Chromium:
  - `<html lang="hu">` before and after reload
  - Hungarian landing navigation and one landing body sentence
  - Hungarian login, terms, privacy, and Sources page chrome
  - Hungarian home navigation and route titles
  - Hungarian Ask saved-chat empty state
  - Hungarian onboarding labels
  - Hungarian Library import/search labels
  - Hungarian Timer accessible name
  - Hungarian dialog/sheet/toast close labels
  - no console or page errors
- [ ] Update architecture docs with the shared language catalog, UI language versus AI-output language, and locale-sensitive runtime behavior.
- [ ] Update testing docs with the catalog identity allowlist, Hungarian browser spec, dictation limitation, and the difference between mocked prompt proof and live provider proof.
- [ ] Run focused browser proof:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH \
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
npx playwright test e2e/hungarian-parity.spec.ts \
  --project=desktop-chromium --project=mobile-chromium
```

Expected: both projects pass with localized visible and accessibility copy.

- [ ] Run the complete credential-free gate:

```bash
PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH npm run verify
```

Expected: docs, lint, typecheck, Vitest coverage, collaboration tests, Edge tests, build, desktop Chromium, and mobile Chromium pass.

- [ ] If protected staging credentials are available and staging execution is authorized, run one Hungarian-output probe for each distinct request path: structured Generate, Attack, Brainstorm, Factoids, non-streaming Ask, streaming Ask, Crossfire, and Sparring. A fluent reviewer confirms that every response field intended as prose is Hungarian. Keep staging and local evidence separate.
- [ ] If real microphone hardware and a supported browser are available, dictate `Árvíztűrő tükörfúrógép` and confirm the recognition event returns Hungarian text. Otherwise report the unit-level `recognition.lang = 'hu-HU'` proof and the missing hardware check.
- [ ] Export one PDF under Hungarian and visually inspect footer text, page numbering, date format, and accented glyphs.
- [ ] On Adam's Mac, build and sync the Capacitor app with `npm run build && npx cap sync ios`, then check the same representative Hungarian flow in the iOS simulator or device. Verify persistence, `hu-HU` dates, accented glyphs, VoiceOver labels, and the localized unsupported-dictation state if Web Speech is unavailable.
- [ ] Generate a side-by-side English/Hungarian TSV outside the repository and have a fluent Hungarian reviewer check all 1,463 keys for meaning, grammar, consistent terminology, interpolation tokens, and natural capitalization. The reviewer must pay special attention to debate terms, legal copy, billing copy, admin actions, destructive confirmations, and accessibility labels.
- [ ] Inspect `git diff --check`, the final diff, and `git status --short`. Confirm no secrets, generated test artifacts, screenshots, coverage output, or unrelated changes are staged.
- [ ] Commit: `test(i18n): prove full Hungarian parity`

## Files likely to change

- Language core: `src/lib/languages.ts`, `src/i18n.ts`, `src/lib/stores/settings-store.ts`
- Locale catalogs: `src/locales/en.json`, `src/locales/es.json`, `src/locales/hu.json`
- Shared/public UI: `src/App.tsx`, `src/pages/SourcesPage.tsx`, `src/pages/TimerPage.tsx`, `src/pages/CrossfirePage.tsx`, `src/pages/FlowchartPage.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/landing/*`, `src/components/ui/{dialog,sheet,toast,streaming-indicator}.tsx`
- Admin UI: `src/pages/AdminPage.tsx`, `src/components/admin/AdminAnnouncements.tsx`
- Locale behavior: `src/lib/date-format.ts`, `src/hooks/use-speech-to-text.ts`
- AI paths: `src/lib/ai/client.ts`, `src/lib/ai/streaming.ts`, `supabase/functions/ai/prompt-builder.ts`, `supabase/functions/ai-stream/index.ts`
- Generated artifacts: `src/lib/stores/session-store.ts`, `src/lib/pdf-export-utils.ts`
- Tests: focused Vitest files above plus `e2e/hungarian-parity.spec.ts`
- Docs: `docs/architecture.md`, `docs/testing.md`

## Risks and stop conditions

- Hungarian linguistic quality cannot be proven by key parity or automated tests. Stop short of a full-parity claim until a fluent reviewer signs off.
- Provider prompts can require Hungarian but cannot guarantee model quality. If staging returns mixed-language fields, fix prompt composition or field-specific instructions before claiming parity.
- Web Speech recognition support and accuracy depend on browser, operating system, and installed speech service. Do not remove the existing unsupported-browser fallback.
- The VPS cannot prove the Capacitor iOS runtime. If no Mac simulator or device run is available, keep the full-product result `partially_verified` and report web/mobile-Chromium proof separately.
- Some citation titles and model/provider names should remain in their source language. Do not broaden "no English" assertions to arbitrary page text.
- Existing saved records may contain old English auto-generated names. This plan localizes new records only and deliberately avoids a data migration.
- Static SEO, Open Graph, and social metadata remain English on the single client-side URL. Full localized SEO would require locale URLs, `hreflang`, and a separate routing/rendering decision; it is outside this parity change.
- If a change appears to require a new dependency, schema migration, production secret, or visual redesign, stop. That exceeds this plan.

## Rollback

No persistent schema or production data changes are planned. Revert the feature commits in reverse order. Existing saved user content is untouched, so no data rollback is required.
