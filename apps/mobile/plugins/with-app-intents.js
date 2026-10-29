// @ts-check
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

/**
 * Siri, Shortcuts and Spotlight actions (App Intents) for the development build.
 *
 * Why a config plugin and not a local Expo module: Xcode extracts App Intents
 * metadata (appintentsmetadataprocessor) only for the target that compiles the
 * intents, and a CocoaPods static library is not that target, so the intents and
 * their AppShortcutsProvider must be compiled into the app target itself. During
 * prebuild this plugin
 *
 * - copies plugins/app-intents/DebateOwlAppIntents.swift to ios/<App>/ and adds it
 *   to the app target's Sources, with AppIntents.framework linked;
 * - copies the Siri phrases, plugins/app-intents/<lang>.lproj/AppShortcuts.strings,
 *   to ios/<App>/<lang>.lproj/ and adds them as one localized resource;
 * - writes ios/<App>/<lang>.lproj/Localizable.strings for Spanish and Hungarian
 *   with the intents' titles (keyed by their English wording, which is how
 *   LocalizedStringResource looks them up), translated from src/locales.
 *
 * Expo's own `locales` writer cannot carry those titles: it writes keys unquoted,
 * so a key with a space breaks the file. Prebuild runs again and again, so every
 * step checks before it adds.
 *
 * This file is CommonJS with JSDoc types, not TypeScript: app.config.ts is
 * transpiled by Expo's config loader, but what it imports is loaded by Node
 * itself, which does not resolve an extensionless import to a .ts file, and
 * loads a .ts file imported with its extension as ESM, where
 * `expo/config-plugins` does not resolve without `.js`.
 */

const SOURCE_DIR = 'plugins/app-intents';
const SWIFT_FILE = 'DebateOwlAppIntents.swift';
const PHRASES_FILE = 'AppShortcuts.strings';
const TITLES_FILE = 'Localizable.strings';
/** @typedef {'en' | 'es' | 'hu'} Language */
/** @type {readonly Language[]} */
const PHRASE_LANGUAGES = ['en', 'es', 'hu'];
/** @type {readonly Language[]} */
const TRANSLATED = ['es', 'hu'];

/**
 * Each English string the Swift file shows (intent titles and descriptions,
 * parameter titles, short titles) and the catalog key whose wording it is.
 * The English catalog must say exactly this, so the app and Siri agree.
 */
const TITLES = [
  { catalogKey: 'mobile.quickActions.startTimer', english: 'Start timer' },
  { catalogKey: 'home.timerDesc', english: 'Practice speaking rounds with tournament timing controls.' },
  { catalogKey: 'askChat.title', english: 'Ask your coach' },
  { catalogKey: 'home.askDesc', english: 'Get coaching on your next move.' },
  { catalogKey: 'export.question', english: 'Question' },
  { catalogKey: 'mobile.debates.newDebate', english: 'New debate' },
  { catalogKey: 'features.generate', english: 'Case generator' },
  { catalogKey: 'home.generateDesc', english: 'Build a complete debate case.' },
  { catalogKey: 'debate.motion', english: 'Motion' },
  { catalogKey: 'nav.library', english: 'Library' },
  { catalogKey: 'home.libraryDesc', english: 'Manage and toggle sources used for grounded responses.' },
  { catalogKey: 'historyPage.startSparring', english: 'Start sparring' },
  { catalogKey: 'home.sparringDesc', english: 'Run a timed round against AI.' },
];

/**
 * A .strings literal: backslashes, quotes and line breaks escaped.
 * @param {string} value
 */
const quoted = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/**
 * @param {string} projectRoot
 * @param {Language} language
 * @param {string} key
 * @returns {string}
 */
function catalogText(projectRoot, language, key) {
  const file = path.join(projectRoot, '../../src/locales', `${language}.json`);
  /** @type {unknown} */
  let node = JSON.parse(readFileSync(file, 'utf8'));
  for (const part of key.split('.')) {
    node = node !== null && typeof node === 'object' ? /** @type {Record<string, unknown>} */ (node)[part] : undefined;
  }
  if (typeof node !== 'string' || node === '') {
    throw new Error(`with-app-intents: src/locales/${language}.json has no "${key}".`);
  }
  return node;
}

/**
 * The phrases in AppShortcutsProvider (one-line string literals that name the app),
 * in the strings files' form (`${applicationName}`).
 * @param {string} swift
 */
function swiftPhrases(swift) {
  const phrases = [...swift.matchAll(/"((?:[^"\\\n]|\\.)*\\\(\.applicationName\)(?:[^"\\\n]|\\.)*)"/g)];
  return phrases.map((match) => match[1].replace('\\(.applicationName)', '${applicationName}'));
}

