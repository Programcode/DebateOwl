import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

const MAX_FILE_BYTES = 8_000_000;
const MAX_EXTRACTED_CHARS = 120_000;

export interface SourceFileImportResult {
  title: string;
  content: string;
  type: 'file';
  origin: string;
  wordCount: number;
  fileType: 'text' | 'markdown' | 'csv' | 'json' | 'pdf' | 'docx';
  warnings: string[];
}

export class SourceFileImportError extends Error {
  constructor(message: string, public code: 'unsupported' | 'too-large' | 'empty' | 'parse-failed') {
    super(message);
    this.name = 'SourceFileImportError';
  }
}

const extensionFor = (file: File) => file.name.split('.').pop()?.toLowerCase() || '';

function detectFileType(file: File): SourceFileImportResult['fileType'] | null {
  const extension = extensionFor(file);
  const mime = file.type.toLowerCase();

  if (['txt'].includes(extension) || mime === 'text/plain') return 'text';
  if (['md', 'markdown'].includes(extension) || mime === 'text/markdown') return 'markdown';
  if (extension === 'csv' || mime === 'text/csv') return 'csv';
  if (extension === 'json' || mime === 'application/json') return 'json';
  if (extension === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    extension === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (mime.startsWith('text/')) return 'text';
  return null;
}

function cleanExtractedText(raw: string) {
  return raw
    .replace(/\r\n/g, '\n')
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

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

function finalizeImport(file: File, fileType: SourceFileImportResult['fileType'], rawContent: string, warnings: string[] = []): SourceFileImportResult {
  let content = cleanExtractedText(rawContent);
  if (!content) {
    throw new SourceFileImportError('No readable text was found in this file.', 'empty');
  }
  if (content.length > MAX_EXTRACTED_CHARS) {
    content = content.slice(0, MAX_EXTRACTED_CHARS).trim();
    warnings.push('Large file truncated to the first readable section.');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  if (wordCount < 25) {
    warnings.push('Short extraction. Review the text before saving.');
  }

  return {
    title: file.name.replace(/\.[^.]+$/, '') || file.name,
    content,
    type: 'file',
    origin: file.name,
    wordCount,
    fileType,
    warnings,
  };
}

async function readTextLikeFile(file: File, fileType: SourceFileImportResult['fileType']) {
  const text = await readFileAsText(file);
  if (fileType !== 'json') return finalizeImport(file, fileType, text);

  try {
    const parsed = JSON.parse(text) as unknown;
    return finalizeImport(file, fileType, JSON.stringify(parsed, null, 2));
  } catch {
    return finalizeImport(file, fileType, text, ['Invalid JSON. Imported as raw text.']);
  }
}

async function readDocxFile(file: File) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await readFileAsArrayBuffer(file) });
    const warnings = result.messages
      ?.map((message) => message.message)
      .filter(Boolean)
      .slice(0, 3) || [];
    return finalizeImport(file, 'docx', result.value, warnings);
  } catch (error) {
    if (error instanceof SourceFileImportError) throw error;
    throw new SourceFileImportError(
      error instanceof Error ? `Could not parse DOCX: ${error.message}` : 'Could not parse DOCX.',
      'parse-failed',
    );
  }
}

async function readPdfFile(file: File) {
  let pdfDocument: Awaited<ReturnType<(typeof import('pdfjs-dist/legacy/build/pdf.mjs'))['getDocument']>['promise']> | undefined;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    pdfDocument = await pdfjs.getDocument({
      data: new Uint8Array(await readFileAsArrayBuffer(file)),
      useWorkerFetch: false,
    }).promise;

    const pages: string[] = [];
    const maxPages = Math.min(pdfDocument.numPages, 80);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(pageText);
      page.cleanup();
    }

    const warnings = pdfDocument.numPages > maxPages
      ? [`PDF has ${pdfDocument.numPages} pages. Imported the first ${maxPages}.`]
      : [];
    return finalizeImport(file, 'pdf', pages.join('\n\n'), warnings);
  } catch (error) {
    if (error instanceof SourceFileImportError) throw error;
    throw new SourceFileImportError(
      error instanceof Error ? `Could not parse PDF: ${error.message}` : 'Could not parse PDF.',
      'parse-failed',
    );
  } finally {
    await pdfDocument?.destroy();
  }
}

export async function importSourceFile(file: File): Promise<SourceFileImportResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new SourceFileImportError('File is too large. Import files under 8 MB.', 'too-large');
  }

  const fileType = detectFileType(file);
  if (!fileType) {
    throw new SourceFileImportError('Unsupported file type. Import TXT, Markdown, CSV, JSON, PDF, or DOCX.', 'unsupported');
  }

  if (fileType === 'pdf') return readPdfFile(file);
  if (fileType === 'docx') return readDocxFile(file);
  return readTextLikeFile(file, fileType);
}
