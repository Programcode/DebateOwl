import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, withEntitlementsPlist } from 'expo/config-plugins';

// One config for Expo Go, the web export and the development build.
// DEBATELAB_BUILD=dev (set by the `development` profile in eas.json) adds the
// native modules Expo Go lacks. Without it the config is the one Expo Go has
// always used. DEBATELAB_APP_GROUP adds the lock-screen timer's widget
// extension, which needs an App Group: set it only when the provisioning
// profile carries that group. See docs/development.md#development-build.

type PermissionStrings = { speechRecognition: string; microphone: string };

const build = process.env.DEBATELAB_BUILD;
const appGroup = process.env.DEBATELAB_APP_GROUP;
if (build !== undefined && build !== '' && build !== 'dev') {
  throw new Error(`DEBATELAB_BUILD must be "dev" or unset, not "${build}".`);
}
if (appGroup && build !== 'dev') {
  throw new Error('DEBATELAB_APP_GROUP only applies to a development build (DEBATELAB_BUILD=dev).');
}

// Kept from the DebateLab name until Adam decides on the store listing: a new id is a new app in App Store Connect.
const bundleIdentifier = 'com.adam.debatelab';

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
// installed, which adds it too. The signing profile has no push, so every
// development build drops it until a profile with push exists.
const withoutPushEntitlement: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });

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
    extra: {
      websiteUrl: 'https://debateowl.com',
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
        groupIdentifier: appGroup,
        enablePushNotifications: false,
        widgets: [],
      },
    ]);
  }
  // Registered before Expo applies the plugins list. Mods registered later act
  // first, so this one runs after the plugins have written their entitlements.
  return withoutPushEntitlement(config);
};
