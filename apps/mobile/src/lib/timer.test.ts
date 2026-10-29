import { settlePrep, togglePrep, toggleSpeech } from '@debatelab/core/free-tools/round-timer';
import { describe, expect, it } from 'vitest';

import {
  applyTimerActivityAction,
  initialSession,
  parseSavedFormats,
  parseSession,
  serializeSession,
  settleHeld,
  timerActivityState,
  timerAlertAt,
  type TimerSession,
} from './timer';

const T0 = 1_000_000;
const text = {
  sideName: (side: string) => side,
  prepLine: (side: string) => `prep ${side}`,
  labels: { speaking: 'Speaking', paused: 'Paused', overtime: 'Over time', prep: 'Prep', idleTitle: 'Timer', idleLine: 'Idle', pause: 'Pause', resume: 'Resume', next: 'Next' },
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

describe('Live Activity buttons and the time-up alert', () => {
  it('pauses the clock the activity shows: a running prep bank before the speech', () => {
    let session = initialSession({ id: 'custom', custom });
    session = { ...session, round: toggleSpeech(session.round, T0) };
    session = { ...session, round: togglePrep(session.round, 'b', T0 + 10_000) };
    const paused = applyTimerActivityAction(session, 'toggle', T0 + 20_000);
    expect(paused.round.prep.b.deadline).toBeNull();
    expect(paused.round.speech.startedAt).toBeNull();
    // The paused bank stays on the Lock Screen, so the same button restarts it, not the speech.
    const resumed = applyTimerActivityAction(paused, 'toggle', T0 + 30_000);
    expect(resumed.round.prep.b.deadline).not.toBeNull();
    expect(resumed.round.speech).toEqual({ elapsedMs: 10_000, startedAt: null });
    // With no bank held, it resumes the speech where it stopped.
    const speech = applyTimerActivityAction({ ...paused, held: null }, 'toggle', T0 + 30_000);
    expect(speech.round.speech).toEqual({ elapsedMs: 10_000, startedAt: T0 + 30_000 });
  });

  it('keeps a prep bank paused from the Lock Screen on it, so Resume restarts that prep', () => {
    let session = initialSession({ id: 'custom', custom });
    session = { ...session, round: togglePrep(session.round, 'b', T0) };
    const paused = applyTimerActivityAction(session, 'toggle', T0 + 30_000);
    const shown = timerActivityState(paused, T0 + 40_000, { ...text, controls: true });
    expect(shown).toMatchObject({ kind: 'prep', side: 'b', pausedAt: T0 + 40_000, endsAt: T0 + 40_000 + 90_000 });
    const resumed = applyTimerActivityAction(paused, 'toggle', T0 + 50_000);
    expect(resumed.round.prep.b.deadline).toBe(T0 + 50_000 + 90_000);
    expect(resumed.round.speech.startedAt).toBeNull();
  });

  it('lets go of a paused bank once another clock starts, it runs out, or the format changes', () => {
    let session = initialSession({ id: 'custom', custom });
    session = { ...session, round: togglePrep(session.round, 'a', T0) };
    const paused = applyTimerActivityAction(session, 'toggle', T0 + 10_000);
    expect(paused.held).toBe('a');
    expect(settleHeld(paused, { ...paused, round: toggleSpeech(paused.round, T0 + 20_000) }).held).toBeUndefined();
    expect(settleHeld(paused, { ...paused, choice: { id: 'bp' }, round: initialSession({ id: 'bp' }).round }).held).toBeUndefined();
    const emptied = { ...session, round: settlePrep(session.round, T0 + 121_000) };
    expect(settleHeld(session, emptied).held).toBeUndefined();
    // Stored and read back with the round.
    expect(parseSession(JSON.parse(JSON.stringify(serializeSession(paused))))?.held).toBe('a');
  });

  it('moves on to a fresh, paused next speech, and not past the last one', () => {
    let session = initialSession({ id: 'custom', custom });
    expect(applyTimerActivityAction(session, 'next', T0)).toBe(session);
    session = initialSession({ id: 'bp' });
    session = { ...session, round: toggleSpeech(session.round, T0) };
    const next = applyTimerActivityAction(session, 'next', T0 + 5_000);
    expect(next.round.segmentIndex).toBe(1);
    expect(next.round.speech).toEqual({ elapsedMs: 0, startedAt: null });
    expect(timerActivityState(next, T0 + 5_000, { ...text, controls: true })).toBeNull();
  });

  it('alerts at the limit of the running clock, and never for a paused or finished one', () => {
    let session = initialSession({ id: 'custom', custom });
    expect(timerAlertAt(session, T0)).toBeNull();
    session = { ...session, round: toggleSpeech(session.round, T0) };
    expect(timerAlertAt(session, T0 + 60_000)).toMatchObject({ at: T0 + 300_000, kind: 'speech' });
    expect(timerAlertAt(session, T0 + 301_000)).toBeNull();
    session = { ...session, round: togglePrep(session.round, 'a', T0 + 1_000) };
    expect(timerAlertAt(session, T0 + 1_000)).toMatchObject({ at: T0 + 121_000, kind: 'prep' });
  });
});
