# DebateLab mobile app

The iOS app (`@debatelab/mobile`): Expo SDK 57, React Native 0.86, React 19, Expo Router. The plan is [plans/2026-10-08-native-ios-app.md](../../plans/2026-10-08-native-ios-app.md). Read the root [AGENTS.md](../../AGENTS.md) first; this file adds only what is specific to the app.

## Rules

- Milestone 1 runs in the App Store's Expo Go, with no EAS builds. Every native module must be listed in `node_modules/expo/bundledNativeModules.json`. Check before adding a dependency, and install with `npx expo install <package>` from this folder so versions match the SDK.
- Expo changes between SDKs. Read the docs for SDK 57 (`https://docs.expo.dev/versions/v57.0.0/`), not `latest`.
- React 18 (website) and React 19 (app) coexist in one workspace. Do not add a root `overrides` entry for react.
- Shared logic comes from `@debatelab/core` (`packages/core`). Stores, the AI client and other `src/` wiring stay in the website.
- Strings come from the website's catalogs in `src/locales/{en,es,hu}.json`. App-only strings go under `mobile.*`, in all three languages.
- The Supabase project URLs and anon keys live once, in `src/lib/supabase/projects.ts` at the repo root; `src/lib/supabase-config.ts` imports them. The app uses staging unless a build sets `EXPO_PUBLIC_SUPABASE_ENV=production`.
- Google sign-in needs a development build, because Expo Go cannot receive OAuth redirects. Until then, sign-in is email code or demo code.
- Native code has no DOM. eslint rejects `window`, `document`, `localStorage`, `sessionStorage` and `location` outside `*.web.ts(x)` files. A `.web.tsx` file exists only for the web preview.
- `ios/` and `android/` are generated and gitignored. Configure native behaviour in `app.json`.

## Layout

- `src/app/`: routes. `sign-in.tsx`; `(tabs)/` with one route group per tab: Debate, Prepare, Practice, Library, You; the form sheets `debates.tsx` (switcher), `new-debate.tsx`, `delete-account.tsx`, `add-link.tsx`, `new-note.tsx` and `source/[id].tsx`; and `ask.tsx`, full screen above the tabs. All are declared in the root `_layout.tsx`.
- `src/components/`: shared UI. `app-tabs.tsx` uses native tabs; `app-tabs.web.tsx` draws the mock's tab bar for the web preview.
- `src/lib/`: auth (`auth.tsx`), the Supabase client, session storage (AES key in SecureStore, ciphertext in AsyncStorage) and i18n. `debates.ts`, `settings.tsx`, `subscription.ts` and `account.ts` read and write the website's tables the way its stores do (`src/lib/stores/debate-store.ts`, `settings-store.ts`, `src/hooks/use-subscription.ts`, `src/lib/account.ts`), so the app and the website share one Current Debate and one set of settings. Change them together with the website code they mirror.
- `sources.ts` mirrors the session store's `addSource` and `removeSource` and `src/lib/source-import.ts`. The Library always shows the Current Debate, also in one-off mode, as on the website. Adding a file (the website parses files in the browser) and Scan pages are not in the app yet.
- Ask mirrors `src/lib/ai/streaming.ts` and `askChat` in `src/lib/ai/client.ts`: `ask.ts` sends the requests (plain questions stream from `ai-stream` through `expo/fetch`; with Citations, Web search, Pros/Cons or Argument map on, the whole answer comes from `ai`, because `ai-stream` refuses those options), `ask-config.ts` reads the Ask model from `user_settings.feature_configs`, `ask-context.ts` builds the Current Debate context with the website's default selection and pins, and `chats.ts` saves finished exchanges to `chats` and `messages`. The SSE parser is shared in `packages/core/src/ai/sse.ts`. `markdown.ts` reads answers, because react-markdown needs the DOM.
- One-off mode is session-only and never written, as on the website. Students prepare both sides of a motion, so a debate has no side: the Debate tab's In favor / Against toggle only chooses which side's work it shows, using the website's rule (`'both'` counts for either side, neutral and side-less work for neither). It starts on In favor and is never stored.
- `src/theme/`: colours from the mocks and the website's dark palette, Inter fonts.
- `scripts/screenshots.ts`: web-export screenshots. `scripts/render-tab-icons.ts` redraws the tab bar PNGs.

## Checks

Root `npm run lint` and `npm run typecheck` cover the app. From the repo root:

```bash
npm run -w @debatelab/mobile typecheck
npm run -w @debatelab/mobile export:web
PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
```

Screenshots go to `.verify/mobile-shots/`. For signed-in screens, see the header of `scripts/screenshots.ts`. To load the app on a phone, see [docs/development.md](../../docs/development.md#mobile-app).

knip ignores `expo-updates`: its Expo plugin expects the package whenever `app.json` does not disable updates, and EAS Update is not set up yet.
