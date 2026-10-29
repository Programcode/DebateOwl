import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { attackDocx, brainstormDocx, caseDocx, factoidsDocx, type DocxBuild } from './export-docx-content';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_UTI = 'org.openxmlformats.wordprocessingml.document';

/**
 * The website's Word document on the phone: `docx` (loaded only when asked
 * for, it is large) packs it to base64, which is written to the cache under
 * the website's file name and handed to the share sheet.
 */
export async function shareDocx(build: DocxBuild, dialogTitle: string): Promise<void> {
  const docx = await import('docx');
  const { doc, fileName } = build(docx);
  const base64 = await docx.Packer.toBase64String(doc);
  const target = new File(Paths.cache, fileName);
  target.create({ overwrite: true });
  target.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(target.uri, { mimeType: DOCX_MIME, UTI: DOCX_UTI, dialogTitle });
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
