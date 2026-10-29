import { togglePrep, toggleSpeech } from '@debatelab/core/free-tools/round-timer';
import { describe, expect, it } from 'vitest';

import { initialSession, parseSavedFormats, parseSession, serializeSession, timerActivityState, type TimerSession } from './timer';

const T0 = 1_000_000;
const text = {
  sideName: (side: string) => side,
  prepLine: (side: string) => `prep ${side}`,
  labels: { speaking: 'Speaking', paused: 'Paused', overtime: 'Over time', prep: 'Prep', idleTitle: 'Timer', idleLine: 'Idle' },
};
const custom = { name: 'Club', prepSeconds: 120, segments: [{ label: 'Opening', seconds: 300, kind: 'speech' as const, side: 'a' as const, poi: true }] };

describe('stored timer session', () => {
  it('reopens a running speech where it was, with its custom format', () => {
    const running: TimerSession = { ...initialSession({ id: 'custom', custom, savedId: 'x1' }), muted: true };
    running.round = toggleSpeech(running.round, T0);
    const reopened = parseSession(JSON.parse(JSON.stringify(serializeSession(running))));
    expect(reopened).toEqual(running);
  });

  it('refuses a round that does not fit its format and a format past the limits', () => {
    const stored = serializeSession(initialSession({ id: 'bp' })) as { round: { segmentIndex: number } };
    expect(parseSession({ ...stored, round: { ...stored.round, segmentIndex: 8 } })).toBeNull();
    expect(parseSession({ ...stored, format: 'custom', custom: { ...custom, segments: [] } })).toBeNull();
    expect(parseSession({ ...stored, format: 'unknown' })).toBeNull();
  });

  it('keeps the saved formats that parse and drops the rest', () => {
    const saved = parseSavedFormats([{ id: 'a', format: custom }, { id: 'a', format: custom }, { id: 'b', format: { ...custom, prepSeconds: -1 } }, 'junk']);
    expect(saved.map((item) => item.id)).toEqual(['a']);
  });
});

describe('Live Activity clock', () => {
  it('counts a running speech down from its virtual start to its limit', () => {
    let session = initialSession({ id: 'bp' });
    expect(timerActivityState(session, T0, text)).toBeNull();
    session = { ...session, round: toggleSpeech(session.round, T0) };
    const state = timerActivityState(session, T0 + 90_000, text);
    expect(state).toMatchObject({ kind: 'speech', title: 'PM', startedAt: T0, endsAt: T0 + 7 * 60_000, pausedAt: null });
  });

  it('stands still at the paused moment, and a running prep bank takes over', () => {
    let session = initialSession({ id: 'pf' });
    session = { ...session, round: toggleSpeech(session.round, T0) };
    session = { ...session, round: toggleSpeech(session.round, T0 + 30_000) };
    expect(timerActivityState(session, T0 + 500_000, text)).toMatchObject({ startedAt: T0 + 470_000, pausedAt: T0 + 500_000, endsAt: T0 + 470_000 + 240_000 });

    session = { ...session, round: togglePrep(session.round, 'b', T0 + 600_000) };
    const prep = timerActivityState(session, T0 + 660_000, text);
    // PF prep is 3:00; a minute used leaves the bank ending two minutes on.
    expect(prep).toMatchObject({ kind: 'prep', line: 'prep b', side: 'b', endsAt: T0 + 780_000, pausedAt: null });
  });
});
