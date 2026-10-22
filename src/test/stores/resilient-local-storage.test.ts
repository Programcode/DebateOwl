import { describe, expect, it } from 'vitest';
import { resilientSetItem, withoutBulkyLists, withoutSourceText } from '@/lib/stores/resilient-local-storage';

const saved = JSON.stringify({
  state: {
    sourceLibrary: [{ id: 'src-1', title: 'Buses', content: 'a very long article' }],
    savedCases: [{ id: 'case-1', data: { contentions: ['cost'] } }],
    generateForm: { motion: 'Free buses' },
    generateResult: { title: 'Open case' },
  },
  version: 1,
});

describe('resilient local storage', () => {
  it('removes source text before it removes saved lists', () => {
    const stripped = withoutSourceText(saved);
    expect(stripped).toContain('"title":"Buses"');
    expect(stripped).not.toContain('a very long article');
    expect(stripped).toContain('Free buses');

    const emptied = withoutBulkyLists(saved)!;
    const parsed = JSON.parse(emptied) as { state: Record<string, unknown> };
    expect(parsed.state.sourceLibrary).toBeUndefined();
    expect(parsed.state.savedCases).toBeUndefined();
    expect(parsed.state.generateForm).toEqual({ motion: 'Free buses' });
    expect(parsed.state.generateResult).toEqual({ title: 'Open case' });
  });

  it('retries a quota failure and does not throw when every copy is still too big', () => {
    const writes: string[] = [];
    const storage = {
      setItem: (key: string, value: string) => {
        writes.push(value);
        if (value.includes('a very long article') || value.includes('savedCases')) {
          throw new DOMException('quota', 'QuotaExceededError');
        }
      },
    };
    resilientSetItem(storage, 'debate-trainer-storage', saved);
    expect(writes).toHaveLength(3);
    expect(writes[1]).not.toContain('a very long article');
    expect(writes[2]).not.toContain('savedCases');
    expect(writes[2]).toContain('Free buses');

    const alwaysFull = {
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };
    expect(() => resilientSetItem(alwaysFull, 'debate-trainer-storage', saved)).not.toThrow();
  });

  it('still throws errors that are not a full disk', () => {
    const storage = { setItem: () => { throw new Error('blocked'); } };
    expect(() => resilientSetItem(storage, 'debate-trainer-storage', saved)).toThrow('blocked');
  });
});
