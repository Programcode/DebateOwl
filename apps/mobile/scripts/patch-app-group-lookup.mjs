#!/usr/bin/env node
/**
 * Lets the widgets, Live Activities and the share extension find their App
 * Group in an IPA that AltStore re-signed with a free Apple ID. AltStore
 * registers `group.com.pistack.debateowl` as `group.com.pistack.debateowl.<TEAMID>`
 * and writes the new name into each bundle's Info.plist as `ALTAppGroups`;
 * expo-widgets and expo-share-intent read only their own key, so they would
 * look for a group the signature does not carry and the app would run without
 * them. With this patch each lookup takes the first `ALTAppGroups` entry when
 * there is one and its own key otherwise, so every other build is unchanged.
 *
 * EAS runs it after installing (`eas-build-post-install` in package.json; the
 * `sideload` custom build calls that script itself, before and after
 * prebuild, because prebuild copies the share extension's template). It is
 * safe to run again. See docs/development.md#sideloaded-ipa.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const altGroup = '(Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String])?.first';

const patches = [
  {
    file: path.join(dir('expo-widgets'), 'ios/WidgetsStorage.swift'),
    from: 'Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String',
    to: `${altGroup} ?? (Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String)`,
    count: 1,
  },
  {
    file: path.join(dir('expo-widgets'), 'ios/Widgets/TimelineProvider.swift'),
    from: 'Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String',
    to: `${altGroup} ?? (Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String)`,
    count: 2,
  },
  {
    file: path.join(dir('expo-share-intent'), 'ios/ExpoShareIntentModule.swift'),
    from: 'Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier")\n            as? String',
    to: `${altGroup} ?? (Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier")\n            as? String)`,
    count: 1,
  },
  {
    file: path.join(dir('expo-share-intent'), 'plugin/build/ios/ShareExtensionViewController.swift'),
    from: 'let hostAppGroupIdentifier: String = "<GROUPIDENTIFIER>"',
    to: `let hostAppGroupIdentifier: String = ${altGroup} ?? "<GROUPIDENTIFIER>"`,
    count: 1,
  },
];

for (const { file, from, to, count } of patches) {
  const source = readFileSync(file, 'utf8');
  const name = path.relative(path.dirname(path.dirname(file)), file);
  if (source.includes('"ALTAppGroups"')) {
    console.log(`${name}: already reads ALTAppGroups.`);
    continue;
  }
  const found = source.split(from).length - 1;
  if (found !== count) {
    throw new Error(`${file}: expected ${count} App Group lookup(s), found ${found}; check whether this patch still fits.`);
  }
  writeFileSync(file, source.split(from).join(to));
  console.log(`${name}: reads ALTAppGroups first.`);
}
