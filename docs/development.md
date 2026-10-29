# Development guide

**Status:** Current. Commands are owned by [`package.json`](../package.json).

## Work in the assigned checkout

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
```

The first command is the active repository root. Stay there. Superset sessions are linked worktrees and may live under `~/.superset/worktrees/`, not `/home/codex/Projects/DebateLab`.

Never overwrite unrelated changes. Do not switch to the primary checkout because an old note names it.

## Prerequisites

- Node.js 22.x
- npm and `package-lock.json`
- Deno 2.x for Edge Function tests
- Docker and Supabase CLI 2.121.0, pinned in `package.json` (`npm ci` installs it) for database work
- Playwright browser binaries for browser gates

Install the locked JavaScript tree with the Node version from `.nvmrc`:

```bash
nvm use
npm ci
```

The repository is an npm workspace: `npm ci` at the root installs the web app and every package under `packages/`, and links `@debatelab/core` into `node_modules`. Run every script from the root.

## Start the client

Outside Superset, start Vite directly:

```bash
npm run dev
```

[`vite.config.ts`](../vite.config.ts) defaults to port `8080` and maps `@` to `src/`. Superset's Run action calls `./.superset/dev.sh`, which allocates an available port from `8080-8179` for the current worktree and releases it through `./.superset/teardown.sh`. Do not assume a Superset workspace uses `8080`.

For another explicit local port:

```bash
npm run dev -- --host 127.0.0.1 --port 8081
```

Automated browser tests always start a fresh server. `npm run verify` puts it on this worktree's port from `18100-18179` (`bash .superset/e2e-port.sh`); a bare Playwright run falls back to `127.0.0.1:18080`.

## Preview on the tailnet

A plain `npm run dev` talks to the production Supabase project unless the browser toggle says staging. For anything Adam opens from another device, run the staging preview instead. This local server is not a Vercel deployment. Hosted Vercel previews are opt-in; [operations.md](operations.md#opt-in-previews) has the command.

```bash
npm run dev:preview -- --port 9201 --strictPort
```

`dev:preview` binds to `127.0.0.1` and sets `VITE_STAGING_PREVIEW=true`. In that mode Vite also accepts `*.ts.net` hostnames, so `tailscale serve` can forward to it however it was started. The app is then pinned to staging and calls Supabase at `/__staging-supabase` on its own origin, which Vite proxies to the staging project (see `stagingPreviewProxy` in [`vite.config.ts`](../vite.config.ts)). Requests stay same-origin, so Edge Function CORS lists need no preview entries. The staging strip shows, without the switch to production.

Two ports are involved. The dev server listens locally on a port in `9200-9299`. The `tailnet-preview` skill publishes it on a tailnet HTTPS port in `9100-9149`, and that HTTPS origin is what the browser sees. Staging Auth allows redirects to `https://codex-remote.tailab0ab3.ts.net:91*/**`, so Google sign-in returns to the preview only when the published port starts with `91`. If you run `tailscale serve` by hand, publish on `9100-9199`. Demo codes and email codes must be staging ones: staging has its own users.

## Environment behavior

The checked-in [`.env.example`](../.env.example) contains optional client observability variables:

- `VITE_SENTRY_DSN`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

