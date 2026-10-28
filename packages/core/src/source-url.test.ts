import { describe, expect, it } from 'vitest';
import { normalizeSourceUrl } from './source-url';

const PAGE = 'https://www.sciencemediacentre.es/en/homework-primary-school/';

describe('normalizeSourceUrl', () => {
  it('gives one key to the variants research returns for the same page', () => {
    const key = normalizeSourceUrl(PAGE);
    expect(key).toBe('sciencemediacentre.es/en/homework-primary-school');
    for (const variant of [
      'https://sciencemediacentre.es/en/homework-primary-school',
      'http://WWW.ScienceMediaCentre.es/en/homework-primary-school/#key-points',
      'https://www.sciencemediacentre.es/en/homework-primary-school?utm_source=x&utm_medium=y&fbclid=abc',
    ]) expect(normalizeSourceUrl(variant)).toBe(key);
  });

  it('keeps parameters and paths that name a different page', () => {
    expect(normalizeSourceUrl('https://example.org/article?id=1')).not.toBe(normalizeSourceUrl('https://example.org/article?id=2'));
    expect(normalizeSourceUrl('https://example.org/en/a')).not.toBe(normalizeSourceUrl('https://example.org/es/a'));
    expect(normalizeSourceUrl('https://news.example.org/a')).not.toBe(normalizeSourceUrl('https://example.org/a'));
    expect(normalizeSourceUrl('not a url')).toBeNull();
  });
});
