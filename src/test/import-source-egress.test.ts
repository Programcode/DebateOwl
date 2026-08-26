import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../supabase/functions/import-source/index.ts', import.meta.url),
  'utf8',
);

describe('import-source egress boundary', () => {
  it('uses one fixed Exa network destination rather than fetching the user URL', () => {
    expect(source).toContain('const EXA_CONTENTS_URL = "https://api.exa.ai/contents"');

    const fetchTargets = [...source.matchAll(/\bawait\s+fetch\(([^,\n]+)/g)].map((match) => match[1].trim());
    expect(fetchTargets).toEqual(['EXA_CONTENTS_URL']);
    expect(source).not.toMatch(/await\s+fetch\(\s*(?:requestedUrl|finalUrl|currentUrl|body\.url)/);
  });

  it('keeps provider response consumption byte- and time-bounded', () => {
    expect(source).toContain('readBoundedText(response, EXA_RESPONSE_BYTES, FETCH_TIMEOUT_MS)');
  });
});
