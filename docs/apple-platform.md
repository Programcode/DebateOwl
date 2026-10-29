# DebateOwl on Apple platforms

Current. What the iOS and iPadOS app (`apps/mobile`, bundle id `com.pistack.debateowl`) uses from Apple, what already works, and what DebateOwl's own Apple Developer account has to switch on. The app's code map is [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md); building is in [development.md](development.md#development-build).

## What runs where

- **Expo Go:** none of the native extras below, by design. The config Expo Go loads never changes. Time-up alerts, the review prompt and notification taps work there, because they need only modules Expo Go has.
- **Development build** (`DEBATELAB_BUILD=dev`) signed with the borrowed profile: Live Activities and widgets when the profile carries the App Group (`DEBATELAB_APP_GROUP`), Siri and Shortcuts, Handoff, Google sign-in (once Supabase allows the redirect), StoreKit (once App Store Connect has the products).
- **Development or release build signed by DebateOwl's own account** (`DEBATELAB_BUILD=dev DEBATELAB_APP_GROUP=group.com.pistack.debateowl DEBATELAB_APPLE_ACCOUNT=1`): everything, including Sign in with Apple, push, the Time Sensitive alert and Handoff from Safari to the app. `DEBATELAB_APPLE_ACCOUNT=1` keeps the push and Sign in with Apple entitlements that `withoutAccountEntitlements` in `app.config.ts` otherwise removes, and adds Time Sensitive Notifications and `activitycontinuation:debateowl.com`.

## The features

- **Timer Live Activity and Dynamic Island**, with the lock-screen widget: the speech or prep clock counts on the Lock Screen without the app. From iOS 17 it has Pause/Resume and Next speech buttons that run in the app's process.
- **Generating Live Activity**: Generate, Attack, Brainstorm and Factoids show Ollie, the step (research, write, check), the parts written and the time on the Lock Screen and in the Dynamic Island. When the app is suspended the activity says to open DebateOwl, and the server pushes "Your case is ready" when the answer is stored.
- **Time-up alert**: a local notification at the moment a running speech or prep bank runs out while the phone is locked, with sound unless the timer is muted, marked Time Sensitive.
- **Sign in with Apple and Google**, into the same accounts as the website.
- **In-app purchase** (StoreKit 2): Basic and Pro monthly, restore, Manage subscription, and Ask to Buy.
- **Siri, Shortcuts and Spotlight actions** (App Intents): start the timer, ask the coach, start a debate, write a case, open the Library, spar.
- **Handoff**: the screen open on the iPhone or iPad continues on a Mac in Safari at the matching debateowl.com page.
- **App Store review prompt**: Apple's own, after the third finished result, at most every 120 days.
- **Notification taps** open the timer, or a judged Sparring round.

The Current Debate widget, Home Screen quick actions, Spotlight indexing, the share extension and iPad keyboard shortcuts belong to round 5 (`native-ios/r5-speed-polish`).

## Checklist for DebateOwl's Apple account

Work through it in order. Each item says what it switches on.

### 1. Developer account

- [ ] Join the Apple Developer Program as the organisation or person who will publish DebateOwl. Note the **Team ID**; the website file in step 6 needs it.
- [ ] Sign the **Paid Apps** agreement and fill in tax and banking in App Store Connect › Business. In-app purchase does not work, even in the sandbox, without it.

### 2. Identifiers (Certificates, Identifiers & Profiles)

- [ ] **App Group** `group.com.pistack.debateowl`. Shares data between the app and its widget extension: every Live Activity and widget needs it.
- [ ] **App ID** `com.pistack.debateowl` (explicit, not wildcard) with these capabilities:
  - App Groups, with `group.com.pistack.debateowl`: Live Activities, the widgets.
  - Associated Domains: universal links (`applinks:debateowl.com`, `www`) and Handoff from Safari (`activitycontinuation:debateowl.com`).
  - Push Notifications: "Your round is scored", "Your case is ready".
  - Sign In with Apple, as a primary App ID.
  - Time Sensitive Notifications: the timer's time-up alert breaks through a Focus.
  - In-App Purchase is on for every App ID.
- [ ] **App ID** `com.pistack.debateowl.ExpoWidgetsTarget` with App Groups (`group.com.pistack.debateowl`). This is the widget extension that draws the Live Activities and widgets.
- [ ] **Keys**:
  - An **APNs key** (`.p8`, Apple Push Notifications service). Upload it to EAS with `eas credentials` (iOS › Push Notifications) for `@pi-stack/debateowl`; Expo's push service uses it for every push the server sends.
  - A **Sign in with Apple key** (`.p8`), kept for the follow-up that revokes Apple tokens when an account is deleted (App Review guideline 5.1.1(v)). Nothing uses it yet.

### 3. Provisioning and the build

- [ ] Let EAS create the distribution certificate and the profiles for both bundle ids (`eas credentials`), or make an App Store profile and an ad hoc profile for each by hand.
- [ ] Build with `DEBATELAB_BUILD=dev DEBATELAB_APP_GROUP=group.com.pistack.debateowl DEBATELAB_APPLE_ACCOUNT=1` in the profile's `env` in `apps/mobile/eas.json`, following [Build day](development.md#build-day). Ask before any build: the budget there applies.
- [ ] Check the build's entitlements before installing: `DEBATELAB_BUILD=dev DEBATELAB_APP_GROUP=group.com.pistack.debateowl DEBATELAB_APPLE_ACCOUNT=1 npx expo config --json --type introspect` lists them.

### 4. App Store Connect

- [ ] Create the app: name DebateOwl, bundle id `com.pistack.debateowl`, primary language English, plus Spanish and Hungarian. Note its **Apple ID** (the number under App Information): it becomes `APP_STORE_APP_APPLE_ID`.
- [ ] Subscriptions: one subscription group (DebateOwl), with two auto-renewable subscriptions:
  - `com.pistack.debateowl.basic.monthly`, Basic, 1 month;
  - `com.pistack.debateowl.pro.monthly`, Pro, 1 month, ranked above Basic so moving between them is an upgrade or downgrade.
  Give each a price, a display name and description in en, es and hu, and a review screenshot of the plan screen. An introductory free trial is optional; the account trial DebateOwl already gives new users still applies.
- [ ] App Store Server Notifications, version 2: production and sandbox URL `https://<project-ref>.supabase.co/functions/v1/app-store-notifications`.
- [ ] Offer codes: not offered in the app yet. A code redeemed through Apple carries no DebateOwl account id, which `app-store-purchase` needs to apply it; that is a server decision first.
- [ ] Sandbox testers (Users and Access › Sandbox) to try purchases on a device.
- [ ] App Privacy answers, and the review notes: a demo code for the reviewer, and that accounts are deleted in You › Delete account.

### 5. Supabase (staging first, then production)

These are configuration, migrations and deploys. Each one needs Adam's go-ahead on production.

- [ ] Auth › Providers › Apple: enable, Client IDs `com.pistack.debateowl` (add `host.exp.Exponent` only to try it in Expo Go). The native flow needs no secret.
- [ ] Auth › URL Configuration › Redirect URLs: add `debatelab://auth/callback` for Google sign-in.
- [ ] Function settings: `APP_STORE_BUNDLE_ID=com.pistack.debateowl`, `APP_STORE_ENVIRONMENTS=Production,Sandbox`, `APP_STORE_APP_APPLE_ID=<Apple ID from step 4>`.
- [ ] Migrations: `20261014123154_app_store_entitlements.sql`, the push migrations (`20261014130000`, `20261014200000`, `20261014220000`) and `20261029120000_app_store_debateowl_products.sql`.
- [ ] Deploy `app-store-purchase`, `app-store-notifications`, `account`, and `ai` (the `sparring_scored` and `result_ready` pushes).

### 6. The website

- [ ] Serve `https://debateowl.com/.well-known/apple-app-site-association` (and on `www`) as `application/json`, with the Team ID from step 1:

  ```json
  {
    "applinks": {
      "details": [{ "appIDs": ["<TEAM_ID>.com.pistack.debateowl"], "components": [{ "/": "/share/*" }, { "/": "/app/*" }] }]
    },
    "activitycontinuation": { "apps": ["<TEAM_ID>.com.pistack.debateowl"] }
  }
  ```

  It ships with a Vercel deploy of `main`. Without it universal links and Handoff from Safari stay off; Handoff from the app to Safari works without it.

## Known limits

- A Live Activity button press runs in the app's process. When iOS has ended the app, the press starts it in the background, and the timer may miss that press.
- iOS suspends the app soon after it leaves the screen. The answer is then read back from `ai_run_results` when the app is opened again. If the student closes the app completely before that, the answer is not saved to the debate.
- An App Store subscription with no DebateOwl account id (an offer code redeemed in the App Store app, Family Sharing) is not applied to any account.
- App Review asks that Sign in with Apple tokens are revoked when an account is deleted. That needs the Sign in with Apple key on the server and is not built yet.
