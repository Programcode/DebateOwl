import { describe, expect, it } from 'vitest';
import { FORMATS, BUILT_IN_FORMATS, speakingSegments } from '@/lib/free-tools/formats';
import {
  clockFace,
  cueBetween,
  elapsedMs,
  goToSegment,
  initialRoundState,
  parseRoundState,
  prepRemainingMs,
  segmentStatus,
  settlePrep,
  togglePrep,
  toggleSpeech,
} from '@/lib/free-tools/round-timer';
import { CUSTOM_LIMITS, customToRoundFormat, decodeCustomFormat, encodeCustomFormat, roundFormatToCustom } from '@/lib/free-tools/custom-format';

const S = 1000;
const MIN = 60 * S;

describe('format data', () => {
  it('matches the published speech orders and times', () => {
    const times = (id: keyof typeof FORMATS) => FORMATS[id].segments.map((segment) => segment.seconds / 60);
    expect(times('pf')).toEqual([4, 4, 3, 4, 4, 3, 3, 3, 3, 2, 2]);
    expect(times('ld')).toEqual([6, 3, 7, 3, 4, 6, 3]);
    expect(times('policy')).toEqual([8, 3, 8, 3, 8, 3, 8, 3, 5, 5, 5, 5]);
    expect(times('bp')).toEqual([7, 7, 7, 7, 7, 7, 7, 7]);
    expect(times('wsdc')).toEqual([8, 8, 8, 8, 8, 8, 4, 4]);
    expect(times('ap')).toEqual([7, 7, 7, 7, 7, 7, 4, 4]);
    expect([FORMATS.pf, FORMATS.ld, FORMATS.policy].map((format) => format.prepSeconds / 60)).toEqual([3, 4, 8]);
    // World Schools and Asian Parliamentary replies: Opposition first, no POIs.
    for (const id of ['wsdc', 'ap'] as const) {
      const replies = FORMATS[id].segments.filter((segment) => segment.kind === 'reply');
      expect(replies.map((segment) => segment.side)).toEqual(['b', 'a']);
      expect(replies.every((segment) => !segment.poi)).toBe(true);
    }
  });

  it('protects the first and last minute of every parliamentary speech', () => {
    for (const id of ['bp', 'wsdc', 'ap'] as const) {
      for (const segment of FORMATS[id].segments.filter((entry) => entry.kind === 'speech')) {
        expect(segment.poi).toEqual({ opensAt: 60, closesAt: segment.seconds - 60 });
      }
    }
    for (const id of ['pf', 'ld', 'policy', 'school'] as const) {
      expect(FORMATS[id].segments.some((segment) => segment.poi)).toBe(false);
    }
  });

  it('gives every format unique segment ids and a source unless it is DebateLab’s own', () => {
    for (const format of BUILT_IN_FORMATS) {
      expect(new Set(format.segments.map((segment) => segment.id)).size).toBe(format.segments.length);
      if (format.id !== 'school') expect(format.sources.length).toBeGreaterThan(0);
    }
    expect(speakingSegments(FORMATS.pf).map((segment) => segment.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4']);
  });
});

describe('round timer', () => {
  const bpSpeech = FORMATS.bp.segments[0];

  it('opens points of information only between 1:00 and 6:00 of a BP speech', () => {
    expect(segmentStatus(bpSpeech, 59.9 * S).poi).toBe('protected');
    expect(segmentStatus(bpSpeech, 60 * S).poi).toBe('open');
    expect(segmentStatus(bpSpeech, 5 * MIN + 59 * S).poi).toBe('open');
    expect(segmentStatus(bpSpeech, 6 * MIN).poi).toBe('protected');
    expect(segmentStatus(FORMATS.wsdc.segments[6], 2 * MIN).poi).toBeNull();
    expect(segmentStatus(FORMATS.pf.segments[0], 2 * MIN).poi).toBeNull();
  });

  it('counts overtime past the limit, inside the grace period first', () => {
    expect(segmentStatus(bpSpeech, 7 * MIN)).toMatchObject({ remainingMs: 0, overtime: false });
    expect(segmentStatus(bpSpeech, 7 * MIN + 10 * S, 15)).toMatchObject({ remainingMs: -10 * S, overtime: true, inGrace: true });
    expect(segmentStatus(bpSpeech, 7 * MIN + 16 * S, 15)).toMatchObject({ overtime: true, inGrace: false });
    expect(clockFace(-12_400)).toEqual({ text: '+0:12', overtime: true });
    expect(clockFace(200)).toEqual({ text: '0:01', overtime: false });
  });

  it('cues the POI window, the last minute and time, once each', () => {
    expect(cueBetween(bpSpeech, 59 * S, 60.1 * S)).toBe('knock');
    // 6:00 is both the POI close and one minute left: one knock, not a knock and a beep.
    expect(cueBetween(bpSpeech, 5 * MIN + 59.9 * S, 6 * MIN)).toBe('knock');
    expect(cueBetween(bpSpeech, 6 * MIN + 59 * S, 7 * MIN + 0.2 * S)).toBe('double-beep');
    expect(cueBetween(bpSpeech, 7 * MIN + S, 7 * MIN + 2 * S)).toBeNull();
    const pfConstructive = FORMATS.pf.segments[0];
    expect(cueBetween(pfConstructive, 2 * MIN + 59 * S, 3 * MIN)).toBe('beep');
    expect(cueBetween(pfConstructive, 30 * S, 31 * S)).toBeNull();
  });

  it('runs prep banks independently and never alongside the speech', () => {
    let state = initialRoundState(FORMATS.pf);
    state = toggleSpeech(state, 0);
    state = togglePrep(state, 'a', 10 * S); // speech stops at 0:10, Team A prep starts
    expect(state.speech).toEqual({ elapsedMs: 10 * S, startedAt: null });
    state = togglePrep(state, 'b', 40 * S); // A pauses with 2:30 left, B starts
    expect(prepRemainingMs(state, 'a', 100 * S)).toBe(150 * S);
    expect(prepRemainingMs(state, 'b', 100 * S)).toBe(120 * S);
    state = toggleSpeech(state, 100 * S); // B pauses with 2:00 left
    expect(prepRemainingMs(state, 'b', 500 * S)).toBe(120 * S);
    expect(elapsedMs(state.speech, 105 * S)).toBe(15 * S);
  });

  it('stops an exhausted prep bank at zero and keeps banks across speeches', () => {
    let state = togglePrep(initialRoundState(FORMATS.ld), 'b', 0);
    state = settlePrep(state, 5 * MIN);
    expect(state.prep.b).toEqual({ remainingMs: 0, deadline: null });
    expect(togglePrep(state, 'b', 6 * MIN).prep.b).toEqual({ remainingMs: 0, deadline: null });
    state = goToSegment(togglePrep(state, 'a', 0), FORMATS.ld, 3, 30 * S);
    expect(state).toMatchObject({ segmentIndex: 3, speech: { elapsedMs: 0, startedAt: null } });
    expect(prepRemainingMs(state, 'a', 10 * MIN)).toBe(210 * S);
  });

  it('keeps the running speech when navigation is already at the first or last speech', () => {
    // The arrow keys can ask for a speech past either end; that must not wipe the clock.
    const running = toggleSpeech(initialRoundState(FORMATS.pf), 0);
    expect(goToSegment(running, FORMATS.pf, -1, 30 * S)).toBe(running);
    const last = toggleSpeech(goToSegment(running, FORMATS.pf, 10, 0), 0);
    expect(last.segmentIndex).toBe(10);
    expect(goToSegment(last, FORMATS.pf, 11, 30 * S)).toBe(last);
    expect(elapsedMs(goToSegment(last, FORMATS.pf, 11, 30 * S).speech, 30 * S)).toBe(30 * S);
  });

  it('restores a stored round only when it fits the format', () => {
    const running = toggleSpeech(goToSegment(initialRoundState(FORMATS.pf), FORMATS.pf, 4, 0), 1234);
    const stored = JSON.parse(JSON.stringify(running));
    expect(parseRoundState(stored, FORMATS.pf)).toEqual(running);
    expect(parseRoundState({ ...stored, segmentIndex: 11 }, FORMATS.pf)).toBeNull();
    expect(parseRoundState({ ...stored, speech: { elapsedMs: -1, startedAt: null } }, FORMATS.pf)).toBeNull();
    expect(parseRoundState('nonsense', FORMATS.pf)).toBeNull();
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
