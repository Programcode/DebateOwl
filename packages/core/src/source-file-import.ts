/**
 * Reads a Library file (TXT, Markdown, CSV, JSON, PDF, DOCX) into an editable
 * source draft, as the website's Library has always done. The website passes a
 * browser File; the iOS app passes the bytes it picked, inside an Expo DOM
 * component. pdf.js and mammoth are loaded by the caller, because only the
 * caller knows how its bundler serves them.
 */

export const MAX_SOURCE_FILE_BYTES = 8_000_000;
export const MAX_SOURCE_FILE_CHARS = 120_000;
/** PDFs longer than this are imported up to here, with a notice. */
export const MAX_SOURCE_PDF_PAGES = 80;
/** Fewer words than this is a short extraction worth checking. */
const SHORT_EXTRACTION_WORDS = 25;

export type SourceFileType = 'text' | 'markdown' | 'csv' | 'json' | 'pdf' | 'docx';

/** Why a draft needs a look, with the website's English text in `message`. */
export type SourceFileNotice =
  | { code: 'truncated'; message: string }
  | { code: 'short'; message: string }
  | { code: 'invalid-json'; message: string }
  | { code: 'pdf-pages'; pages: number; imported: number; message: string }
  /** A message from mammoth about the DOCX, in English. */
  | { code: 'docx'; message: string };

export interface SourceFileImportResult {
  title: string;
  content: string;
  type: 'file';
  origin: string;
  wordCount: number;
  fileType: SourceFileType;
  /** The notices' English messages, as the website shows them. */
  warnings: string[];
  notices: SourceFileNotice[];
}

export type SourceFileImportErrorCode = 'unsupported' | 'too-large' | 'empty' | 'parse-failed';

export class SourceFileImportError extends Error {
  constructor(
    message: string,
    public code: SourceFileImportErrorCode,
    /** For a parse failure: which reader failed. */
    public fileType?: SourceFileType,
  ) {
    super(message);
    this.name = 'SourceFileImportError';
  }
}

/** The fields of a picked file the reader needs; a browser File provides them through a small wrapper. */
export interface SourceFileInput {
  name: string;
  /** Bytes. */
  size: number;
  /** MIME type, or '' when unknown. */
  type: string;
  text: () => Promise<string>;
  bytes: () => Promise<ArrayBuffer>;
}

interface PdfTextItem {
  str?: string;
}

interface PdfPage {
  getTextContent: () => Promise<{ items: Array<PdfTextItem | object> }>;
  cleanup: () => unknown;
}

interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
}

/** The part of pdf.js the reader uses. */
export interface PdfjsLike {
  getDocument: (source: { data: Uint8Array; useWorkerFetch: boolean }) => {
    promise: Promise<PdfDocument>;
    destroy: () => Promise<void>;
  };
}

/** The part of mammoth the reader uses. */
export interface MammothLike {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages?: Array<{ message?: string }> }>;
}

