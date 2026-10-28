import { isAskTextFile, type AskFileContent } from '@debatelab/core/ai/ask-files';
import { MAX_FILE_COUNT, MAX_FILE_SIZE, validateSingleFile } from '@debatelab/core/validation/file';
import * as DocumentPicker from 'expo-document-picker';

import { readPickedText } from './read-file';

/**
 * Ask's attachments, as the website's: up to five text or code files of
 * 10 MB each, read on the device and sent as part of the question
 * (packages/core/src/ai/ask-files.ts). Nothing is uploaded.
 */

export interface AskAttachment {
  name: string;
  size: number;
  type: string;
  uri: string;
  file?: Blob;
}

export type AttachmentProblem = { kind: 'tooMany' } | { kind: 'tooLarge'; name: string } | { kind: 'type'; name: string };

/** Lets the student pick files to add to `current`; the website's limits decide which are kept. */
export async function pickAskFiles(current: AskAttachment[]): Promise<{ files: AskAttachment[]; problem?: AttachmentProblem } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ['text/*', 'application/json', 'application/xml', 'public.source-code', 'public.text'] });
  if (picked.canceled) return null;
  const added = picked.assets.map((asset): AskAttachment => ({
    name: asset.name,
    size: asset.size ?? 0,
    type: asset.mimeType ?? '',
    uri: asset.uri,
    ...(asset.file ? { file: asset.file } : {}),
  }));
  if (current.length + added.length > MAX_FILE_COUNT) return { files: current, problem: { kind: 'tooMany' } };
  for (const file of added) {
    if (validateSingleFile(file).valid) continue;
    return { files: current, problem: file.size > MAX_FILE_SIZE ? { kind: 'tooLarge', name: file.name } : { kind: 'type', name: file.name } };
  }
  return { files: [...current, ...added] };
}

/** Each attachment's text for the message, as the website reads them. */
export function readAskFiles(files: AskAttachment[]): Promise<AskFileContent[]> {
  return Promise.all(files.map(async (file): Promise<AskFileContent> => {
    if (!isAskTextFile(file)) return { name: file.name, skipped: file.type };
    try {
      return { name: file.name, text: await readPickedText(file) };
    } catch {
      return { name: file.name, unreadable: true };
    }
  }));
}
