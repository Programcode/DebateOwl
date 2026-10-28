import { describe, expect, it } from 'vitest';

import { CUSTOM_LIMITS, parseCustomFormat } from './custom-format';

const speech = { label: 'Opening', seconds: 300, kind: 'speech', side: 'a', poi: true };

describe('parseCustomFormat', () => {
  it('cleans text and drops a POI flag on questions', () => {
    const parsed = parseCustomFormat({
      name: '  Club\u0007 night ',
      prepSeconds: 60,
      segments: [speech, { ...speech, label: 'Questions', kind: 'cross-examination', side: 'both' }],
    });
    expect(parsed?.name).toBe('Club night');
    expect(parsed?.segments[1]).toEqual({ label: 'Questions', seconds: 300, kind: 'cross-examination', side: 'both', poi: false });
  });

  it('refuses a format outside the limits a shared link is held to', () => {
    expect(parseCustomFormat({ name: 'x', prepSeconds: 0, segments: [] })).toBeNull();
    expect(parseCustomFormat({ name: 'x', prepSeconds: 0, segments: [{ ...speech, seconds: 5 }] })).toBeNull();
    expect(parseCustomFormat({ name: 'x', prepSeconds: CUSTOM_LIMITS.maxPrepSeconds + 1, segments: [speech] })).toBeNull();
    expect(parseCustomFormat({ name: 'x', prepSeconds: 0, segments: [{ ...speech, label: '   ' }] })).toBeNull();
    expect(parseCustomFormat({ name: 'x', prepSeconds: 0, segments: Array(CUSTOM_LIMITS.segments + 1).fill(speech) })).toBeNull();
  });
});
