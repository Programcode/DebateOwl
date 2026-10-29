import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import type { SparringSession } from '@debatelab/core/sparring/session';
import {
  buildAttackDocx,
  buildBrainstormDocx,
  buildCaseDocx,
  buildFactoidsDocx,
  buildSparringDocx,
  type BuiltDocx,
  type DocxContext,
  type DocxModule,
} from '@debatelab/core/export/docx';
import { isAppLanguage, toIntlLocale } from '@debatelab/core/languages';

import i18n from './i18n';

/**
 * The Word documents the website downloads, built by the shared builders in
 * @debatelab/core. export-docx.ts shares them; export-docx.web.ts keeps them
 * for the screenshot preview. Both take one of these builds.
 */
export type DocxBuild = (docx: DocxModule) => BuiltDocx;

type Translate = DocxContext['t'];

// The website's formatEuropeanDate and formatEuropeanDateTime ("27 Oct 2026",
// "27 Oct 2026, 14:30"), so the file reads the same on both. dates.ts keeps
// the app's numeric day format for screens.
function dateFormat(withTime: boolean): Intl.DateTimeFormat {
  const language = isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
}

function docxContext(t: Translate): DocxContext {
  const format = (date: Date, withTime: boolean) =>
    Number.isNaN(date.getTime()) ? t('common.notAvailable') : dateFormat(withTime).format(date);
  return {
    t,
    formatDate: (date) => format(date, false),
    formatDateTime: (date) => format(date, true),
  };
}

export const caseDocx = (result: GenerateOutput, t: Translate): DocxBuild =>
  (docx) => buildCaseDocx(docx, result, docxContext(t));

export const attackDocx = (result: AttackOutput, t: Translate): DocxBuild =>
  (docx) => buildAttackDocx(docx, result, docxContext(t));

export const brainstormDocx = (result: BrainstormOutput, t: Translate): DocxBuild =>
  (docx) => buildBrainstormDocx(docx, result, docxContext(t));

export const factoidsDocx = (result: FactoidsOutput, t: Translate): DocxBuild =>
  (docx) => buildFactoidsDocx(docx, result, docxContext(t));

export const sparringDocx = (session: SparringSession, t: Translate): DocxBuild =>
  (docx) => buildSparringDocx(docx, session, docxContext(t));
