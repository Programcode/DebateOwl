import { checkSourceFile, SourceFileImportError } from '@debatelab/core/source-file-import';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import SourceFileReader, { type SourceFileJob, type SourceFileOutcome } from '@/components/source-file-reader';
import { readPickedFile } from './picked-file';

export type { SourceFileOutcome };

/** Base64 characters per message to the reader: a multiple of 4, so every chunk decodes alone. */
const CHUNK_CHARS = 1_048_576;

/**
 * What the picker offers: the website's file input's `accept` list, and
 * `text/*` so the iOS picker also offers Markdown and CSV, whose types it
 * knows by UTI rather than MIME type. iOS skips the extensions; the reader
 * checks every file again anyway.
 */
export const SOURCE_FILE_PICKER_TYPES = [
  '.txt', '.md', '.markdown', '.csv', '.json', '.pdf', '.docx',
  'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/*',
];

let jobs = 0;

// A picked file waits here while the Import file sheet opens: the web preview's
// asset holds a browser File, which cannot travel in a route's params.
const picked = new Map<string, DocumentPickerAsset>();

export function holdPickedFile(asset: DocumentPickerAsset): string {
  const id = `picked-${++jobs}`;
  picked.clear();
  picked.set(id, asset);
  return id;
}

export function pickedFile(id: string | undefined): DocumentPickerAsset | null {
  return (id && picked.get(id)) || null;
}


/**
 * Reads a picked file with the website's reader (pdf.js and mammoth in a DOM
 * component). Render `reader` somewhere on the screen; it takes no space.
 * Size and type are checked before the file is read, as the website does.
 */
export function useSourceFileReader(): { reader: ReactNode; read: (asset: DocumentPickerAsset) => Promise<SourceFileOutcome> } {
  const [job, setJob] = useState<SourceFileJob | null>(null);
  const pending = useRef(new Map<string, { chunks: string[]; resolve: (outcome: SourceFileOutcome) => void }>());

  const read = useCallback(async (asset: DocumentPickerAsset): Promise<SourceFileOutcome> => {
    const file = { name: asset.name, type: asset.mimeType ?? '', size: asset.size ?? 0 };
    try {
      checkSourceFile(file);
    } catch (error) {
      if (error instanceof SourceFileImportError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
    let base64: string;
    try {
      base64 = await readPickedFile(asset);
    } catch (error) {
      return { ok: false, code: 'parse-failed', message: error instanceof Error ? error.message : String(error) };
    }
    const chunks: string[] = [];
    for (let start = 0; start < base64.length; start += CHUNK_CHARS) chunks.push(base64.slice(start, start + CHUNK_CHARS));
    // The picker's size can be missing; the bytes read decide.
    const size = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    const id = `file-${++jobs}`;
    return new Promise<SourceFileOutcome>((resolve) => {
      pending.current.set(id, { chunks, resolve });
      setJob({ id, name: asset.name, type: file.type, size, chunks: chunks.length });
    });
  }, []);

  const readChunk = useCallback(async (id: string, index: number) => pending.current.get(id)?.chunks[index] ?? '', []);
  const onDone = useCallback(async (id: string, outcome: SourceFileOutcome) => {
    const entry = pending.current.get(id);
    pending.current.delete(id);
    setJob((current) => (current?.id === id ? null : current));
    entry?.resolve(outcome);
  }, []);

  // The webview loads only while a file is being read.
  const reader = job ? <SourceFileReader job={job} readChunk={readChunk} onDone={onDone} dom={{ style: styles.hidden }} /> : null;
  return { reader, read };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
