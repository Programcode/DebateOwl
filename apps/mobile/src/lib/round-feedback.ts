import { elapsedMs } from '@debatelab/core/free-tools/round-timer';

import { formatFor, type TimerSession } from './timer';

export type RoundSummary = { speeches: number; seconds: number };

/** Decorative, app-session bookkeeping; the timer remains the sole owner of clocks. */
export class RoundFeedback {
  private previous: TimerSession | null = null;
  private times = new Map<number, number>();
  private celebrated = false;

  observe(session: TimerSession, now: number) {
    const before = this.previous;
    const { round } = session;
    const changedFormat = before && before.choice !== session.choice;
    const restarted = before && before.round.segmentIndex > 0 && round.segmentIndex === 0;
    if (changedFormat || restarted) {
      this.times.clear();
      this.celebrated = false;
    } else if (before && before.round.segmentIndex !== round.segmentIndex) {
      // The old speech's timestamp includes time spent with the screen closed.
      this.times.set(before.round.segmentIndex, elapsedMs(before.round.speech, now));
    }
    if (before && before.round.segmentIndex === round.segmentIndex && round.speech.elapsedMs === 0 && round.speech.startedAt === null && elapsedMs(before.round.speech, now) > 0) {
      this.times.delete(round.segmentIndex);
      this.celebrated = false;
    }
    this.times.set(round.segmentIndex, elapsedMs(round.speech, now));
    this.previous = session;
  }

  /** One arrival for this round, even after pause/resume, overtime or reopening the screen. */
  takeCompletion(session: TimerSession, now: number): RoundSummary | null {
    this.observe(session, now);
    const { round } = session;
    const format = formatFor(session.choice);
    const last = format.segments.length - 1;
    if (this.celebrated || round.segmentIndex !== last || elapsedMs(round.speech, now) < format.segments[last].seconds * 1000) return null;
    this.celebrated = true;
    const timed = [...this.times.values()].filter((ms) => ms > 0);
    return { speeches: timed.length, seconds: Math.round(timed.reduce((sum, ms) => sum + ms, 0) / 1000) };
  }
}

export const roundFeedback = new RoundFeedback();
