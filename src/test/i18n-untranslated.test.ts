import { expect, test } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import hu from '../locales/hu.json';
import toolsEn from '../locales/tools/en.json';
import toolsEs from '../locales/tools/es.json';
import toolsHu from '../locales/tools/hu.json';

/**
 * Spanish and Hungarian values that are meant to read exactly as in English,
 * as `language namespace:key`. Anything else identical to English was most
 * likely never translated. See the glossary in docs/standards/ui.md.
 */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  'Product, plan and file-format names': [
    'es translation:home.title', 'hu translation:home.title',
    'es translation:settings.tierPro', 'hu translation:settings.tierPro',
    'es translation:pricing.pro', 'hu translation:pricing.pro',
    'es translation:pricingModal.pro', 'hu translation:pricingModal.pro',
    'es translation:common.pdf', 'hu translation:common.pdf',
    'es translation:common.docx', 'hu translation:common.docx',
    'es translation:common.googleDocs', 'hu translation:common.googleDocs',
    'es translation:sparring.scorecard.exportPdf', 'hu translation:sparring.scorecard.exportPdf',
    'es translation:libraryPage.urlSource', 'hu translation:libraryPage.urlSource',
    'es translation:login.demoCodePlaceholder', 'hu translation:login.demoCodePlaceholder',
  ],
  'Competition format names stay in English in every language, as on the free tools pages': [
    'es translation:timer.formatLD', 'hu translation:timer.formatLD',
    'es translation:timer.formatPF', 'hu translation:timer.formatPF',
    'es translation:timer.formatPolicy', 'hu translation:timer.formatPolicy',
    'es translation:sparring.format.ld', 'hu translation:sparring.format.ld',
    'es translation:sparring.format.pf', 'hu translation:sparring.format.pf',
    'es translation:debate.formats.bp', 'hu translation:debate.formats.bp',
    'es translation:debate.formats.policy', 'hu translation:debate.formats.policy',
  ],
  'Policy speech codes and school-format role codes': [
    ...['1ac', '1nc', '2ac', '2nc', '1nr', '1ar', '2nr', '2ar'].flatMap((code) => [
      `es translation:timer.speeches.policy.${code}`, `hu translation:timer.speeches.policy.${code}`,
    ]),
    'hu translation:sparring.turns.standard-3', 'hu translation:sparring.turns.standard-5',
  ],
  'Motion wording and paper size, named as printed on the sheet': [
    'es tools:motions.wordingResolved', 'hu tools:motions.wordingResolved',
    'hu tools:motions.wordingHouse',
    'hu tools:flow.letter',
  ],
  'Exordio, the rhetoric term, and unit abbreviations': [
    'es translation:generateResults.exordio', 'hu translation:generateResults.exordio',
    'es translation:export.exordio', 'hu translation:export.exordio',
    'es translation:generateResults.durationMs', 'hu translation:generateResults.durationMs',
    'es translation:crossfire.duration3m', 'es translation:crossfire.duration5m', 'es translation:crossfire.duration8m',
  ],
  'Sparring keeps its name in Spanish, where the word is used as is': [
    'es translation:nav.sparring', 'es translation:home.sparring', 'es translation:hero.preview.modeSparring',
    'es translation:features.sparring', 'es translation:historyPage.tabSparring', 'es translation:debate.kinds.sparring',
  ],
  'Spanish words spelled the same as the English ones': [
    'es translation:common.error', 'es translation:ask.failed', 'es translation:settings.deleteFailed',
    'es translation:settings.portalError', 'es translation:admin.error', 'es translation:pricingModal.redeemError',
    'es translation:workspaces.original', 'es translation:login.emailTab', 'es translation:generateForm.toneFormal',
    'es translation:generateForm.roleIntro', 'es translation:generateForm.roleConc',
    'es translation:timer.speeches.standard.intro', 'es translation:timer.speeches.standard.conc',
    'es translation:brainstormResults.neutral', 'es translation:debate.side.neutral',
    'es translation:askChat.modeGeneral', 'es translation:libraryPage.generalFolder', 'es translation:sourceQuality.types.generic',
    'es translation:askChat.pros', 'es translation:historyPage.tabChats', 'es translation:sourceQuality.types.social',
    'es translation:debateContext.debateHeading', 'es tools:motions.types.actor',
  ],
  'Hungarian words spelled the same as the English ones': [
    'hu tools:motions.topics.sport',
  ],
};

function flat(catalog: object, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]): [string, string][] => {
    const path = prefix + key;
    return typeof value === 'string' ? [[path, value]] : value && typeof value === 'object' ? flat(value, path + '.') : [];
  });
}

function sameAsEnglish(): string[] {
  const catalogs = { translation: { en, es, hu }, tools: { en: toolsEn, es: toolsEs, hu: toolsHu } };
  return Object.entries(catalogs).flatMap(([namespace, { en: english, ...others }]) => {
    const englishValues = new Map(flat(english));
    return Object.entries(others).flatMap(([language, catalog]) => flat(catalog)
      // Placeholders, numbers and punctuation alone need no translation.
      .filter(([key, value]) => value === englishValues.get(key) && /\p{L}{2}/u.test(value.replace(/\{\{[^}]*\}\}/g, '')))
      .map(([key]) => `${language} ${namespace}:${key}`));
  });
}

test('Spanish and Hungarian values match English only where that is intended', () => {
  const allowed = new Set(Object.values(SAME_AS_ENGLISH).flat());
  const found = sameAsEnglish();
  expect(found.filter((entry) => !allowed.has(entry))).toEqual([]);
  // An entry that no longer matches English has been translated: drop it from the list.
  expect([...allowed].filter((entry) => !found.includes(entry))).toEqual([]);
});