/**
 * Fails prebuild, with the reason, when the Swift file and the strings drift
 * apart: a title whose English is not the catalog's, or a phrase some language
 * does not translate.
 * @param {string} projectRoot
 * @param {string} swift
 */
function checkSources(projectRoot, swift) {
  for (const { catalogKey, english } of TITLES) {
    const catalog = catalogText(projectRoot, 'en', catalogKey);
    if (catalog !== english) {
      throw new Error(
        `with-app-intents: src/locales/en.json "${catalogKey}" is "${catalog}", but ${SWIFT_FILE} and this plugin say "${english}". Update both.`,
      );
    }
    if (!swift.includes(quoted(english))) {
      throw new Error(`with-app-intents: ${SWIFT_FILE} no longer shows "${english}"; update TITLES in plugins/with-app-intents.js.`);
    }
  }
  const phrases = swiftPhrases(swift);
  if (phrases.length === 0) throw new Error(`with-app-intents: found no Siri phrases in ${SWIFT_FILE}.`);
  for (const language of PHRASE_LANGUAGES) {
    const strings = readFileSync(path.join(projectRoot, SOURCE_DIR, `${language}.lproj`, PHRASES_FILE), 'utf8');
    for (const phrase of phrases) {
      if (!strings.includes(`${quoted(phrase)} =`)) {
        throw new Error(`with-app-intents: ${language}.lproj/${PHRASES_FILE} does not translate "${phrase}".`);
      }
    }
  }
}

/**
 * @param {string} projectRoot
 * @param {Language} language
 */
function titlesStrings(projectRoot, language) {
  const lines = TITLES.map(
    ({ catalogKey, english }) => `${quoted(english)} = ${quoted(catalogText(projectRoot, language, catalogKey))};`,
  );
  return `/* Written by plugins/with-app-intents.js from src/locales/${language}.json. Do not edit. */\n${lines.join('\n')}\n`;
}

/**
 * @param {string} file
 * @param {string | Buffer} contents
 */
function writeIfChanged(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(contents))) return;
  writeFileSync(file, contents);
}

/**
 * Copies the Swift file and the strings into ios/<App>/, and writes the translated titles.
 * @param {string} projectRoot apps/mobile
 * @param {string} appDirectory ios/<App>
 */
function writeNativeFiles(projectRoot, appDirectory) {
  const source = path.join(projectRoot, SOURCE_DIR);
  const swift = readFileSync(path.join(source, SWIFT_FILE), 'utf8');
  checkSources(projectRoot, swift);
  writeIfChanged(path.join(appDirectory, SWIFT_FILE), swift);
  for (const language of PHRASE_LANGUAGES) {
    writeIfChanged(
      path.join(appDirectory, `${language}.lproj`, PHRASES_FILE),
      readFileSync(path.join(source, `${language}.lproj`, PHRASES_FILE)),
    );
  }
  for (const language of TRANSLATED) {
    writeIfChanged(path.join(appDirectory, `${language}.lproj`, TITLES_FILE), titlesStrings(projectRoot, language));
  }
}

// ---------------------------------------------------------------------------
// The Xcode project. The `xcode` package's object model, only the parts used.

/** @typedef {Parameters<typeof IOSConfig.XcodeUtils.addBuildSourceFileToGroup>[0]['project']} XcodeProject */
/** @typedef {{ value: string; comment?: string }} Child */
/** @typedef {Record<string, unknown> & { isa?: string; name?: string; children?: Child[]; files?: Child[]; buildPhases?: Child[] }} PbxObject */
/** @typedef {Record<string, PbxObject | string>} Section */
/**
 * @typedef {{
 *   hash: { project: { objects: Record<string, Section | undefined> } };
 *   generateUuid(): string;
 *   getFirstProject(): { firstProject: { mainGroup: string } };
 *   getPBXGroupByKey(key: string): PbxObject | undefined;
 *   addKnownRegion(name: string): void;
 * }} PbxProject
 */

/**
 * @param {PbxProject} project
 * @param {string} isa
 * @returns {Section}
 */
function section(project, isa) {
  const objects = project.hash.project.objects;
  return (objects[isa] ??= {});
}

/**
 * The app's group (ios/<App>/ in the navigator), found by name under the main group.
 * @param {PbxProject} project
 * @param {string} projectName
 * @returns {PbxObject & { children: Child[] }}
 */
function appGroup(project, projectName) {
  const main = project.getPBXGroupByKey(project.getFirstProject().firstProject.mainGroup);
  const child = main?.children?.find((entry) => entry.comment === projectName);
  const group = child ? project.getPBXGroupByKey(child.value) : undefined;
  if (!group?.children) throw new Error(`with-app-intents: the Xcode project has no "${projectName}" group.`);
  return /** @type {PbxObject & { children: Child[] }} */ (group);
}

