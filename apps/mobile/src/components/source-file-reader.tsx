'use dom';

import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { useEffect } from 'react';
import {
  importSourceFile,
  SourceFileImportError,
  type MammothLike,
  type PdfjsLike,
  type SourceFileImportResult,
} from '@debatelab/core/source-file-import';

/** A file the native side picked, sent in base64 slices so no single message carries 8 MB. */
export interface SourceFileJob {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks: number;
}

export type SourceFileOutcome =
  | { ok: true; result: SourceFileImportResult }
  | { ok: false; code: SourceFileImportError['code'] | 'timeout' | 'cancelled'; fileType?: SourceFileImportError['fileType']; message: string };

interface Props {
  job: SourceFileJob | null;
  readChunk: (id: string, index: number) => Promise<string>;
  onDone: (id: string, outcome: SourceFileOutcome) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

function decodeBase64(chunk: string): Uint8Array {
  const binary = atob(chunk);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// pdf.js runs its worker code on this page's thread: the webview has no worker URL to give it.
// Imported statically: Expo cannot export a DOM component that splits into chunks,
// and this page only loads while a file is being read.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

const readers = {
  loadPdfjs: async () => pdfjs as unknown as PdfjsLike,
  loadMammoth: async () => mammoth as unknown as MammothLike,
};

/**
 * The website's Library file reader (packages/core/src/source-file-import.ts,
 * with pdf.js and mammoth) inside an Expo DOM component, because both need a
 * browser. It draws nothing; give it a job and it answers through `onDone`.
 */
export default function SourceFileReader({ job, readChunk, onDone }: Props) {
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let bytes: Promise<ArrayBuffer> | null = null;
    // One slice at a time into one buffer the file's size, so at most one slice is in flight.
    const read = () => {
      bytes ??= (async () => {
        const out = new Uint8Array(job.size);
        let offset = 0;
        for (let index = 0; index < job.chunks; index += 1) {
          if (stopped) throw new Error('This file is no longer being read');
          const part = decodeBase64(await readChunk(job.id, index));
          const fits = part.subarray(0, Math.max(0, job.size - offset));
          out.set(fits, offset);
          offset += fits.length;
        }
        return offset === job.size ? out.buffer : out.slice(0, offset).buffer;
      })();
      return bytes;
    };
    importSourceFile(
      {
        name: job.name,
        size: job.size,
        type: job.type,
        text: async () => new TextDecoder().decode(await read()),
        bytes: read,
      },
      readers,
    )
      .then((result) => (stopped ? undefined : onDone(job.id, { ok: true, result })))
      .catch((error: unknown) => {
        if (stopped) return undefined;
        const outcome: SourceFileOutcome = error instanceof SourceFileImportError
          ? { ok: false, code: error.code, fileType: error.fileType, message: error.message }
          : { ok: false, code: 'parse-failed', message: error instanceof Error ? error.message : String(error) };
        return onDone(job.id, outcome);
      });
    // A replaced or closed job stops reading and answers nothing.
    return () => {
      stopped = true;
    };
    // A job runs once; its id names it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);
  return null;
}
