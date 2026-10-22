/**
 * The free round timer's state, as pure functions of wall-clock time so a
 * running round survives a reload. A speech counts up from zero and keeps
 * counting past its limit (overtime); prep banks are the in-app countdown
 * clocks from timer-clock.ts and stop at zero.
 */
import { pauseClock, remainingMs, startClock, type ClockState } from '@/lib/timer-clock';
import type { RoundFormat, RoundSegment } from './formats';

export interface Stopwatch {
  /** Milliseconds counted before the current run. */
  elapsedMs: number;
  /** When the current run began, while running. */
  startedAt: number | null;
}

export type PrepSide = 'a' | 'b';

export interface RoundState {
  segmentIndex: number;
  speech: Stopwatch;
  prep: Record<PrepSide, ClockState>;
}

export function elapsedMs(watch: Stopwatch, now: number): number {
  return watch.startedAt === null ? watch.elapsedMs : watch.elapsedMs + Math.max(0, now - watch.startedAt);
}

const stoppedAt = (watch: Stopwatch, now: number): Stopwatch => ({ elapsedMs: elapsedMs(watch, now), startedAt: null });
const PAUSED: Stopwatch = { elapsedMs: 0, startedAt: null };

export function initialRoundState(format: RoundFormat): RoundState {
  const bank = (): ClockState => ({ remainingMs: format.prepSeconds * 1000, deadline: null });
  return { segmentIndex: 0, speech: PAUSED, prep: { a: bank(), b: bank() } };
}

export const isSpeechRunning = (state: RoundState) => state.speech.startedAt !== null;
export const isPrepRunning = (state: RoundState, side: PrepSide) => state.prep[side].deadline !== null;

function pausePrep(prep: RoundState['prep'], now: number): RoundState['prep'] {
  return { a: pauseClock(prep.a, now), b: pauseClock(prep.b, now) };
}

/** Starts or pauses the speech. A speech and prep never run together: starting one stops the other. */
export function toggleSpeech(state: RoundState, now: number): RoundState {
  if (isSpeechRunning(state)) return { ...state, speech: stoppedAt(state.speech, now) };
  return { ...state, speech: { elapsedMs: state.speech.elapsedMs, startedAt: now }, prep: pausePrep(state.prep, now) };
}

/** Starts or pauses one side's prep bank; the other side's bank and the speech pause. An empty bank stays put. */
export function togglePrep(state: RoundState, side: PrepSide, now: number): RoundState {
  if (isPrepRunning(state, side)) return { ...state, prep: { ...state.prep, [side]: pauseClock(state.prep[side], now) } };
  const prep = pausePrep(state.prep, now);
  return { ...state, speech: stoppedAt(state.speech, now), prep: { ...prep, [side]: startClock(prep[side], now) } };
}

export function prepRemainingMs(state: RoundState, side: PrepSide, now: number): number {
  return remainingMs(state.prep[side], now);
}

/** Pauses a prep bank that has run out, so a reload does not show it running at 0:00. */
export function settlePrep(state: RoundState, now: number): RoundState {
  const settled = (side: PrepSide) => (isPrepRunning(state, side) && prepRemainingMs(state, side, now) === 0
    ? { remainingMs: 0, deadline: null }
    : state.prep[side]);
  const a = settled('a');
  const b = settled('b');
  return a === state.prep.a && b === state.prep.b ? state : { ...state, prep: { a, b } };
}

/** Moves to another segment with a fresh, paused speech clock. Prep banks carry over. */
export function goToSegment(state: RoundState, format: RoundFormat, index: number, now: number): RoundState {
  const segmentIndex = Math.min(Math.max(0, index), format.segments.length - 1);
  return { segmentIndex, speech: PAUSED, prep: pausePrep(state.prep, now) };
}

export function resetSpeech(state: RoundState): RoundState {
  return { ...state, speech: PAUSED };
}

/** Restores both prep banks to the format's full allowance. */
export function resetPrep(state: RoundState, format: RoundFormat): RoundState {
  return { ...state, prep: initialRoundState(format).prep };
}

export type PoiState = 'protected' | 'open';

export interface SegmentStatus {
  /** Milliseconds left; negative once the speaker is over time. */
  remainingMs: number;
  overtime: boolean;
  /** Over time but inside the format's grace period. */
  inGrace: boolean;
  /** Only for speeches that take points of information. */
  poi: PoiState | null;
}

export function segmentStatus(segment: RoundSegment, elapsed: number, graceSeconds = 0): SegmentStatus {
  const limit = segment.seconds * 1000;
  const remaining = limit - elapsed;
  const overtime = remaining < 0;
  const poi = segment.poi
    ? (elapsed >= segment.poi.opensAt * 1000 && elapsed < segment.poi.closesAt * 1000 ? 'open' : 'protected')
    : null;
  return { remainingMs: remaining, overtime, inGrace: overtime && -remaining <= graceSeconds * 1000, poi };
}

export type TimerCue = 'knock' | 'beep' | 'double-beep';

/**
 * The cue to sound when the clock moves from `before` to `after` elapsed
 * milliseconds: a knock when points of information open or close, a beep with
 * one minute left, a double beep at time. Marks that fall together sound once,
 * the most important first.
 */
export function cueBetween(segment: RoundSegment, before: number, after: number): TimerCue | null {
  if (after <= before) return null;
  const crossed = (seconds: number) => before < seconds * 1000 && after >= seconds * 1000;
  if (crossed(segment.seconds)) return 'double-beep';
  if (segment.poi && (crossed(segment.poi.opensAt) || crossed(segment.poi.closesAt))) return 'knock';
  if (segment.seconds > 60 && crossed(segment.seconds - 60)) return 'beep';
  return null;
}

/** "-0:12" style: overtime reads as time past the limit, counting up. */
export function clockFace(remaining: number): { text: string; overtime: boolean } {
  const overtime = remaining < 0;
  // Counting down, 0.2 s left still reads 0:01; counting up, 0.2 s over reads +0:00.
  const seconds = overtime ? Math.floor(-remaining / 1000) : Math.ceil(remaining / 1000);
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return { text: overtime ? `+${text}` : text, overtime };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isTimeOrNull = (value: unknown): value is number | null => value === null || isTime(value);

/** A stored state read back from localStorage, or null when it does not fit the format. */
export function parseRoundState(value: unknown, format: RoundFormat): RoundState | null {
  if (!isRecord(value) || !isRecord(value.speech) || !isRecord(value.prep)) return null;
  const { segmentIndex, speech, prep } = value;
  if (!Number.isInteger(segmentIndex) || Number(segmentIndex) < 0 || Number(segmentIndex) >= format.segments.length) return null;
  const { elapsedMs: counted, startedAt } = speech;
  if (!isTime(counted) || !isTimeOrNull(startedAt)) return null;
  const bank = (side: unknown): ClockState | null => {
    if (!isRecord(side)) return null;
    const { remainingMs: left, deadline } = side;
    if (!isTime(left) || !isTimeOrNull(deadline)) return null;
    return { remainingMs: Math.min(left, format.prepSeconds * 1000), deadline };
  };
  const a = bank(prep.a);
  const b = bank(prep.b);
  if (!a || !b) return null;
  return {
    segmentIndex: Number(segmentIndex),
    speech: { elapsedMs: counted, startedAt },
    prep: { a, b },
  };
}
