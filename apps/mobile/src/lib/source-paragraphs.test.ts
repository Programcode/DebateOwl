import { expect, it } from 'vitest';

import { sourceParagraphs } from './source-paragraphs';

it('keeps every character and bounds text layout for a maximum-size import without paragraph breaks', () => {
  for (const content of ['', 'A short source', 'word '.repeat(24_000), 'x'.repeat(3999) + '🦉' + 'x'.repeat(116_000), 'First\n\nSecond\nline\n\nLast']) {
    const paragraphs = sourceParagraphs(content);
    expect(paragraphs.join('')).toBe(content);
    expect(paragraphs.every((part) => part.length <= 4000)).toBe(true);
    expect(paragraphs.every((part) => !/[\ud800-\udbff]$/.test(part))).toBe(true);
  }
});
