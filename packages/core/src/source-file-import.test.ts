import { describe, expect, it } from 'vitest';

import { importSourceFile, MAX_SOURCE_FILE_CHARS, SourceFileImportError, type SourceFileReaders } from './source-file-import';

const noReaders: SourceFileReaders = {
  loadPdfjs: () => Promise.reject(new Error('not a PDF')),
  loadMammoth: () => Promise.reject(new Error('not a DOCX')),
};

function textFile(name: string, text: string, type = '') {
  return { name, type, size: text.length, text: async () => text, bytes: async () => new ArrayBuffer(0) };
}

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');

describe('importSourceFile', () => {
  it('refuses a file over 8 MB before reading it', async () => {
    const file = { ...textFile('big.txt', ''), size: 8_000_001, text: () => Promise.reject(new Error('read')) };
    await expect(importSourceFile(file, noReaders)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('refuses a kind the Library cannot read', async () => {
    await expect(importSourceFile(textFile('photo.png', 'x', 'image/png'), noReaders)).rejects.toBeInstanceOf(SourceFileImportError);
    await expect(importSourceFile(textFile('photo.png', 'x', 'image/png'), noReaders)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('cuts long text at the limit without splitting a surrogate pair', async () => {
    const text = `${'a'.repeat(MAX_SOURCE_FILE_CHARS - 1)}😀 and more`;
    const result = await importSourceFile(textFile('long.md', text), noReaders);
    expect(result.content).toBe('a'.repeat(MAX_SOURCE_FILE_CHARS - 1));
    expect(result.notices.map((notice) => notice.code)).toContain('truncated');
  });

  it('pretty-prints JSON, and imports broken JSON as raw text with a notice', async () => {
    const valid = await importSourceFile(textFile('data.json', `{"claims":["${words(30)}"]}`), noReaders);
    expect(valid.content.startsWith('{\n  "claims"')).toBe(true);
    expect(valid.notices).toEqual([]);
    const broken = await importSourceFile(textFile('data.json', `{"claims": ${words(30)}`), noReaders);
    expect(broken.notices[0]).toMatchObject({ code: 'invalid-json', message: 'Invalid JSON. Imported as raw text.' });
  });

  it('says when a file has no readable text', async () => {
    await expect(importSourceFile(textFile('blank.txt', ' \n\u0000 '), noReaders)).rejects.toMatchObject({ code: 'empty' });
  });

  it('reads the first 80 pages of a long PDF and says so', async () => {
    let destroyed = false;
    const readers: SourceFileReaders = {
      ...noReaders,
      loadPdfjs: async () => ({
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 120,
            getPage: async (page: number) => ({ getTextContent: async () => ({ items: [{ str: `page ${page}` }, {}] }), cleanup: () => {} }),
          }),
          destroy: async () => {
            destroyed = true;
          },
        }),
      }),
    };
    const result = await importSourceFile({ ...textFile('report.pdf', ''), type: 'application/pdf' }, readers);
    expect(result.content.split('\n\n')).toHaveLength(80);
    expect(result.notices[0]).toMatchObject({ code: 'pdf-pages', pages: 120, imported: 80 });
    expect(destroyed).toBe(true);
  });

  it('names the reader that failed', async () => {
    await expect(importSourceFile(textFile('essay.docx', ''), noReaders)).rejects.toMatchObject({ code: 'parse-failed', fileType: 'docx', message: 'Could not parse DOCX: not a DOCX' });
  });
});
