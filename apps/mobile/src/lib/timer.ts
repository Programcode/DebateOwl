/**
 * The debate timer, as the website's free round timer
 * (src/components/free-tools/DebateTimer.tsx and timer-session.ts): the same
 * formats, speeches, prep banks, points of information and custom formats,
 * from @debatelab/core/free-tools. A speech counts up and runs into overtime;
 * prep banks count down and stop at zero. Every clock is a timestamp, never a
 * count of ticks, so it is right after the app comes back from the background
 * or is opened again.
 */
import { customToRoundFormat, parseCustomFormat, type CustomFormat } from '@debatelab/core/free-tools/custom-format';
import { FORMATS, isBuiltInFormatId, type BuiltInFormatId, type RoundFormat, type RoundSegment } from '@debatelab/core/free-tools/formats';
import {
  elapsedMs,
  goToSegment,
  initialRoundState,
  isPrepRunning,
  isSpeechRunning,
  parseRoundState,
  prepRemainingMs,
  segmentStatus,
  togglePrep,
  toggleSpeech,
  type PrepSide,
  type RoundState,
  type TimerCue,
} from '@debatelab/core/free-tools/round-timer';

export type TimerSignal = TimerCue;

/** A built-in format, or a custom one; `savedId` names the saved custom format it came from, if any. */
export type FormatChoice = { id: BuiltInFormatId } | { id: 'custom'; custom: CustomFormat; savedId?: string };

export interface TimerSession {
  choice: FormatChoice;
  round: RoundState;
  muted: boolean;
  /**
   * The prep bank last paused while it ran, with time left, while no clock
   * runs: the clock the student just stopped, which the Lock Screen keeps
   * showing so its Resume restarts it. Kept in step by `settleHeld`.
   */
  held?: PrepSide | null;
}

/** A custom format the student saved on this device. */
export interface SavedFormat {
  id: string;
  format: CustomFormat;
}

/** DebateOwl's own school format opens first, as the app's timer always has. */
export const DEFAULT_FORMAT: BuiltInFormatId = 'school';
export const MAX_SAVED_FORMATS = 20;

// The website's in-app timer translates these format names; the free timer's other names are proper names.
const FORMAT_NAME_KEYS: Partial<Record<BuiltInFormatId, string>> = {
  school: 'timer.formatStandard',
  pf: 'timer.formatPF',
  ld: 'timer.formatLD',
  policy: 'timer.formatPolicy',
};

export function formatNameKey(id: BuiltInFormatId): string | undefined {
  return FORMAT_NAME_KEYS[id];
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A format's name: the in-app timer's translated names where the website has them, else its own. */
export function formatName(choice: FormatChoice, format: RoundFormat, t: Translate): string {
  if (choice.id === 'custom') return choice.custom.name;
  const key = formatNameKey(choice.id);
  return key ? t(key) : format.name;
}

/** A side's name: the format's own (Government, Team A), translated for custom formats. */
export function sideNameFor(choice: FormatChoice, format: RoundFormat, side: RoundSegment['side'], t: Translate): string {
  if (side === 'both') return t('timer.bothSides', { ns: 'tools' });
  if (choice.id === 'custom') return t(side === 'a' ? 'custom.sideA' : 'custom.sideB', { ns: 'tools' });
  return format.sideNames[side === 'a' ? 0 : 1];
}

export function formatFor(choice: FormatChoice): RoundFormat {
  return choice.id === 'custom' ? customToRoundFormat(choice.custom) : FORMATS[choice.id];
}

export function initialSession(choice: FormatChoice = { id: DEFAULT_FORMAT }, muted = false): TimerSession {
  return { choice, round: initialRoundState(formatFor(choice)), muted };
}

/** What is kept on the device: the round's timestamps, so a running speech keeps running while the timer is closed. */
export function serializeSession(session: TimerSession): unknown {
  const { choice } = session;
  return {
    v: 1,
    format: choice.id,
    ...(choice.id === 'custom' ? { custom: choice.custom, ...(choice.savedId ? { savedId: choice.savedId } : {}) } : {}),
    round: session.round,
    muted: session.muted,
    ...(session.held ? { held: session.held } : {}),
  };
}

/** A stored session read back, or null when it does not fit (an old version, a format that changed). */
export function parseSession(value: unknown): TimerSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const { v, format, custom, savedId, round, muted, held } = value as Record<string, unknown>;
  if (v !== 1) return null;
  let choice: FormatChoice | null = null;
  if (format === 'custom') {
    const parsed = parseCustomFormat(custom);
    if (parsed) choice = { id: 'custom', custom: parsed, ...(typeof savedId === 'string' ? { savedId } : {}) };
  } else if (typeof format === 'string' && isBuiltInFormatId(format)) {
    choice = { id: format };
  }
  if (!choice) return null;
  const parsedRound = parseRoundState(round, formatFor(choice));
  if (!parsedRound) return null;
  return { choice, round: parsedRound, muted: muted === true, ...(held === 'a' || held === 'b' ? { held } : {}) };
}

