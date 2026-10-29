import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import type { SparringSession } from '@debatelab/core/sparring/session';

import { attackDocx, brainstormDocx, caseDocx, factoidsDocx, sparringDocx, type DocxBuild } from './export-docx-content';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The web preview has no share sheet or file system. It builds the same Word
 * document and keeps its name and base64 on window, so the screenshot script
 * can check it.
 */
type ExportProbe = { __debatelabExport?: { docx?: { fileName: string; base64: string } } };

export async function shareDocx(build: DocxBuild, _dialogTitle: string): Promise<void> {
  const docx = await import('docx');
  const { doc, fileName } = build(docx);
  const base64 = await docx.Packer.toBase64String(doc);
  const target = window as unknown as ExportProbe;
  target.__debatelabExport ??= {};
  target.__debatelabExport.docx = { fileName, base64 };
}

export function shareCaseDocx(result: GenerateOutput, t: Translate, dialogTitle: string): Promise<void> {
  return shareDocx(caseDocx(result, t), dialogTitle);
}

export function shareAttackDocx(result: AttackOutput, t: Translate, dialogTitle: string): Promise<void> {
  return shareDocx(attackDocx(result, t), dialogTitle);
}

export function shareBrainstormDocx(result: BrainstormOutput, t: Translate, dialogTitle: string): Promise<void> {
  return shareDocx(brainstormDocx(result, t), dialogTitle);
}

export function shareFactoidsDocx(result: FactoidsOutput, t: Translate, dialogTitle: string): Promise<void> {
  return shareDocx(factoidsDocx(result, t), dialogTitle);
}

export function shareSparringDocx(session: SparringSession, t: Translate, dialogTitle: string): Promise<void> {
  return shareDocx(sparringDocx(session, t), dialogTitle);
}
