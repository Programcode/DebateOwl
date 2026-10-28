import { checkSourceFile, SourceFileImportError } from '@debatelab/core/source-file-import';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import SourceFileReader, { type SourceFileJob, type SourceFileOutcome } from '@/components/source-file-reader';
import { pickedFileSize, readPickedChunk } from './picked-file';

export type { SourceFileOutcome };

/** Bytes per slice sent to the reader: a multiple of 3, so each slice's base64 (1 MB) decodes alone. */
const CHUNK_BYTES = 786_432;
/** A long PDF can take a while; a reader that never answers (its webview failed to load) cannot hang the sheet. */
const READ_TIMEOUT_MS = 120_000;

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
 * Size and type are checked before any of the file is read, as the website
 * does, with the file's own size when the picker gives none. The reader then
 * pulls the file one slice at a time. A read always ends: with the result, an
 * error, `timeout` when the reader never answers (its webview failed to load),
 * or `cancelled` when another file replaces it or the screen closes.
 */
export function useSourceFileReader(): { reader: ReactNode; read: (asset: DocumentPickerAsset) => Promise<SourceFileOutcome> } {
  const [job, setJob] = useState<SourceFileJob | null>(null);
  const current = useRef<{ id: string; asset: DocumentPickerAsset; size: number; resolve: (outcome: SourceFileOutcome) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  const finish = useCallback((id: string, outcome: SourceFileOutcome) => {
    const entry = current.current;
    if (!entry || entry.id !== id) return;
    clearTimeout(entry.timer);
    current.current = null;
    setJob((shown) => (shown?.id === id ? null : shown));
    entry.resolve(outcome);
  }, []);

  // Leaving the screen ends the read in progress.
  useEffect(() => () => {
    const entry = current.current;
    if (entry) finish(entry.id, { ok: false, code: 'cancelled', message: 'The file reader closed' });
  }, [finish]);

  const read = useCallback(async (asset: DocumentPickerAsset): Promise<SourceFileOutcome> => {
    const type = asset.mimeType ?? '';
    let size: number;
    try {
      size = pickedFileSize(asset);
      checkSourceFile({ name: asset.name, type, size });
    } catch (error) {
      if (error instanceof SourceFileImportError) return { ok: false, code: error.code, message: error.message };
      return { ok: false, code: 'parse-failed', message: error instanceof Error ? error.message : String(error) };
    }
    // One file at a time: a new one replaces the read in progress.
    if (current.current) finish(current.current.id, { ok: false, code: 'cancelled', message: 'Another file replaced this one' });
    const id = `file-${++jobs}`;
    return new Promise<SourceFileOutcome>((resolve) => {
      const timer = setTimeout(() => finish(id, { ok: false, code: 'timeout', message: 'The file reader did not answer' }), READ_TIMEOUT_MS);
      current.current = { id, asset, size, resolve, timer };
      setJob({ id, name: asset.name, type, size, chunks: Math.max(1, Math.ceil(size / CHUNK_BYTES)) });
    });
  }, [finish]);

  const readChunk = useCallback(async (id: string, index: number) => {
    const entry = current.current;
    if (!entry || entry.id !== id) throw new Error('This file is no longer being read');
    const start = index * CHUNK_BYTES;
    return readPickedChunk(entry.asset, start, Math.max(0, Math.min(CHUNK_BYTES, entry.size - start)));
  }, []);
  const onDone = useCallback(async (id: string, outcome: SourceFileOutcome) => finish(id, outcome), [finish]);

  // The webview loads only while a file is being read.
  const reader = job ? <SourceFileReader job={job} readChunk={readChunk} onDone={onDone} dom={{ style: styles.hidden }} /> : null;
  return { reader, read };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