/** Saved custom formats read back; anything malformed is dropped, the rest kept. */
export function parseSavedFormats(value: unknown): SavedFormat[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const saved: SavedFormat[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, format } = entry as Record<string, unknown>;
    const parsed = parseCustomFormat(format);
    if (typeof id !== 'string' || !id || seen.has(id) || !parsed) continue;
    seen.add(id);
    saved.push({ id, format: parsed });
    if (saved.length === MAX_SAVED_FORMATS) break;
  }
  return saved;
}

/** Adds or replaces a saved format, newest first, keeping at most MAX_SAVED_FORMATS. */
export function upsertSavedFormat(list: readonly SavedFormat[], entry: SavedFormat): SavedFormat[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX_SAVED_FORMATS);
}

/** True when anything is on the clock or a speech has time on it, so closing the timer would leave something behind. */
export function isActive(round: RoundState): boolean {
  return isSpeechRunning(round) || isPrepRunning(round, 'a') || isPrepRunning(round, 'b');
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Text the lock screen shows, in the app's language: the layouts cannot reach i18n. */
export interface TimerActivityLabels {
  speaking: string;
  paused: string;
  overtime: string;
  prep: string;
  idleTitle: string;
  idleLine: string;
  /** The Live Activity's buttons. */
  pause: string;
  resume: string;
  next: string;
}

/**
 * What a Live Activity and the lock-screen widget show: one clock, as times,
 * so iOS can draw it counting without the app. A speech's clock is its limit
 * counting down from `startedAt` to `endsAt` (pinned at `pausedAt` when
 * paused); after `endsAt` it reads as overtime. Prep counts its bank down.
 */
export interface TimerActivityState {
  kind: 'speech' | 'prep';
  /** "PM", "1AC", or the side whose prep runs. */
  title: string;
  /** The speech's full name and side, or "Prep". */
  line: string;
  /** When this clock would have started had it run without stopping, in epoch ms. */
  startedAt: number;
  endsAt: number;
  /** Set while paused: the moment the clock stands at. */
  pausedAt: number | null;
  /** Side colour: `a`, `b` or `both`. */
  side: RoundSegment['side'];
  labels: TimerActivityLabels;
  /**
   * Pause or Resume, and Next speech, on the Lock Screen and in the Dynamic
   * Island. iOS runs a Live Activity's buttons from iOS 17, so the app turns
   * them off before that (the layout cannot ask which iOS it runs on).
   */
  controls: boolean;
  /** A later speech exists to move on to (never while prep runs). */
  canAdvance: boolean;
}

/**
 * The Live Activity for a session at `now`, or null when no clock has time on
 * it (a fresh speech with no prep running), so the activity ends. A running
 * prep bank wins over a paused speech, because that is what is on the clock.
 */
export function timerActivityState(
  session: TimerSession,
  now: number,
  text: { sideName: (side: RoundSegment['side']) => string; prepLine: (side: PrepSide) => string; labels: TimerActivityLabels; controls?: boolean },
): TimerActivityState | null {
  const controls = text.controls === true;
  const format = formatFor(session.choice);
  const { round } = session;
  for (const side of ['a', 'b'] as PrepSide[]) {
    if (!isPrepRunning(round, side)) continue;
    const left = prepRemainingMs(round, side, now);
    const total = format.prepSeconds * 1000;
    return {
      kind: 'prep',
      title: text.labels.prep,
      line: text.prepLine(side),
      startedAt: now - (total - left),
      endsAt: now + left,
      pausedAt: null,
      side,
      labels: text.labels,
      controls,
      canAdvance: false,
    };
  }
  // The bank the student just paused stays on the Lock Screen, paused, until another clock starts.
  const held = !isSpeechRunning(round) ? session.held : null;
  if (held && round.prep[held].remainingMs > 0) {
    const left = prepRemainingMs(round, held, now);
    const total = format.prepSeconds * 1000;
    return {
      kind: 'prep',
      title: text.labels.prep,
      line: text.prepLine(held),
      startedAt: now - (total - left),
      endsAt: now + left,
      pausedAt: now,
      side: held,
      labels: text.labels,
      controls,
      canAdvance: false,
    };
  }
  const segment = format.segments[round.segmentIndex] ?? format.segments[0];
  const elapsed = elapsedMs(round.speech, now);
  const running = isSpeechRunning(round);
  if (!running && elapsed === 0) return null;
  const startedAt = now - elapsed;
  return {
    kind: 'speech',
    title: segment.short,
    line: `${segment.label} · ${text.sideName(segment.side)}`,
    startedAt,
    endsAt: startedAt + segment.seconds * 1000,
    pausedAt: running ? null : now,
    side: segment.side,
    labels: text.labels,
    controls,
    canAdvance: round.segmentIndex < format.segments.length - 1,
  };
}

const runningPrep = (round: RoundState): PrepSide | null => (['a', 'b'] as PrepSide[]).find((side) => isPrepRunning(round, side)) ?? null;

/**
 * `next` with `held` brought up to date after a change from `previous`: set
 * when a running prep bank stopped with time left and nothing else started,
 * cleared when any clock runs, the format changes or the held bank is empty.
 * Every change goes through it (timer-store.ts's updateSession), so the timer
 * screen's buttons and the Lock Screen's keep it the same way.
 */
export function settleHeld(previous: TimerSession, next: TimerSession): TimerSession {
  const { round } = next;
  let held: PrepSide | null;
  if (isActive(round) || next.choice !== previous.choice) held = null;
  else held = runningPrep(previous.round) ?? previous.held ?? null;
  if (held && round.prep[held].remainingMs <= 0) held = null;
  if ((next.held ?? null) === held) return next;
  const settled: TimerSession = { ...next, held };
  if (!held) delete settled.held;
  return settled;
}

/** A button on the timer's Live Activity: Pause or Resume, or Next speech. */
export type TimerActivityAction = 'toggle' | 'next';

/**
 * What a Live Activity button does to the round, at `now`. Toggle acts on the
 * clock the activity shows: a running prep bank, else the speech. Next moves
 * to the next speech with a fresh, paused clock, as the timer screen's Next does.
 */
export function applyTimerActivityAction(session: TimerSession, action: TimerActivityAction, now: number): TimerSession {
  const { round } = session;
  if (action === 'next') {
    const next = goToSegment(round, formatFor(session.choice), round.segmentIndex + 1, now);
    return next === round ? session : settleHeld(session, { ...session, round: next });
  }
  // A running bank pauses; a bank held on the Lock Screen resumes; otherwise the speech toggles.
  const prepSide = runningPrep(round) ?? (!isSpeechRunning(round) ? session.held ?? null : null);
  return settleHeld(session, { ...session, round: prepSide ? togglePrep(round, prepSide, now) : toggleSpeech(round, now) });
}

/** When the clock on screen reaches its limit while the app is away, for the time-up alert; null when nothing will. */
export function timerAlertAt(session: TimerSession, now: number): { at: number; kind: 'speech' | 'prep'; segment: RoundSegment } | null {
  const format = formatFor(session.choice);
  const { round } = session;
  const segment = format.segments[round.segmentIndex] ?? format.segments[0];
  for (const side of ['a', 'b'] as PrepSide[]) {
    if (!isPrepRunning(round, side)) continue;
    const left = prepRemainingMs(round, side, now);
    return left > 0 ? { at: now + left, kind: 'prep', segment } : null;
  }
  if (!isSpeechRunning(round)) return null;
  const left = segment.seconds * 1000 - elapsedMs(round.speech, now);
  return left > 0 ? { at: now + left, kind: 'speech', segment } : null;
}

/** The speech's status for the screen: time left (negative in overtime), POI window and grace. */
export function speechStatus(session: TimerSession, now: number) {
  const format = formatFor(session.choice);
  const segment = format.segments[session.round.segmentIndex] ?? format.segments[0];
  const elapsed = elapsedMs(session.round.speech, now);
  return { format, segment, elapsed, ...segmentStatus(segment, elapsed, format.graceSeconds) };
}