export interface SourceFileReaders {
  loadPdfjs: () => Promise<PdfjsLike>;
  loadMammoth: () => Promise<MammothLike>;
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';

/** The file's kind from its extension or MIME type, or null when the Library cannot read it. */
export function detectSourceFileType(file: Pick<SourceFileInput, 'name' | 'type'>): SourceFileType | null {
  const extension = extensionOf(file.name);
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

/**
 * Rejects a file before it is read: too large, or a kind the Library cannot
 * read. Returns its kind otherwise.
 */
export function checkSourceFile(file: Pick<SourceFileInput, 'name' | 'type' | 'size'>): SourceFileType {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new SourceFileImportError('File is too large. Import files under 8 MB.', 'too-large');
  }
  const fileType = detectSourceFileType(file);
  if (!fileType) {
    throw new SourceFileImportError('Unsupported file type. Import TXT, Markdown, CSV, JSON, PDF, or DOCX.', 'unsupported');
  }
  return fileType;
}

function cleanExtractedText(raw: string) {
  return raw
    .replace(/\r\n/g, '\n')
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function finalizeSourceFile(
  file: Pick<SourceFileInput, 'name'>,
  fileType: SourceFileType,
  rawContent: string,
  notices: SourceFileNotice[] = [],
): SourceFileImportResult {
  let content = cleanExtractedText(rawContent);
  if (!content) {
    throw new SourceFileImportError('No readable text was found in this file.', 'empty');
  }
  if (content.length > MAX_SOURCE_FILE_CHARS) {
    let cut = MAX_SOURCE_FILE_CHARS;
    // Never end on the first half of a surrogate pair.
    const finalCodeUnit = content.charCodeAt(cut - 1);
    if (finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) cut -= 1;
    content = content.slice(0, cut).trim();
    notices.push({ code: 'truncated', message: 'Large file truncated to the first readable section.' });
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  if (wordCount < SHORT_EXTRACTION_WORDS) {
    notices.push({ code: 'short', message: 'Short extraction. Review the text before saving.' });
  }

  return {
    title: file.name.replace(/\.[^.]+$/, '') || file.name,
    content,
    type: 'file',
    origin: file.name,
    wordCount,
    fileType,
    warnings: notices.map((notice) => notice.message),
    notices,
  };
}

async function readTextLikeFile(file: SourceFileInput, fileType: SourceFileType) {
  const text = await file.text();
  if (fileType !== 'json') return finalizeSourceFile(file, fileType, text);

  try {
    const parsed = JSON.parse(text) as unknown;
    return finalizeSourceFile(file, fileType, JSON.stringify(parsed, null, 2));
  } catch {
    return finalizeSourceFile(file, fileType, text, [{ code: 'invalid-json', message: 'Invalid JSON. Imported as raw text.' }]);
  }
}

async function readDocxFile(file: SourceFileInput, readers: SourceFileReaders) {
  try {
    const mammoth = await readers.loadMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.bytes() });
    const notices = (result.messages ?? [])
      .map((message) => message.message)
      .filter((message): message is string => Boolean(message))
      .slice(0, 3)
      .map((message): SourceFileNotice => ({ code: 'docx', message }));
    return finalizeSourceFile(file, 'docx', result.value, notices);
  } catch (error) {
    if (error instanceof SourceFileImportError) throw error;
    throw new SourceFileImportError(
      error instanceof Error ? `Could not parse DOCX: ${error.message}` : 'Could not parse DOCX.',
      'parse-failed',
      'docx',
    );
  }
}

async function readPdfFile(file: SourceFileInput, readers: SourceFileReaders) {
  let loadingTask: ReturnType<PdfjsLike['getDocument']> | undefined;
  try {
    const pdfjs = await readers.loadPdfjs();
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.bytes()),
      useWorkerFetch: false,
    });
    const pdfDocument = await loadingTask.promise;

    const pages: string[] = [];
    const maxPages = Math.min(pdfDocument.numPages, MAX_SOURCE_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ');
      pages.push(pageText);
      page.cleanup();
    }

    const notices: SourceFileNotice[] = pdfDocument.numPages > maxPages
      ? [{
        code: 'pdf-pages',
        pages: pdfDocument.numPages,
        imported: maxPages,
        message: `PDF has ${pdfDocument.numPages} pages. Imported the first ${maxPages}.`,
      }]
      : [];
    return finalizeSourceFile(file, 'pdf', pages.join('\n\n'), notices);
  } catch (error) {
    if (error instanceof SourceFileImportError) throw error;
    throw new SourceFileImportError(
      error instanceof Error ? `Could not parse PDF: ${error.message}` : 'Could not parse PDF.',
      'parse-failed',
      'pdf',
    );
  } finally {
    await loadingTask?.destroy();
  }
}

/** Checks the file, then reads it with the reader for its kind. */
export async function importSourceFile(file: SourceFileInput, readers: SourceFileReaders): Promise<SourceFileImportResult> {
  const fileType = checkSourceFile(file);
  if (fileType === 'pdf') return readPdfFile(file, readers);
  if (fileType === 'docx') return readDocxFile(file, readers);
  return readTextLikeFile(file, fileType);
}