Production builds also read the Sentry build variables `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`. Local builds leave them unset and skip source map upload. See [operations.md](operations.md#secrets).

The frontend Supabase environment is resolved by [`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts), not by those variables. Public browser configuration is distinct from server secrets.

Never put service-role keys, AI provider keys, Stripe secrets, webhook secrets, demo-code peppers, or integrity secrets in Vite variables. Any `VITE_*` value can reach the browser bundle.

## Client workflow

The main entry points are:

- [`src/main.tsx`](../src/main.tsx) for startup and platform integration.
- [`src/App.tsx`](../src/App.tsx) for routes and top-level providers.
- `src/pages/` for route-level composition.
- `src/components/features/` for feature UI.
- `src/lib/stores/` for state and Supabase hydration.
- [`src/lib/ai/client.ts`](../src/lib/ai/client.ts) for AI requests.
- `packages/core/src/ai/schemas/` for response validation.

Platform-neutral code shared with the iOS app lives in [`packages/core/`](../packages/core/README.md). It mirrors `src/lib/` paths, and each old path re-exports it, so web code keeps importing `@/lib/...`. To add a module, put it under `packages/core/src/`, import siblings by relative path, leave a re-export at the old `src/lib/` path if web code used it, and follow the package's no-DOM rule. The stores, the AI client, and the i18n catalogs stay in `src/` for now.

Follow existing functional React, Zustand, Zod, and shadcn/Radix patterns. Reuse current helpers before adding another abstraction.

Run the closest unit or component test while changing behavior. Run lint, type checking, and build before handing work off.

## Mobile app

The iOS app lives in [`apps/mobile/`](../apps/mobile/AGENTS.md). The root `npm ci` installs it with every other workspace, and the root `lint` and `typecheck` cover it. Install its dependencies with `npx expo install <package>` from `apps/mobile`. The app must keep running in the App Store's Expo Go; a native module Expo Go lacks belongs only to the [development build](#development-build).

### Screenshots on the VPS

The web export renders the app's screens in Chromium. It has no native tab bar, large titles or gestures, and it draws the form sheets as plain full-screen pages, so it shows layout, copy and colour, not iOS behaviour.

```bash
npm run -w @debatelab/mobile export:web
PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
```

Screenshots go to `.verify/mobile-shots/`: sign-in at iPhone and iPad sizes, light and dark, English and Hungarian. With `STAGING_DEMO_CODE` set, the script also signs in to staging, captures the five tabs (the Debate tab in both its In favor and Against views), the debate switcher, the new-debate form, the Debate tab's empty state, the Library's plus menu, link and note sheets and a source, and Ask empty, mid-answer and answered with citations, and checks that a cold start without a network keeps the user signed in, also after supabase-js's first auth event settles (about 30 seconds offline). Signed in, it answers the app's `user_settings` reads with the run's language and the System theme, because the account's saved choices would otherwise override them; nothing is written. Ask runs on a fake stream inside the page and a fixed answer with citations, so screenshots never call a model or save a chat. `ONLY=iphone-light-en` limits a run to one combination. Use the seeded Pro code from `~/.config/debatelab/staging-access.env` (see [staging.md](staging.md)), load it inside the command without printing it, and serve on `PORT=18080`: the deployed Edge Functions only accept browser calls from allowed origins such as `http://127.0.0.1:18080`.

### Expo Go on Adam's iPhone

The phone loads the app from a Metro dev server on the VPS over the tailnet. Start it through the `tailnet-preview` skill's `run` mode from the worktree, so it is tracked and cleaned up, with a free local port in `9200-9299`:

```bash
PREVIEW=~/.claude/skills/tailnet-preview/scripts/preview
HOST=$(tailscale status --self --json | jq -r '.Self.TailscaleIPs[0]')
cd apps/mobile
$PREVIEW run 9230 "debatelab mobile expo-go" -- env REACT_NATIVE_PACKAGER_HOSTNAME=$HOST CI=1 npx expo start --go --port 9230
```

`REACT_NATIVE_PACKAGER_HOSTNAME` makes Metro put the VPS's tailnet IP in the manifest, so Expo Go fetches the bundle from `http://<ip>:9230`. iOS allows plain HTTP to IP addresses on local networks, and the firewall accepts all traffic on `tailscale0`, so the phone reaches that port directly. In Expo Go, enter `exp://<ip>:9230` as the URL, or open that link in Safari. `CI=1` stops Expo waiting for keyboard input in the background. `--go` is needed because `expo-dev-client` is installed: without it Expo starts in development-client mode. To check the server without a phone:

```bash
curl -s -H 'expo-platform: ios' http://127.0.0.1:9230/ | jq -r .launchAsset.url
```

The URL must start with `http://<ip>:9230/`.

Do not use the MagicDNS name (`codex-remote.<tailnet>.ts.net`) as the hostname. The VPS cannot resolve its own MagicDNS name, and Metro's CLI looks the hostname up while it runs: it crashes with `getaddrinfo ENOTFOUND` a few seconds after the phone connects. If you need HTTPS, use the URL that `run` publishes (`https://<name>:91xx`) by also setting `EXPO_PACKAGER_PROXY_URL=https://<name>:91xx`, so the manifest points at the HTTPS proxy.

To sign the CLI in to an Expo account, run `npx expo login` from `apps/mobile`, where the Expo CLI is installed. Its `--browser` and `--sso` options hand the login back to a callback on `localhost` on the VPS, so a login opened in a laptop's browser cannot finish. Use the username and password prompt (`-u <name>`, then the password on stdin with `-p -`).

Stop it with `$PREVIEW down "debatelab mobile expo-go"` when you are done.

### Development build

A development build is the app's own binary with `expo-dev-client`, so it loads JavaScript from Metro like Expo Go but carries native modules Expo Go lacks: speech recognition for voice rounds and dictation, iPad keyboard shortcuts (the app's own `apps/mobile/modules/key-commands`), Home Screen quick actions and Spotlight, the timer's and the generating Live Activities, the widgets and the share extension (with an App Group), Siri and Shortcuts, Handoff, StoreKit, and Google sign-in (Expo Go cannot receive OAuth redirects). [apple-platform.md](apple-platform.md) lists what each needs from the Apple account. Its Info.plist also gets the 120 Hz key, which Expo Go ignores. JavaScript-only changes never need a new build.

[`apps/mobile/app.config.ts`](../apps/mobile/app.config.ts) builds one config with these switches:

- No `DEBATELAB_BUILD`: the Expo Go and web export config, unchanged.
- `DEBATELAB_BUILD=dev`: adds `expo-dev-client`, `expo-speech-recognition` with the microphone and speech prompts (English in Info.plist, Spanish and Hungarian as `InfoPlist.strings` from `mobile.permissions` in the catalogs) and `CFBundleAllowMixedLocalizations`. The `development` profile in [`apps/mobile/eas.json`](../apps/mobile/eas.json) sets it.
- `DEBATELAB_BUILD=release`: the same native app without `expo-dev-client`, so it runs the JavaScript built into it (the `release-simulator` and `sideload` profiles). Without `DEBATELAB_APPLE_ACCOUNT` it also drops Associated Domains, so its only entitlement is the App Group, which a free Apple ID can sign (see [Sideloaded IPA](#sideloaded-ipa)).
- `DEBATELAB_APP_GROUP=group.<id>`, only with `dev` or `release`: adds the `expo-widgets` extension (`ExpoWidgetsTarget`, bundle `com.pistack.debateowl.ExpoWidgetsTarget`) with the timer's lock-screen widget (`DebateTimerWidget`), the Current Debate widget and Live Activity, `NSSupportsLiveActivities`; the share extension from `expo-share-intent` (`DebateOwlShare`, bundle `com.pistack.debateowl.share-extension`, shown as "DebateOwl Share" in the share sheet); and the App Group `group.com.pistack.debateowl` (the only value the config accepts) on all three targets. Register that group for all three bundle ids in the Apple Developer account. For a device build, set it only when the provisioning profile carries that group; a borrowed wildcard profile does not. A simulator build is not signed, so the `development-simulator` profile always sets it. EAS does not see your shell, so it goes in the profile's `env` in `eas.json`, committed with the build.

- `DEBATELAB_APPLE_ACCOUNT=1`, only with `dev` or `release`: the build is signed by DebateOwl's own Apple account. It keeps the push and Sign in with Apple entitlements that every other native build drops (the borrowed profile has neither) and adds Time Sensitive Notifications and Handoff from Safari. Without it, `extra.remotePush` is false and the You tab's Notifications switch shows as unavailable. See [apple-platform.md](apple-platform.md#checklist-for-debateowls-apple-account).

`nativeCapabilities()` in `apps/mobile/src/lib/native-capabilities.ts` tells the app at runtime what the binary has. Feature code checks it and never imports a dev-build module at the top level, so Expo Go keeps working.

To see what a mode produces without a Mac, from `apps/mobile`:

```bash
DEBATELAB_BUILD=dev CI=1 npx expo config --json --type introspect   # Info.plist and entitlements, in memory
```

`npx expo prebuild --platform ios --no-install --clean` writes the full `ios/` project. It is heavy. Run it under the RAM lock, in a copy of `apps/mobile`, and delete the output. `ios/` is never committed.

**Budget.** Every iOS build is a cloud build (EAS cannot build iOS on Linux). The free plan has about 15 a month. Build only when native code, permissions, entitlements, extensions or the Expo SDK change; at most one a day and three a week without asking Adam; batch native changes; never retry a failed build before reading its log and fixing the cause. Record each build's ID and reason in its PR.

**Credentials.** Adam's Signulous certificate (`.p12` and its password) and provisioning profile (`.mobileprovision`), and an EAS token, arrive through ProtoPi secret requests. Store them in `~/.config/debatelab/ios-signing/` (folder mode 700, files 600) as `cert.p12`, `p12-password`, `profile.mobileprovision` and `eas-token`, never in the repo, a log or chat. EAS signs with them as local credentials: `credentials.json` in `apps/mobile` points at those files. Git ignores it, and you delete it after the build.

#### Build day

Run these in order from the primary checkout (`/home/codex/Projects/DebateLab`) on the merged branch with a clean tree. EAS uploads the git working tree, and the build must match a commit. Stop at the first check that fails and tell Adam.

**1. Decode the profile and check it before anything else.**

```bash
S=~/.config/debatelab/ios-signing
openssl smime -inform der -verify -noverify -in $S/profile.mobileprovision -out $S/profile.plist 2>/dev/null
python3 - $S/profile.plist <<'EOF'
import hashlib, plistlib, sys
p = plistlib.load(open(sys.argv[1], 'rb'))
e = p['Entitlements']
print('application-identifier:', e.get('application-identifier'))  # TEAM.* is a wildcard
print('expires:', p['ExpirationDate'])
print('all devices (enterprise):', p.get('ProvisionsAllDevices', False))
print('listed devices:', len(p.get('ProvisionedDevices', [])))
print('get-task-allow:', e.get('get-task-allow'))  # true means a development profile
print('app groups:', e.get('com.apple.security.application-groups'))
print('push:', e.get('aps-environment'))
print('entitlement keys:', sorted(e))
for cert in p.get('DeveloperCertificates', []):
    print('profile cert SHA-1:', hashlib.sha1(cert).hexdigest().upper())
EOF
openssl pkcs12 -legacy -in $S/cert.p12 -passin file:$S/p12-password -nokeys -clcerts \
  | openssl x509 -noout -fingerprint -sha1 -enddate | sed '/Fingerprint/s/://g'
```

Go on only if all of these hold:

- the profile has not expired, and neither has the certificate (`notAfter`);
- `application-identifier` is `<team>.*` or `<team>.com.pistack.debateowl`;
- the profile is enterprise (`all devices` true) or ad hoc with Adam's iPhone UDID among its devices: ask Adam for the UDID. A development profile (`get-task-allow` true) is not what EAS internal distribution expects; ask Adam first;
- the `.p12`'s SHA-1 equals one of the profile's certificate SHA-1s.

Set `DEBATELAB_APP_GROUP` in the profile's `env` in `eas.json` only if `app groups` lists a group, and then pass `widgets` to step 4. Don't export it in this shell: outside a build the config rejects it without `DEBATELAB_BUILD=dev`, which breaks `eas init`. Without an App Group this build has no Live Activity, widgets or share extension.

**2. The EAS project is linked.** `app.config.ts` has `owner: 'pi-stack'` and the project ID of `@pi-stack/debateowl`, set with `eas init --account pi-stack --force --non-interactive` (which cannot edit a dynamic config, so it printed the ID). Nothing to do here unless the project changes.

**3. Count the builds already used.**

```bash
npx eas-cli@24.13.0 build:list --platform ios --json --non-interactive --limit 50 | python3 -c '
import datetime, json, sys
now = datetime.datetime.now(datetime.timezone.utc)
made = [datetime.datetime.fromisoformat(b["createdAt"].replace("Z", "+00:00")) for b in json.load(sys.stdin)]
print("this month:", sum((t.year, t.month) == (now.year, now.month) for t in made),
      "| last 7 days:", sum(now - t < datetime.timedelta(days=7) for t in made),
      "| last 24 h:", sum(now - t < datetime.timedelta(days=1) for t in made))'
```

Stop if the last 24 hours already has one build or the last 7 days three.

**4. Write the credentials file without printing the password.**

```bash
python3 - $S <<'EOF'   # add `widgets` after $S when eas.json sets DEBATELAB_APP_GROUP
import json, os, sys
s = sys.argv[1]
cert = {'path': f'{s}/cert.p12', 'password': open(f'{s}/p12-password').read().strip()}
target = {'provisioningProfilePath': f'{s}/profile.mobileprovision', 'distributionCertificate': cert}
# With DEBATELAB_APP_GROUP the widget and share extensions are two more targets and need their
# own entries, signed by a profile valid for all three bundle ids (a wildcard profile is). The keys
# are the Xcode target names prebuild writes; the app's follows `name` in app.config.ts.
ios = {'DebateOwl': target, 'ExpoWidgetsTarget': target, 'DebateOwlShare': target} if sys.argv[2:] == ['widgets'] else target
fd = os.open('credentials.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, json.dumps({'ios': ios}).encode())
os.close(fd)
EOF
git status --short   # credentials.json must not appear
```

**5. Start the build and do not wait for it.**

```bash
npx eas-cli@24.13.0 build --platform ios --profile development --non-interactive --no-wait
```

Put the build ID, its URL and the reason for the build in the PR. Check it later with `npx eas-cli@24.13.0 build:view <id> --json`. If it fails, read the log before anything else.

**6. Clean up.**

```bash
rm -f credentials.json $S/profile.plist
unset EXPO_TOKEN
```

#### Simulator build

`development-simulator` in `eas.json` builds the development client for the iOS Simulator, with the widget extension and App Group. It is not signed, so it needs no credentials, only a logged-in `eas` (`eas whoami`). It costs build minutes like any iOS build:

```bash
cd apps/mobile
eas build --platform ios --profile development-simulator --non-interactive --no-wait
```

The artifact is a `.tar.gz` of the `.app`; drag the unpacked app onto a Simulator, then start Metro with `--dev-client`.

#### Sideloaded IPA

The `sideload` profile builds the release app for iPhone and iPad against **production** (`EXPO_PUBLIC_SUPABASE_ENV=production`), signed by no Apple team, for someone to re-sign with a free Apple ID in Sideloadly or AltStore. `release-simulator` builds the same app for the Simulator against staging. A normal EAS device build refuses to run without credentials, so `sideload` is a custom build, [`apps/mobile/.eas/build/sideload-ios.yml`](../apps/mobile/.eas/build/sideload-ios.yml): prebuild, the expo-widgets patch (custom builds skip npm's `eas-build-*` hooks), `pod install`, `xcodebuild archive` with signing off, then each bundle is signed ad hoc with the entitlements prebuild wrote and packed as `DebateOwl-sideload.ipa`. It needs no credentials, only a logged-in `eas`, and counts as one iOS build:

```bash
cd apps/mobile
eas build --platform ios --profile sideload --non-interactive --no-wait
```

EAS keeps the artifact for a limited time (the build's `expirationDate`), so attach the IPA to a GitHub release when it has to stay downloadable. A free Apple ID signs only some of the app. These stay off, without errors:

- push (the switch says this version cannot receive notifications), Sign in with Apple (the button is hidden), the Time Sensitive alert (it arrives as a normal notification), universal links and Handoff from Safari;
- in-app purchase (`plans.tsx` shows the App Store as unavailable);
- Live Activities, the widgets and the share extension whenever the re-signer does not provision the App Group `group.com.pistack.debateowl` under that exact name: `nativeCapabilities()` finds no container and the app runs without them. AltStore renames groups to `<group>.<TEAMID>`, so they are off there too.

Everything else works as in any build: email code, demo code and Google sign-in (once production allows the `debatelab://auth/callback` redirect), every tool, the timer with its local time-up alert, voice and dictation, quick actions, Spotlight, Siri and Shortcuts, iPad shortcuts and offline reading. A free signature lasts seven days.

#### Installing it

The finished build's page on expo.dev has an Install button and a QR code. Adam opens it on the iPhone in Safari and installs. For an enterprise certificate, iOS then asks to trust the developer under Settings › General › VPN & Device Management. If iOS asks for Developer Mode, it is under Settings › Privacy & Security.

The installed app opens the development client. Start Metro as for Expo Go, but with `--dev-client` instead of `--go`, and enter `http://<ip>:9230` in the client.

## Collaboration service

The local PostgreSQL-backed Hocuspocus service lives under `services/collaboration/`. It backs the collaborative Workspace, which is hidden and on hold; its routes register only when `VITE_COLLABORATION_URL` is set. Run its focused tests with:

```bash
npm run test:collaboration
```

Start it only with explicit local Supabase values for `COLLABORATION_DATABASE_URL`, `COLLABORATION_PORT`, `COLLABORATION_ALLOWED_ORIGINS`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. The service binds loopback, takes one PostgreSQL session advisory lock per loaded document epoch, and closes sessions on access or restore notifications. It is not a production deployment.

## Edge Function workflow

Edge Functions live under [`supabase/functions/`](../supabase/functions/). Shared server code belongs in `_shared` only when at least two functions use the same boundary or policy.

Run native Deno tests with:

```bash
npm run test:edge
```

These tests intentionally use Deno permissions declared in the npm script. Do not broaden permissions just to make a test pass.

Handler authentication remains necessary where [`supabase/config.toml`](../supabase/config.toml) disables gateway JWT verification. See [`../supabase/README.md`](../supabase/README.md) for function groups and auth boundaries.

## Database workflow

Migrations live in [`supabase/migrations/`](../supabase/migrations/) and run in filename order. Database and policy tests live under [`supabase/tests/`](../supabase/tests/).

In a Superset workspace, use the repository's locking wrapper:

```bash
./.superset/db-gate.sh
```

Outside Superset, run the underlying commands directly:

```bash
npx supabase db start
npm run test:db
npx supabase stop --no-backup
```

The default local stack begins at port `54321` and uses shared container names, so it is not parallel-safe across worktrees. The wrapper holds `~/.superset/debatelab-db.lock` through database tests and the real-Auth collaboration browser journey, and stops the stack and owned processes on exit. Outside Superset, coordinate ownership before starting it. The agent that starts the stack stops it before finishing, including after failures when safe.

### A private database per agent

When several agents need a database at once, each can run its own Docker-free project with [`scripts/agent-stack.sh`](../scripts/agent-stack.sh). It uses the Supabase CLI's experimental stack engine (CLI 2.121 or newer) on the native runtime: no lock, no shared ports, and a cold start of about 20 seconds.

```bash
scripts/agent-stack.sh --name my-task start    # applies every migration; prints API_URL and DB_URL
scripts/agent-stack.sh --name my-task test     # what npm run test:db runs: pgTAP and the concurrency scripts
scripts/agent-stack.sh --name my-task psql -c 'select 1'
scripts/agent-stack.sh --name my-task advisors # Supabase security advisors
scripts/agent-stack.sh --name my-task reset    # re-apply migrations after editing them
scripts/agent-stack.sh --name my-task serve fn.env  # Edge Functions with fn.env's variables (foreground)
scripts/agent-stack.sh --name my-task destroy  # always, including after failures
```

Ports are assigned by the CLI; read them from the env file `start` prints. The stack cannot serve the magic-link email template, so the script runs the project from an overlay directory under `~/.cache/debatelab-stacks/` that drops that block and symlinks everything else. Use it for migrations, pgTAP, the concurrency scripts and RLS queries. The full-stack browser journeys still need `./.superset/db-gate.sh`, which is also what CI runs.

Never point local tests at staging or production. Never apply a migration to an unverified project.

## Browser workflow

[`playwright.config.ts`](../playwright.config.ts) starts Vite on an isolated port and refuses to reuse an existing server.

```bash
P=$(bash .superset/e2e-port.sh) && CI=1 PORT=$P PLAYWRIGHT_BASE_URL=http://127.0.0.1:$P npm run test:e2e
```

Failure artifacts go to ignored `test-results/` and `playwright-report/`. Protected staging disables traces, screenshots, and video.

Read [testing.md](testing.md) before running WebKit or staging.

Agentic tests (`agentic/*.e2e.ts`, the e2e runner) drive the verification stack, never a dev server you started. Run them with `.claude/skills/verify-debatelab/bin/verify.sh e2e run` after `verify.sh up`. See [testing.md](testing.md#agentic-browser-tests).

## Documentation workflow

Run:

```bash
npm run docs:check
```

The checker includes new Markdown by default. It validates supported local link forms and rejects actionable retired checkout paths. It does not validate remote URLs, Markdown syntax, or heading fragments.

When a command or boundary changes, update the focused document that owns it. Avoid duplicating source trees, schema listings, dependency catalogs, or model lists.

## Troubleshooting

### The wrong repository path appears

Run `git rev-parse --show-toplevel`. Use that result. Do not trust a copied `cd` command over the current worktree.

### Port 8080 is busy

Choose a free explicit development port. Do not point browser automation at an unrelated server.

### Browser tests attach to old state

Use the required `CI=1`, `PORT`, and `PLAYWRIGHT_BASE_URL` values. Playwright sets `reuseExistingServer: false`.

### Local Supabase will not start

Check whether another worktree owns the default containers or ports. Coordinate and stop the existing local stack rather than deleting containers blindly.

### Authentication works in one environment only

Check the active client environment and environment-specific browser storage. Do not copy production sessions into staging or alter server authorization to hide a client configuration error.

### A staging test is missing

All three staging values must be present together. Partial configuration is rejected. A disabled or skipped staging workflow is not a pass.
