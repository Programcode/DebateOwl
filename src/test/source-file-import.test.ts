import { describe, expect, it } from 'vitest';
import { importSourceFile, SourceFileImportError } from '@/lib/source-file-import';

describe('source file import', () => {
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

  it('rejects unsupported files with a typed error', async () => {
    const file = new File(['not an image that should import'], 'image.png', { type: 'image/png' });

    await expect(importSourceFile(file)).rejects.toMatchObject({
      code: 'unsupported',
      name: 'SourceFileImportError',
    } satisfies Partial<SourceFileImportError>);
  });
});
