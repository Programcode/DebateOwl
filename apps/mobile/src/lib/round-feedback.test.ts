import { goToSegment, resetSpeech, toggleSpeech } from '@debatelab/core/free-tools/round-timer';
import { describe, expect, it } from 'vitest';

import { RoundFeedback } from './round-feedback';
import { formatFor, initialSession, type TimerSession } from './timer';

const start = 1_000_000;
const fresh = () => initialSession({ id: 'custom', custom: {
  name: 'Club', prepSeconds: 0,
  segments: [
    { label: 'Opening', seconds: 60, kind: 'speech', side: 'a', poi: false },
    { label: 'Reply', seconds: 60, kind: 'speech', side: 'b', poi: false },
  ],
} });
const run = (session: TimerSession, now: number) => ({ ...session, round: toggleSpeech(session.round, now) });

function lastSpeech(ledger: RoundFeedback) {
  let session = run(fresh(), start);
  ledger.observe(session, start);
  // The root observer sees the change even while the timer screen is closed.
  session = { ...session, round: goToSegment(session.round, formatFor(session.choice), 1, start + 70_000) };
  ledger.observe(session, start + 70_000);
  session = run(session, start + 75_000);
  ledger.observe(session, start + 75_000);
  return session;
}

describe('round animation feedback', () => {
  it('counts actual timed speeches including overtime, never prep or idle gaps, and celebrates once', () => {
    const ledger = new RoundFeedback();
    const session = lastSpeech(ledger);
    expect(ledger.takeCompletion(session, start + 134_999)).toBeNull();
    expect(ledger.takeCompletion(session, start + 135_000)).toEqual({ speeches: 2, seconds: 130 });
    expect(ledger.takeCompletion(session, start + 140_000)).toBeNull();
    const paused = run(session, start + 140_000);
    ledger.observe(paused, start + 140_000);
    expect(ledger.takeCompletion(run(paused, start + 150_000), start + 151_000)).toBeNull();
  });

  it('rearms after reset and forgets the old round on a format change', () => {
    const ledger = new RoundFeedback();
    let session = lastSpeech(ledger);
    expect(ledger.takeCompletion(session, start + 135_000)).not.toBeNull();
    session = { ...session, round: resetSpeech(session.round) };
    ledger.observe(session, start + 140_000);
    session = run(session, start + 145_000);
    expect(ledger.takeCompletion(session, start + 205_000)).toEqual({ speeches: 2, seconds: 130 });
    session = run(fresh(), start + 210_000);
    ledger.observe(session, start + 210_000);
    session = { ...session, round: goToSegment(session.round, formatFor(session.choice), 1, start + 210_000) };
    ledger.observe(session, start + 210_000);
    session = run(session, start + 211_000);
    expect(ledger.takeCompletion(session, start + 271_000)).toEqual({ speeches: 1, seconds: 60 });
  });
});
