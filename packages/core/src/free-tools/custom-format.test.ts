import { describe, expect, it } from 'vitest';

import { CUSTOM_LIMITS, parseCustomFormat, customToRoundFormat, decodeCustomFormat, encodeCustomFormat, roundFormatToCustom } from './custom-format';
import { FORMATS } from './formats';

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

describe('custom formats in the URL', () => {
  it('round-trips a format through its share parameter', () => {
    const custom = roundFormatToCustom(FORMATS.wsdc);
    custom.name = 'Klub vita – őszi forduló';
    const encoded = encodeCustomFormat(custom);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCustomFormat(encoded)).toEqual(custom);
    const timer = customToRoundFormat(custom);
    expect(timer.segments[0].poi).toEqual({ opensAt: 60, closesAt: 420 });
    expect(timer.segments[6].poi).toBeUndefined();
  });

  it('rejects malformed or out-of-bounds parameters', () => {
    const encode = (wire: unknown) => btoa(JSON.stringify(wire)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const ok = { v: 1, n: 'Club', p: 120, s: [['Prop 1', 300, 's', 'a', 1]] };
    expect(decodeCustomFormat(encode(ok))).not.toBeNull();
    for (const bad of [
      { ...ok, v: 2 },
      { ...ok, p: CUSTOM_LIMITS.maxPrepSeconds + 1 },
      { ...ok, s: [] },
      { ...ok, s: Array.from({ length: CUSTOM_LIMITS.segments + 1 }, () => ok.s[0]) },
      { ...ok, s: [['Prop 1', 5, 's', 'a', 1]] },
      { ...ok, s: [['Prop 1', 300.5, 's', 'a', 1]] },
      { ...ok, s: [['   ', 300, 's', 'a', 1]] },
      { ...ok, s: [['Prop 1', 300, 'x', 'a', 1]] },
      { ...ok, s: [['Prop 1', 300, 's', 'c', 1]] },
    ]) expect(decodeCustomFormat(encode(bad))).toBeNull();
    expect(decodeCustomFormat('not base64!')).toBeNull();
    expect(decodeCustomFormat(encode(ok).repeat(200))).toBeNull();
    expect(decodeCustomFormat(null)).toBeNull();
  });

  it('cleans labels and never gives questioning periods points of information', () => {
    const encode = (wire: unknown) => btoa(JSON.stringify(wire)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = decodeCustomFormat(encode({ v: 1, n: '', p: 0, s: [[`CX\n${'x'.repeat(80)}`, 180, 'q', 'both', 1]] }));
    expect(decoded?.name).toBe('Custom format');
    expect(decoded?.segments[0].label).toHaveLength(CUSTOM_LIMITS.label);
    expect(decoded?.segments[0].label.startsWith('CX x')).toBe(true);
    expect(decoded?.segments[0].poi).toBe(false);
  });
});
