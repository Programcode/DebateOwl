import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, withEntitlementsPlist } from 'expo/config-plugins';

// CommonJS, because Node loads what app.config.ts imports as it is.
import { withAppIntents } from './plugins/with-app-intents';


// One config for Expo Go, the web export and the development build.
// DEBATELAB_BUILD=dev (set by the `development` profile in eas.json) adds the
// native modules Expo Go lacks. Without it the config is the one Expo Go has
// always used. DEBATELAB_APP_GROUP adds the timer's widget extension (its Live
// Activity, Dynamic Island clock and lock-screen widget), which needs the App
// Group `group.com.pistack.debateowl`, registered for both
// `com.pistack.debateowl` and `com.pistack.debateowl.ExpoWidgetsTarget`. On a
// device, set it only when the provisioning profile carries that group; a
// simulator build is not signed and always can.
// See docs/development.md#development-build.

type PermissionStrings = { speechRecognition: string; microphone: string };

const build = process.env.DEBATELAB_BUILD;
const appGroup = process.env.DEBATELAB_APP_GROUP;
// DEBATELAB_APPLE_ACCOUNT=1: the build is signed by DebateOwl's own Apple
// Developer team, whose App IDs carry the capabilities in docs/apple-platform.md
// (Sign in with Apple, Push, Time Sensitive Notifications, Associated Domains,
// In-App Purchase). Without it a development build keeps to what the borrowed
// signing profile allows.
const appleAccount = process.env.DEBATELAB_APPLE_ACCOUNT;
if (build !== undefined && build !== '' && build !== 'dev') {
  throw new Error(`DEBATELAB_BUILD must be "dev" or unset, not "${build}".`);
}
if (appleAccount !== undefined && appleAccount !== '' && appleAccount !== '1') {
  throw new Error(`DEBATELAB_APPLE_ACCOUNT must be "1" or unset, not "${appleAccount}".`);
}
if (appleAccount === '1' && build !== 'dev') {
  throw new Error('DEBATELAB_APPLE_ACCOUNT only applies to a development build (DEBATELAB_BUILD=dev).');
}
if (appGroup && build !== 'dev') {
  throw new Error('DEBATELAB_APP_GROUP only applies to a development build (DEBATELAB_BUILD=dev).');
}

const bundleIdentifier = 'com.pistack.debateowl';
const APP_GROUP = 'group.com.pistack.debateowl';
if (appGroup && appGroup !== APP_GROUP) {
  throw new Error(`DEBATELAB_APP_GROUP must be "${APP_GROUP}", not "${appGroup}".`);
}

