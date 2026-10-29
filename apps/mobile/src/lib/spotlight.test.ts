import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const removals: (() => void)[] = [];
const native = {
  removeAllItemsFromDomain: vi.fn((domain: string) => {
    calls.push(`remove ${domain}`);
    // Each domain removal waits until the test lets it finish, like iOS answering later.
    return new Promise<void>((resolve) => removals.push(resolve));
  }),
  removeAllItems: vi.fn(async () => {
    calls.push('remove all');
  }),
  indexItems: vi.fn(async (items: { title: string }[]) => {
    calls.push(`index ${items.map((item) => item.title).join(',')}`);
  }),
};

vi.mock('expo', () => ({ requireOptionalNativeModule: () => native }));
vi.mock('./native-capabilities', () => ({ nativeCapabilities: () => ({ spotlight: true }) }));

import { clearSpotlight, clearSpotlightDomain, indexForSpotlight } from './spotlight';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const item = (title: string) => ({ url: `debatelab://case/${title}` as const, title });

describe('spotlight', () => {
  beforeEach(() => {
    calls.length = 0;
    removals.length = 0;
  });

  it('never indexes an account’s documents again after sign-out cleared them mid-index', async () => {
    const indexing = indexForSpotlight('work', [item('A-case')]);
    await flush();
    expect(calls).toEqual(['remove com.pistack.debateowl.work']);
    const cleared = clearSpotlight();
    removals.shift()?.();
    await indexing;
    await cleared;
    expect(calls).toEqual(['remove com.pistack.debateowl.work', 'remove all']);
  });

  it('drops indexing still queued behind a debate switch, and keeps indexing asked for after it', async () => {
    const first = indexForSpotlight('work', [item('old')]);
    const switched = clearSpotlightDomain('work');
    const second = indexForSpotlight('work', [item('new')]);
    await flush();
    // The first index was dropped before touching iOS; the switch's removal runs, then the new debate's.
    removals.shift()?.();
    await first;
    await switched;
    await flush();
    removals.shift()?.();
    await second;
    expect(calls).toEqual(['remove com.pistack.debateowl.work', 'remove com.pistack.debateowl.work', 'index new']);
  });
});
