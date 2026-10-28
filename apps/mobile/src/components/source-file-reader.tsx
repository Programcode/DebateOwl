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

/** A file the native side picked, sent in base64 chunks so no single message carries 8 MB. */
export interface SourceFileJob {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks: number;
}

export type SourceFileOutcome =
  | { ok: true; result: SourceFileImportResult }
  | { ok: false; code: SourceFileImportError['code']; fileType?: SourceFileImportError['fileType']; message: string };

interface Props {
  job: SourceFileJob | null;
  readChunk: (id: string, index: number) => Promise<string>;
  onDone: (id: string, outcome: SourceFileOutcome) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

function decodeBase64(chunks: string[]): ArrayBuffer {
  const parts = chunks.map((chunk) => {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  });
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
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
    let bytes: Promise<ArrayBuffer> | null = null;
    const read = () => {
      bytes ??= Promise.all(Array.from({ length: job.chunks }, (_, index) => readChunk(job.id, index))).then(decodeBase64);
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
      .then((result) => onDone(job.id, { ok: true, result }))
      .catch((error: unknown) => {
        const outcome: SourceFileOutcome = error instanceof SourceFileImportError
          ? { ok: false, code: error.code, fileType: error.fileType, message: error.message }
          : { ok: false, code: 'parse-failed', message: error instanceof Error ? error.message : String(error) };
        return onDone(job.id, outcome);
      });
    // A job runs once; its id names it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);
  return null;
}