function permissionStrings(projectRoot: string, language: 'en' | 'es' | 'hu'): PermissionStrings {
  const file = path.join(projectRoot, '../../src/locales', `${language}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).mobile.permissions;
}

// Prebuild writes these into InfoPlist.strings as `KEY = "value";` without escaping.
const stringsValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function iosLocale(strings: PermissionStrings) {
  return {
    ios: {
      NSSpeechRecognitionUsageDescription: stringsValue(strings.speechRecognition),
      NSMicrophoneUsageDescription: stringsValue(strings.microphone),
    },
  };
}

// expo-widgets adds the push entitlement even with its push option off, and
// prebuild applies expo-notifications' plugin on its own once the package is
// installed, which adds it too; expo-apple-authentication's plugin, also
// applied on its own, adds Sign in with Apple. The borrowed signing profile
// has neither, so a development build drops both unless it is signed by
// DebateOwl's own account (DEBATELAB_APPLE_ACCOUNT).
const withoutAccountEntitlements: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    delete mod.modResults['com.apple.developer.applesignin'];
    return mod;
  });

// Native config for the Current Debate widget, Home Screen quick actions and
// Spotlight. Called only for a development build (DEBATELAB_BUILD=dev), after the
// expo-widgets entry, so the Expo Go
// config never changes. Each part turns on only when it can work:
// - the widget needs the App Group, which is when app.config.ts adds expo-widgets;
// - quick actions need expo-quick-actions to hand the picked item to the app;
// - Spotlight needs expo-core-spotlight@^2 and its plugin (SDK 56 and 57).
// Strings come from src/locales; a missing key fails the config with its name.

type Language = 'en' | 'es' | 'hu';
const LANGUAGES: Language[] = ['en', 'es', 'hu'];

/** The widget's name in src/widgets/current-debate.tsx's createWidget call. */
const WIDGET_NAME = 'CurrentDebate';

/**
 * Info.plist titles are keys into each language's InfoPlist.strings, which
 * prebuild writes as `KEY = "value";` without quoting the key, so they are
 * plain identifiers. The types are the routes in src/lib/quick-actions.ts.
 */
const QUICK_ACTIONS = [
  { type: 'new-debate', titleKey: 'QuickActionNewDebate', catalogKey: 'mobile.debates.newDebate', symbol: 'plus.bubble' },
  { type: 'timer', titleKey: 'QuickActionStartTimer', catalogKey: 'mobile.quickActions.startTimer', symbol: 'timer' },
  { type: 'ask', titleKey: 'QuickActionAsk', catalogKey: 'askChat.title', symbol: 'questionmark.bubble' },
] as const;

type WidgetsPluginOptions = { widgets?: { name: string }[] };

export function withRound4(config: ExpoConfig, opts: { appGroup?: string; projectRoot: string }): ExpoConfig {
  const catalogs = new Map<Language, unknown>();
  const text = (language: Language, key: string): string => {
    if (!catalogs.has(language)) {
      const file = path.join(opts.projectRoot, '../../src/locales', `${language}.json`);
      catalogs.set(language, JSON.parse(readFileSync(file, 'utf8')));
    }
    const value = key.split('.').reduce<unknown>(
      (node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      catalogs.get(language),
    );
    if (typeof value !== 'string' || value === '') {
      throw new Error(`app.config.ts: src/locales/${language}.json has no "${key}".`);
    }
    return value;
  };
  const resolve = createRequire(path.join(opts.projectRoot, 'package.json')).resolve;
  const installed = (name: string) => {
    try {
      resolve(`${name}/package.json`);
      return true;
    } catch {
      return false;
    }
  };

  if (opts.appGroup) {
    const entry = config.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-widgets');
    if (!Array.isArray(entry) || entry.length < 2) {
      throw new Error(
        'app.config.ts: withRound4 must run after app.config.ts adds the expo-widgets plugin (its DEBATELAB_APP_GROUP block).',
      );
    }
    const options = entry[1] as WidgetsPluginOptions;
    // The gallery's name and description are compiled into the extension in English.
    options.widgets = [
      ...(options.widgets ?? []).filter((widget) => widget.name !== WIDGET_NAME),
      {
        name: WIDGET_NAME,
        displayName: text('en', 'nav.currentDebate'),
        description: text('en', 'mobile.widget.description'),
        ios: { supportedFamilies: ['systemSmall', 'systemMedium'] },
      } as { name: string },
    ];
  }

  if (installed('expo-quick-actions')) {
    config.ios = { ...config.ios, infoPlist: { ...config.ios?.infoPlist } };
    config.ios.infoPlist!.UIApplicationShortcutItems = QUICK_ACTIONS.map((action) => ({
      UIApplicationShortcutItemType: action.type,
      UIApplicationShortcutItemTitle: action.titleKey,
      UIApplicationShortcutItemIconSymbolName: action.symbol,
    }));
    const locales = (config.locales ??= {});
    for (const language of LANGUAGES) {
      const current = locales[language];
      if (typeof current === 'string') {
        throw new Error(`app.config.ts: locales.${language} is a file path; it needs to be an object to add the quick actions.`);
      }
      const titles = Object.fromEntries(
        QUICK_ACTIONS.map((action) => [action.titleKey, stringsValue(text(language, action.catalogKey))]),
      );
      locales[language] = { ...current, ios: { ...current?.ios, ...titles } };
    }
  }

  if (installed('expo-core-spotlight')) {
    config.plugins = [...(config.plugins ?? []).filter((plugin) => plugin !== 'expo-core-spotlight'), 'expo-core-spotlight'];
  }

  return config;
}

// Round 6 (docs/apple-platform.md): Sign in with Apple and Google, the
// time-sensitive timer alert, Handoff and push, for development builds only,
// so the Expo Go config never changes. What needs DebateOwl's own Apple
// account waits for DEBATELAB_APPLE_ACCOUNT.
export function withApplePlatform(config: ExpoConfig, opts: { appleAccount: boolean }): ExpoConfig {
  // Handoff (src/lib/handoff.ts), next to Expo Router's own activity type.
  config.ios = {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      NSUserActivityTypes: [...((config.ios?.infoPlist?.NSUserActivityTypes as string[] | undefined) ?? []), 'com.pistack.debateowl.browsing'],
    },
  };
  config.extra = {
    ...config.extra,
    // Google sign-in runs in any development build: the redirect comes back on the app's own scheme.
    googleSignIn: true,
    signInWithApple: opts.appleAccount,
  };
  if (!opts.appleAccount) return config;
  config.ios = { ...config.ios, usesAppleSignIn: true };
  config.ios.associatedDomains = [
    ...(config.ios.associatedDomains ?? []),
    // Handoff from debateowl.com in Safari to the app.
    'activitycontinuation:debateowl.com',
  ];
  config.ios.entitlements = {
    ...config.ios.entitlements,
    // The timer's time-up alert breaks through a Focus (src/lib/timer-alerts.ts).
    'com.apple.developer.usernotifications.time-sensitive': true,
  };
  return config;
}

export default ({ projectRoot }: ConfigContext): ExpoConfig => {
  const config: ExpoConfig = {
    name: 'DebateOwl',
    slug: 'debateowl',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/images/icon.png',
    scheme: 'debatelab',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier,
      supportsTablet: true,
      infoPlist: {
        CADisableMinimumFrameDurationOnPhone: true,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#DDF0FF',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F7FAFE',
          image: './assets/images/splash-icon.png',
          imageWidth: 150,
          dark: { backgroundColor: '#0B1426' },
        },
      ],
    ],
    // The EAS project @pi-stack/debateowl, from `eas init`.
    owner: 'pi-stack',
    extra: {
      websiteUrl: 'https://debateowl.com',
      eas: { projectId: 'd60fc378-2e30-48b2-bcee-a1b1d1632bf9' },
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };

  if (build !== 'dev') return config;

  const en = permissionStrings(projectRoot, 'en');
  config.ios!.infoPlist!.CFBundleAllowMixedLocalizations = true;
  // English is the base Info.plist (from the plugin below); these translate it.
  config.locales = {
    es: iosLocale(permissionStrings(projectRoot, 'es')),
    hu: iosLocale(permissionStrings(projectRoot, 'hu')),
  };
  // Universal links for debateowl.com/share/* and /app/* (src/app/+native-intent.tsx). They work
  // once the provisioning profile has Associated Domains and the website serves
  // apple-app-site-association; Expo Go cannot have them.
  config.ios!.associatedDomains = ['applinks:debateowl.com', 'applinks:www.debateowl.com'];
  config.plugins!.push(
    'expo-dev-client',
    [
      'expo-speech-recognition',
      { speechRecognitionPermission: en.speechRecognition, microphonePermission: en.microphone },
    ],
  );
  if (appGroup) {
    config.plugins!.push([
      'expo-widgets',
      {
        bundleIdentifier: `${bundleIdentifier}.ExpoWidgetsTarget`,
        groupIdentifier: APP_GROUP,
        enablePushNotifications: false,
        widgets: [
          // The timer's lock-screen widget (src/widgets/timer-widgets.tsx). The Live
          // Activity and Dynamic Island need no entry: the extension draws every
          // Live Activity the app starts.
          {
            name: 'DebateTimerWidget',
            displayName: 'DebateOwl timer',
            description: 'The speech or prep clock running in the DebateOwl timer.',
            ios: { supportedFamilies: ['accessoryRectangular', 'accessoryCircular', 'accessoryInline'] },
          },
        ],
      },
    ]);
  }
  // The Current Debate widget (with the App Group), quick actions and Spotlight; see withRound4 above.
  withRound4(config, { appGroup, projectRoot });
  withApplePlatform(config, { appleAccount: appleAccount === '1' });
  // Siri and Shortcuts: the intents compile into the app target (plugins/with-app-intents.js).
  const withIntents = withAppIntents(config);
  // DebateOwl's own account has Push and Sign in with Apple on its App ID, so its builds keep both.
  if (appleAccount === '1') return withIntents;
  // Registered before Expo applies the plugins list. Mods registered later act
  // first, so this one runs after the plugins have written their entitlements.
  return withoutAccountEntitlements(withIntents);
};
