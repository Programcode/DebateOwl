import { describe, expect, it } from 'vitest';

import { attachCitations, parseInline, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('reads the coach answer shape: lead paragraph, bold lead-ins in a list, citation markers', () => {
    const blocks = parseMarkdown('Concede the edge case.\n\n1. **Exemptions exist.** Real bans permit carers. [1]\n2. **Flip it.** Same nurse.\n\n- one\n  continued');
    expect(blocks).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: 'Concede the edge case.' }] },
      {
        type: 'list', ordered: true, start: 1, items: [
          [{ type: 'bold', children: [{ type: 'text', text: 'Exemptions exist.' }] }, { type: 'text', text: ' Real bans permit carers. ' }, { type: 'cite', n: 1 }],
          [{ type: 'bold', children: [{ type: 'text', text: 'Flip it.' }] }, { type: 'text', text: ' Same nurse.' }],
        ],
      },
      { type: 'list', ordered: false, start: 1, items: [[{ type: 'text', text: 'one continued' }]] },
    ]);
  });

  it('renders an unfinished bold run as bold while the answer streams', () => {
    expect(parseInline('Night **buses follow')).toEqual([
      { type: 'text', text: 'Night ' },
      { type: 'bold', children: [{ type: 'text', text: 'buses follow' }] },
    ]);
  });

  it('keeps an unfinished code fence and does not treat snake_case or 2 * 3 as italics', () => {
    expect(parseMarkdown('```\nconst a = 1')).toEqual([{ type: 'code', text: 'const a = 1' }]);
    expect(parseInline('use snake_case_names and 2 * 3 * 4')).toEqual([{ type: 'text', text: 'use snake_case_names and 2 * 3 * 4' }]);
  });

  it('only links http(s) URLs', () => {
    expect(parseInline('[site](https://example.org/a) [x](javascript:alert(1))')).toEqual([
      { type: 'link', text: 'site', url: 'https://example.org/a' },
      { type: 'text', text: ' [x](javascript:alert(1))' },
    ]);
  });
});

describe('attachCitations', () => {
  it('puts a citation after the block that quotes its claim, once, and skips claims it cannot find', () => {
    const blocks = parseMarkdown('Every real ban permits shift workers and carers.\n\nNothing else here.');
    const cited = attachCitations(blocks, ['Every real ban permits shift workers and carers', 'A claim the answer never makes at all']);
    expect(cited[0]).toEqual({ type: 'paragraph', inline: [{ type: 'text', text: 'Every real ban permits shift workers and carers.' }, { type: 'cite', n: 1 }] });
    expect(cited[1]).toEqual(blocks[1]);
    expect(blocks[0]).toEqual({ type: 'paragraph', inline: [{ type: 'text', text: 'Every real ban permits shift workers and carers.' }] });
  });
});
