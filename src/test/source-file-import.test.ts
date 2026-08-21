import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importSourceFile, SourceFileImportError } from '@/lib/source-file-import';

const pdfMocks = vi.hoisted(() => {
  const cleanup = vi.fn();
  const destroy = vi.fn();
  const getPage = vi.fn(async () => ({
    getTextContent: async () => ({
      items: [{ str: 'A readable PDF page with enough extracted debate evidence for testing.' }],
    }),
    cleanup,
  }));
  return { cleanup, destroy, getPage };
});

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: pdfMocks.getPage,
      destroy: pdfMocks.destroy,
    }),
  })),
}));

describe('source file import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('imports text-like files with word counts', async () => {
    const file = new File(['A concise debate brief with enough words to be useful in round prep.'], 'brief.md', {
      type: 'text/markdown',
    });

    const imported = await importSourceFile(file);

    expect(imported.title).toBe('brief');
    expect(imported.fileType).toBe('markdown');
    expect(imported.type).toBe('file');
    expect(imported.content).toContain('debate brief');
    expect(imported.wordCount).toBeGreaterThan(5);
  });

  it('formats valid JSON instead of importing one long line', async () => {
    const file = new File(['{"claim":"AI improves research","source":"study"}'], 'evidence.json', {
      type: 'application/json',
    });

    const imported = await importSourceFile(file);

    expect(imported.fileType).toBe('json');
    expect(imported.content).toContain('\n  "claim"');
  });

  it('keeps invalid JSON as raw text with a warning', async () => {
    const file = new File(['{"claim":'], 'broken.json', { type: 'application/json' });

    const imported = await importSourceFile(file);

    expect(imported.content).toBe('{"claim":');
    expect(imported.warnings).toContain('Invalid JSON. Imported as raw text.');
  });

  it('extracts PDF pages and releases page and document resources', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'evidence.pdf', { type: 'application/pdf' });

    const imported = await importSourceFile(file);

    expect(imported.fileType).toBe('pdf');
    expect(imported.content).toContain('readable PDF page');
    expect(pdfMocks.getPage).toHaveBeenCalledWith(1);
    expect(pdfMocks.cleanup).toHaveBeenCalledTimes(1);
    expect(pdfMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('removes a dangling high surrogate when truncating extracted text', async () => {
    const file = new File([
      `${'a'.repeat(119_999)}😀 remaining text`,
    ], 'long.txt', { type: 'text/plain' });

    const imported = await importSourceFile(file);

    expect(imported.content).toHaveLength(119_999);
    expect(imported.content.charCodeAt(imported.content.length - 1)).not.toBeGreaterThanOrEqual(0xD800);
    expect(imported.warnings).toContain('Large file truncated to the first readable section.');
  });

  it('rejects unsupported files with a typed error', async () => {
    const file = new File(['not an image that should import'], 'image.png', { type: 'image/png' });

    await expect(importSourceFile(file)).rejects.toMatchObject({
      code: 'unsupported',
      name: 'SourceFileImportError',
    } satisfies Partial<SourceFileImportError>);
  });
});
