# Native iOS app

**Status:** Plan, not started. Written 2026-10-08 against `main` at `40738ea`. Every decision below is Adam's, from 2026-10-08.

Goal: replace the Capacitor shell with a real native DebateLab app for iPhone and iPad. Today the iOS app is the web build inside a WebView, with about 150 lines of native glue, and it feels like a worse copy of the website. The new app should feel native: native navigation, sheets, gestures, haptics, instant response. It should still look and read like DebateLab.

## The mocks are the reference

Adam approved these mocks ("exactly what I wanted"). Build to them. Where a screen has no mock, follow the same rules.

| Screen | Mock |
| --- | --- |
| Debate tab (home) | [01-debate-home.png](2026-10-08-native-ios-app/01-debate-home.png) |
| Switching debates | [02-switch-debate.png](2026-10-08-native-ios-app/02-switch-debate.png) |
| A generated case | [03-generated-case.png](2026-10-08-native-ios-app/03-generated-case.png) |
| Library and adding a source | [04-library.png](2026-10-08-native-ios-app/04-library.png) |
| Sparring, live round | [05-sparring-live.png](2026-10-08-native-ios-app/05-sparring-live.png) |
| Sparring scorecard | [06-scorecard.png](2026-10-08-native-ios-app/06-scorecard.png) |
| Ask | [07-ask.png](2026-10-08-native-ios-app/07-ask.png) |
| Flowchart | [08-flowchart.png](2026-10-08-native-ios-app/08-flowchart.png) |

The HTML sources are next to the images ([mocks-debate-prepare-library.html](2026-10-08-native-ios-app/mocks-debate-prepare-library.html), [mocks-practice.html](2026-10-08-native-ios-app/mocks-practice.html)). Open them in a browser for exact colours and spacing.

What the mocks fix:

- DebateLab's identity carries over: its colours (`src/index.css`), Inter, the pale-blue icon tiles, and the blue-to-teal gradient from the website's Start Trial button, which marks the one main action on a screen.
- iOS supplies the structure: large titles, a tab bar, sheets instead of dropdowns, native menus, and swipe back.
- Tabs: **Debate, Prepare, Practice, Library, You**. The Current Debate is home, and its motion is the screen title.
- Picking a debate (and one-off mode) opens a sheet from the "Current debate" control, as on the web.
- Results read like documents, with collapsible arguments, citation chips, and the next step (such as Attack this case) pinned above the home bar.
- The live Sparring round is full screen with no tab bar: a ring timer, live captions, and a large mic button. It **follows the system theme**. The dark mock shows its dark variant, and it needs a light one too.
- Phone-sized versions replace things that don't fit a phone: scorecard bars instead of the radar chart, Flowchart as speeches in sideways columns plus a claim sheet, and Ask's toggles as a row of chips above the composer.
- One exception: the Library mock's plus menu includes **Scan pages**. Leave that item out, because Scan pages is not in v1.
- Copy comes from the existing en, es and hu catalogs. Hungarian and Spanish have to fit too.

## Decisions

