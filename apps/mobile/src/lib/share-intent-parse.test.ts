import { describe, expect, it } from 'vitest';

import { isReadableShareUrl, isShareIntentUrl, MAX_SHARED_TEXT, noteTitleFrom, parseSharedItem, sharedItemRoute } from './share-intent-parse';

describe('isShareIntentUrl', () => {
  it('knows the URL the share extension opens the app with, and nothing else', () => {
    expect(isShareIntentUrl('debatelab://dataUrl=debatelabShareKey?nonce=1#weburl')).toBe(true);
    expect(isShareIntentUrl('debatelab://case/abc')).toBe(false);
    expect(isShareIntentUrl('https://debateowl.com/dataUrl=x')).toBe(false);
    expect(isShareIntentUrl(null)).toBe(false);
  });
});

describe('isReadableShareUrl', () => {
  it('passes only what the extension opens, so a crafted link never reaches the native reader', () => {
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey?nonce=0F8FAD5B-D9CB-469F-A165-70867728950E#weburl')).toBe(true);
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey#text')).toBe(true);
    // No fragment: the module would force-unwrap it and crash.
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey')).toBe(false);
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey?nonce=1#')).toBe(false);
    // Files are not taken, another key reads another store entry.
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey#media')).toBe(false);
    expect(isReadableShareUrl('debatelab://dataUrl=otherKey#text')).toBe(false);
    expect(isReadableShareUrl('debatelab://dataUrl=debatelabShareKey?nonce=x#text&y')).toBe(false);
  });
});

describe('parseSharedItem', () => {
  it('reads a page shared from Safari as a link with the page title', () => {
    const value = JSON.stringify({ weburls: [{ url: 'https://example.org/report', meta: JSON.stringify({ title: 'A   long\nreport' }) }] });
    expect(parseSharedItem(value)).toEqual({ kind: 'link', url: 'https://example.org/report', title: 'A long report' });
  });

  it('treats text that is only an address as a link', () => {
    expect(parseSharedItem({ text: '  https://example.org/a?b=1  ' })).toEqual({ kind: 'link', url: 'https://example.org/a?b=1', title: undefined });
  });

  it('keeps text with an address in it as a note, titled by its first line', () => {
    const item = parseSharedItem(JSON.stringify({ text: '\n\nSugar taxes cut intake\nsee https://example.org' }));
    expect(item).toEqual({ kind: 'text', text: 'Sugar taxes cut intake\nsee https://example.org', title: 'Sugar taxes cut intake' });
  });

  it('refuses addresses that are not http or https, and what it cannot read', () => {
    expect(parseSharedItem({ weburls: [{ url: 'javascript:alert(1)' }] })).toBeNull();
    expect(parseSharedItem({ weburls: [{ url: 'file:///etc/passwd' }] })).toBeNull();
    expect(parseSharedItem('{not json')).toBeNull();
    expect(parseSharedItem({ files: [{ path: 'file:///photo.jpg' }] })).toBeNull();
    expect(parseSharedItem({ text: '   ' })).toBeNull();
    expect(parseSharedItem(42)).toBeNull();
  });

  it('turns an over-long address into nothing and cuts over-long text to the Library limit', () => {
    expect(parseSharedItem({ weburls: [{ url: `https://example.org/${'a'.repeat(3000)}` }] })).toBeNull();
    const item = parseSharedItem({ text: `Title\n${'x'.repeat(MAX_SHARED_TEXT + 10)}` });
    expect(item?.kind === 'text' && item.text.length).toBe(MAX_SHARED_TEXT);
  });

  it('keeps a page whose metadata cannot be read', () => {
    expect(parseSharedItem({ weburls: [{ url: 'https://example.org', meta: '{oops' }], meta: { title: 'Fallback' } })).toEqual({ kind: 'link', url: 'https://example.org', title: 'Fallback' });
  });
});

describe('noteTitleFrom', () => {
  it('shortens a long first line', () => {
    const title = noteTitleFrom(`${'word '.repeat(40)}\nrest`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('sharedItemRoute', () => {
  it('opens Add link for a link and New note for text, with nothing shared in the route', () => {
    expect(sharedItemRoute({ kind: 'link', url: 'https://example.org', title: 'Page' })).toEqual({ pathname: '/add-link', params: { shared: '1' } });
    expect(sharedItemRoute({ kind: 'text', text: 'Body', title: 'Body' })).toEqual({ pathname: '/new-note', params: { shared: '1' } });
  });
});
