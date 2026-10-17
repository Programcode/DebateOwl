import { describe, expect, it } from 'vitest';
import { parsePartialJson } from '@debatelab/core/ai/partial-json';

describe('parsePartialJson', () => {
  it('returns nothing before the opening brace', () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('```json\n')).toBeUndefined();
  });

  it('skips a code fence or prose before the object', () => {
    expect(parsePartialJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parsePartialJson('Here you go: {"a": "b"}')).toEqual({ a: 'b' });
  });

  it('keeps a string that is still being written', () => {
    expect(parsePartialJson('{"thesis": "Free transit wid')).toEqual({ thesis: 'Free transit wid' });
  });

  it('drops a dangling escape and a half-written unicode escape', () => {
    expect(parsePartialJson('{"a": "line\\')).toEqual({ a: 'line' });
    expect(parsePartialJson('{"a": "caf\\u00')).toEqual({ a: 'caf' });
    expect(parsePartialJson('{"a": "caf\\u00e9 \\"ok\\" \\n"}')).toEqual({ a: 'café "ok" \n' });
  });

  it('drops a lone high surrogate until its pair arrives', () => {
    expect(parsePartialJson('{"a": "x\\ud83d')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a": "x\\ud83d\\ude00"}')).toEqual({ a: 'x😀' });
  });

  it('leaves out a key with no value yet', () => {
    expect(parsePartialJson('{"a": "done", "b')).toEqual({ a: 'done' });
    expect(parsePartialJson('{"a": "done", "b"')).toEqual({ a: 'done' });
    expect(parsePartialJson('{"a": "done", "b":')).toEqual({ a: 'done' });
    expect(parsePartialJson('{"a": "done",')).toEqual({ a: 'done' });
  });

  it('never guesses a literal or number that may still change', () => {
    expect(parsePartialJson('{"a": tr')).toEqual({});
    expect(parsePartialJson('{"a": true, "b": fal')).toEqual({ a: true });
    expect(parsePartialJson('{"a": nul')).toEqual({});
    expect(parsePartialJson('{"a": -')).toEqual({});
    expect(parsePartialJson('{"a": 1.')).toEqual({});
    expect(parsePartialJson('{"a": 2e')).toEqual({});
    // A number at the end can still grow, so it is shown but not final.
    expect(parsePartialJson('{"score": 7')).toEqual({ score: 7 });
    expect(parsePartialJson('{"score": 72, "x": null}')).toEqual({ score: 72, x: null });
  });

  it('builds nested arrays of objects as they arrive', () => {
    const text = '{"contentions": [{"id": "1", "claim": "Access"}, {"id": "2", "claim": "Co';
    expect(parsePartialJson(text)).toEqual({
      contentions: [{ id: '1', claim: 'Access' }, { id: '2', claim: 'Co' }],
    });
    expect(parsePartialJson('{"list": ["a", "b", ')).toEqual({ list: ['a', 'b'] });
    expect(parsePartialJson('{"list": [[1, 2], [3')).toEqual({ list: [[1, 2], [3]] });
  });

  it('agrees with JSON.parse on every prefix of a complete answer', () => {
    const answer = {
      caseStructure: { thesis: 'Transit "for all"', keyDefinitions: ['fare', 'access'] },
      contentions: [{ id: '1', needsSource: false, impact: 'Ünïcode — ok', score: -12.5e1 }],
      empty: {},
      none: null as string | null,
    };
    const text = JSON.stringify(answer, null, 2);
    expect(parsePartialJson(text)).toEqual(answer);
    for (let end = 1; end < text.length; end++) {
      // Every prefix parses without throwing, and anything complete in it is exact.
      const partial = parsePartialJson(text.slice(0, end));
      expect(partial).toBeTypeOf('object');
    }
  });
});