- **Stack: Expo / React Native, in this repo.** Turn DebateLab into npm workspaces with the web app, `apps/mobile`, and shared packages for whatever both apps can use (types, Zod schemas, i18n catalogs, the AI client and streaming, store logic). The web app must keep working the same, and agents decide how far to split.
- **Scope: full parity** with the web's user-facing features: Current Debate, Generate, Brainstorm, Factoids, Flowchart, Attack, Ask, Crossfire, Sparring, Timer, Library, History, Settings, sharing and announcements. **Admin stays web-only.** The hidden Workspace is out.
- **Devices: iPhone and iPad.** iPad gets real split-view layouts where they help, Library and Flowchart especially. Android is out of scope for now.
- **Sign-in:** the web's methods (Google, email code, demo code) plus **Sign in with Apple**, which App Store rule 4.8 requires. One person is one account everywhere, so the website must be able to sign in an Apple account too (see Backend changes).
- **Payments: Apple in-app purchase everywhere.** The app sells Basic and Pro through StoreKit. A subscription bought on either the web or iOS unlocks both, so entitlements must be merged on the server. Stripe stays the web path, and there are no links to Stripe checkout in the app.
- **Speech:** Apple's on-device speech recognition for Sparring, Crossfire and Ask dictation, in English, Spanish and Hungarian. Check early that Hungarian really works on-device. If it doesn't, ask Adam before falling back to server transcription, which costs money per minute. The ElevenLabs opponent voice stays as it is.
- **Offline: read offline.** Debates, sources, saved results and past rounds stay readable without a connection. AI and saving wait for the network.
- **Phone-only extras in v1:** push notifications (a round is scored, the trial is ending, announcements), a **Share to DebateLab** extension that sends a page or file into the current debate's Library, and a **lock-screen speech timer** (a Live Activity and the Dynamic Island) for Sparring and Timer. Scan pages is not in v1.
- **Capacitor goes first.** It never shipped, so the first PR deletes `ios/`, `capacitor.config.ts`, the `@capacitor/*` packages, `src/native-runtime.ts`, `src/native-app-url-listener.ts`, the native branches in `src/lib/native.ts`, the `capacitor://localhost` origins in CORS and checkout, the `ios:*` scripts, and the docs that mention it. The website must behave exactly as before.
- **No Mac.** Adam's Mac has no room for Xcode, so there's no simulator. Agents preview screens on the VPS (Expo's web rendering, with Playwright screenshots), and Adam tests on his iPhone. See How to see the app.
- **First phone build:** sign-in, the Debate tab and debate switching, Library, You (settings and account), and Ask. Ask proves streaming and the shared AI client on a real phone early. The rest lands after that, in an order the agents choose.

## How to see the app

There is no simulator. The loop:

- **On the VPS:** agents run the screens through Expo's web rendering and compare Playwright screenshots against the mocks, at iPhone and iPad sizes, in light and dark, in English and Hungarian. Typecheck, lint and tests run here too. Web rendering is close to native but not identical, so it doesn't prove gestures, haptics, keyboard behaviour, speech or the native sheets.
- **On Adam's iPhone:** a development build of the app, installed once. Changes that are only JavaScript reach it without a new build: live from the VPS dev server over the tailnet while agents work, or as an **EAS Update**. At milestones, agents ask Adam to try named screens and flows on the phone, with what to look for.
- **Signing:** Adam's Signulous certificate. He exports the `.p12`, its password and the `.mobileprovision`, and agents get them through a ProtoPi secret request. They are never pasted into chat, the repo, logs or EAS config in git. EAS uses them as local credentials for internal-distribution builds that install on his phone.
- **What that certificate can't do:** a borrowed wildcard profile carries no push, Sign in with Apple, in-app purchase or App Group entitlements, so the share extension is out too. The Live Activity should work, but check that. Build those features on staging and the VPS, and finish them on a phone once Adam's Apple Developer account exists.

## Build budget

Adam does not want agents burning builds. The free EAS plan allows about 15 iOS builds a month, and burning them in a day is a failure.

- A new phone build only when native code, permissions, entitlements, extensions or the Expo SDK change. Everything else goes out live or through EAS Update.
- Cloud builds: **at most one a day and three a week** without asking Adam. Before triggering one, check how many have been used this month (`eas build:list`), and record each build and its reason in the PR.
- Batch native changes, so one build carries several.
- Never retry a failed build blindly. Read the build log, fix the cause, and only then build again.
- Each PR, and the work as a whole, stays to what this plan asks for. No extra features or speculative refactors.

## Before agents can start

Adam has to do these himself:

1. Create an Expo account and give agents an EAS token through a secret request.
2. Export the Signulous `.p12`, its password and the `.mobileprovision` for a secret request, and note the iPhone's UDID if the profile isn't a wildcard.

Needed later, and the rest of the work doesn't wait for it:

3. Enrol in the Apple Developer Program ($99 a year). Push, Sign in with Apple, in-app purchase, the share extension, TestFlight and the App Store all need it.
4. Set up App Store Connect: the app record, subscription products and prices, and tax and banking. Agents can prepare it, but Adam signs anything that costs money or needs his Apple ID.

## How the work runs

One long-running thread does most of the work, not a thread per phase.

- **Lead:** Claude Fable 5.1, high effort, as orchestrator. It owns the architecture, the order, and the final check of every piece against the plan and the mocks.
- **Under it:** Claude Opus 5.5, high effort, for most implementation and all review. The lead may hand tasks that don't need Opus to Sonnet 5.5 or Haiku 5.5 (Adam allows Haiku for this project, overriding the global no-Haiku rule). **UI work is Opus or Fable only.**
- **Own worktree,** branched from `main`. Never the main checkout, where other work runs.
- **`TASKS.md`** in the worktree tracks the phases and what is done, so the run survives context compaction.
- **Stacked PRs, one per phase,** each small enough to review. A suggested order (agents may change it): Capacitor removal (ships to production, website unchanged); the npm workspaces and shared package, **without moving `src/`**, so fixes from the 2026-10-08 ultracode review don't collide; the first phone build; the Prepare tools; the Practice tools; iPad; the extras; then in-app purchase, entitlements and the backend changes.
- **When to stop for Adam:** a milestone ready to try on the phone, anything that needs his Apple ID or money, production backend deploys, a cloud build over the budget, or a choice that changes what users see. Otherwise keep going.

## Backend changes

Agents choose the design, but these need to exist:

- Apple as a Supabase auth provider, on staging first. The website gets Sign in with Apple as well, so an account created on iOS (often with a private-relay email) can sign in on the web. Someone who already has a Google or email account must not end up with a second, separate account, so link identities or guide them to their existing sign-in method.
- Server-side entitlements that combine Stripe and App Store purchases (App Store Server Notifications, receipt validation), so quotas and plan checks read one source of truth. Deleting an account can't cancel an App Store subscription from the server, so the deletion flow has to send the user to Apple's subscription settings.
- Storing device push tokens and sending notifications, without leaking anything across users or debates.
- Mobile requests carry no browser `Origin`. Check that the Edge Functions' auth and CORS handling still holds for them, and loosen nothing to make the app work.

Backend changes follow the normal path: migration and pgTAP gate, staging, then production with Adam's authorization.

## Verification

- Use the app, not just its tests: drive every flow in the VPS preview against **staging**, with screenshots in each PR, and have Adam try it on his phone at milestones.
- Compare each screen with its mock, in light and dark, at iPhone and iPad sizes, in English and Hungarian.
- Test entitlements, IAP and Stripe merging, auth providers and push token handling, following AGENTS.md's testing rules.
- The web app's gates (`npm run verify`, docs check, typecheck, build) stay green on every PR, including the workspace split.

## Release

Adam's phone (Signulous) during development, TestFlight once the Apple Developer account exists, then App Store review. Review needs privacy labels, an age rating suited to students, account deletion inside the app (rule 5.1.1(v), so the website's version isn't enough), screenshots and review notes with a demo account. Agents prepare the submission, and Adam submits it.

## Out of scope

Admin, the collaborative Workspace, Android, Scan pages, and any redesign of the website.

## Open for the agents

The library choices (navigation, lists, IAP wrapper, Live Activity bridge), the shared-package boundaries, offline storage, the order of tools after the first phone build, and how to split the PRs. Ask Adam with options when a choice changes what users see or costs money.
