import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import {
  importSourceFile as importSourceInput,
  SourceFileImportError,
  type SourceFileImportResult,
  type SourceFileReaders,
} from '@debatelab/core/source-file-import';

export { SourceFileImportError, type SourceFileImportResult };

async function readFileAsText(file: File) {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new SourceFileImportError('Could not read this file.', 'parse-failed'));
    reader.readAsText(file);
  });
}

async function readFileAsArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new SourceFileImportError('Could not read this file.', 'parse-failed'));
      }
    };
    reader.onerror = () => reject(new SourceFileImportError('Could not read this file.', 'parse-failed'));
    reader.readAsArrayBuffer(file);
  });
}

const readers: SourceFileReaders = {
  loadPdfjs: async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return pdfjs;
  },
  loadMammoth: () => import('mammoth'),
};

/** The shared reader (packages/core/src/source-file-import.ts) on a browser File. */
export function importSourceFile(file: File): Promise<SourceFileImportResult> {
  return importSourceInput(
    {
      name: file.name,
      size: file.size,
      type: file.type,
      text: () => readFileAsText(file),
      bytes: () => readFileAsArrayBuffer(file),
    },
    readers,
  );
}
