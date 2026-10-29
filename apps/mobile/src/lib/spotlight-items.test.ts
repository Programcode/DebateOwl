import { describe, expect, it } from 'vitest';

import { SPOTLIGHT_LIMIT, spotlightWorkItems } from './spotlight-items';

const label = (kind: string) => `kind:${kind}`;

describe('spotlightWorkItems', () => {
  it('indexes documents with their route, title and motion, newest first', () => {
    const items = spotlightWorkItems(
      [
        { id: 'a1', kind: 'attack', title: 'Attack on the cost', createdAt: 1 },
        { id: 'c1', kind: 'case', title: 'Main case', createdAt: 2 },
      ],
      'This house would tax sugar',
      label,
    );
    expect(items).toEqual([
      { url: 'debatelab://case/c1', title: 'Main case', description: 'This house would tax sugar', keywords: ['kind:case'] },
      { url: 'debatelab://attack/a1', title: 'Attack on the cost', description: 'This house would tax sugar', keywords: ['kind:attack'] },
    ]);
  });

  it('leaves out work with no document screen and ids that do not belong in a URL', () => {
    const items = spotlightWorkItems(
      [
        { id: 'x1', kind: 'chat', title: 'A chat' },
        { id: 'x2', kind: 'sparring', title: 'A round' },
        { id: '../you', kind: 'case', title: 'Sneaky' },
        { id: 'b1?x=1', kind: 'brainstorm', title: 'Query' },
        { id: 'f1', kind: 'factoids', title: 'Facts' },
      ],
      'Motion',
      label,
    );
    expect(items.map((item) => item.url)).toEqual(['debatelab://factoids/f1']);
  });

  it('lists a document once when it shows under both sides, and names an untitled one by its kind', () => {
    const items = spotlightWorkItems(
      [
        { id: 'c1', kind: 'case', title: '  ' },
        { id: 'c1', kind: 'case', title: '  ' },
      ],
      '',
      label,
    );
    expect(items).toEqual([{ url: 'debatelab://case/c1', title: 'kind:case', description: undefined, keywords: ['kind:case'] }]);
  });

  it('keeps the newest work only', () => {
    const work = Array.from({ length: SPOTLIGHT_LIMIT + 5 }, (_, index) => ({ id: `c${index}`, kind: 'case', title: `Case ${index}`, createdAt: index }));
    const items = spotlightWorkItems(work, 'Motion', label);
    expect(items).toHaveLength(SPOTLIGHT_LIMIT);
    expect(items[0].url).toBe(`debatelab://case/c${SPOTLIGHT_LIMIT + 4}`);
  });
});