/**
 * @param {PbxProject} project
 * @param {string} targetUuid
 * @returns {PbxObject & { files: Child[] }}
 */
function resourcesPhase(project, targetUuid) {
  const target = section(project, 'PBXNativeTarget')[targetUuid];
  const phases = typeof target === 'object' ? target.buildPhases : undefined;
  const resources = section(project, 'PBXResourcesBuildPhase');
  for (const phase of phases ?? []) {
    const entry = resources[phase.value];
    if (typeof entry === 'object' && entry.files) return /** @type {PbxObject & { files: Child[] }} */ (entry);
  }
  throw new Error('with-app-intents: the app target has no Copy Bundle Resources phase.');
}

/**
 * One localized resource, as Xcode itself stores it: a PBXVariantGroup named
 * after the file in the app's group, a child per language pointing at
 * <App>/<lang>.lproj/<file> (the bundle's <lang>.lproj comes from that folder),
 * and one entry in Copy Bundle Resources. Languages already there are left alone.
 * @param {PbxProject} project
 * @param {{ projectName: string; targetUuid: string; fileName: string; languages: readonly Language[] }} options
 */
function addLocalizedResource(project, { projectName, targetUuid, fileName, languages }) {
  const group = appGroup(project, projectName);
  const variants = section(project, 'PBXVariantGroup');
  let variantKey = group.children.find((child) => child.comment === fileName && typeof variants[child.value] === 'object')?.value;

  if (!variantKey) {
    variantKey = project.generateUuid();
    variants[variantKey] = { isa: 'PBXVariantGroup', children: [], name: fileName, sourceTree: '"<group>"' };
    variants[`${variantKey}_comment`] = fileName;
    group.children.push({ value: variantKey, comment: fileName });

    const buildFile = project.generateUuid();
    const comment = `${fileName} in Resources`;
    const buildFiles = section(project, 'PBXBuildFile');
    buildFiles[buildFile] = { isa: 'PBXBuildFile', fileRef: variantKey, fileRef_comment: fileName };
    buildFiles[`${buildFile}_comment`] = comment;
    resourcesPhase(project, targetUuid).files.push({ value: buildFile, comment });
  }

  const variant = /** @type {PbxObject} */ (variants[variantKey]);
  const children = (variant.children ??= []);
  const references = section(project, 'PBXFileReference');
  for (const language of languages) {
    if (children.some((child) => child.comment === language)) continue;
    const reference = project.generateUuid();
    references[reference] = {
      isa: 'PBXFileReference',
      lastKnownFileType: 'text.plist.strings',
      name: language,
      path: `"${projectName}/${language}.lproj/${fileName}"`,
      sourceTree: '"<group>"',
    };
    references[`${reference}_comment`] = language;
    children.push({ value: reference, comment: language });
    project.addKnownRegion(language);
  }
}

/**
 * Adds the intents and their strings to the app target. Exported for a check
 * against a bare Expo template; calling it again changes nothing.
 * @param {XcodeProject} project
 * @param {string} projectName
 * @returns {XcodeProject}
 */
function addAppIntentsToProject(project, projectName) {
  const { uuid: targetUuid } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
  // Skips itself when the file is already in the group.
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
    filepath: `${projectName}/${SWIFT_FILE}`,
    groupName: projectName,
    project,
    targetUuid,
  });
  // `import AppIntents` would link it anyway; the explicit dependency is what the
  // metadata processor looks for before it extracts anything. Skips itself when present.
  IOSConfig.XcodeUtils.addFramework({ project, projectName, framework: 'AppIntents.framework' });

  const pbx = /** @type {PbxProject} */ (/** @type {unknown} */ (project));
  addLocalizedResource(pbx, { projectName, targetUuid, fileName: PHRASES_FILE, languages: PHRASE_LANGUAGES });
  addLocalizedResource(pbx, { projectName, targetUuid, fileName: TITLES_FILE, languages: TRANSLATED });
  return project;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withAppIntents = (config) => {
  for (const language of TRANSLATED) {
    const locale = config.locales?.[language];
    const ios = typeof locale === 'object' && locale !== null ? locale.ios : undefined;
    if (typeof ios === 'object' && ios !== null && TITLES_FILE in ios) {
      throw new Error(`with-app-intents: locales.${language}.ios already has "${TITLES_FILE}"; both would write ${language}.lproj/${TITLES_FILE}.`);
    }
  }
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const projectName = mod.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(projectRoot);
      writeNativeFiles(projectRoot, path.join(platformProjectRoot, projectName));
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    const projectName = mod.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    mod.modResults = addAppIntentsToProject(mod.modResults, projectName);
    return mod;
  });
};

module.exports = { withAppIntents, addAppIntentsToProject };
