import { cueBetween, elapsedMs, isSpeechRunning, settlePrep } from '@debatelab/core/free-tools/round-timer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import { syncTimerActivity } from '@/lib/live-activity';
import { formatFor, isActive, sideNameFor, timerActivityState, type TimerSession } from '@/lib/timer';
import { useTimerAlerts } from '@/lib/timer-alerts';
import { useTimerSignals } from '@/lib/timer-signals';
import { loadTimer, updateSession, useTimerStore } from '@/lib/timer-store';

const TICK_MS = 250;
/** iOS runs a Live Activity's buttons from iOS 17; before that they would draw and do nothing. */
const LIVE_ACTIVITY_BUTTONS = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 17;
/** A longer gap between readings means the app was in the background. */
const GAP_MS = 2_000;
/** How long the signals stay after the last clock stops, so a time-up signal plays to its end. */
const LINGER_MS = 3_000;

/**
 * Runs the timer from the root layout, so a speech keeps its signals while
 * the student reads a case and the Lock Screen keeps its clock after the
 * timer closes. It draws nothing. The signals mount only while a clock runs
 * (and a moment after, so time up plays out), so opening the app never
 * touches the audio session.
 */
export function TimerRunner() {
  const { t, i18n } = useTranslation();
  const { loaded, session } = useTimerStore();
  const format = useMemo(() => formatFor(session.choice), [session.choice]);

  useEffect(() => {
    void loadTimer();
  }, []);

  // The Lock Screen follows every change of the round, and the language.
  useEffect(() => {
    if (!loaded) return;
    const tools = (key: string, options?: Record<string, unknown>) => t(key, { ns: 'tools', ...options });
    const sideName = (side: 'a' | 'b' | 'both') => sideNameFor(session.choice, format, side, t);
    const idle = { idleTitle: t('mobile.timer.widgetTitle'), idleLine: t('mobile.timer.widgetIdle') };
    const state = timerActivityState(session, Date.now(), {
      sideName,
      prepLine: (side) => tools('timer.prepFor', { side: sideName(side) }),
      labels: {
        speaking: tools('timer.running'),
        paused: tools('timer.paused'),
        overtime: tools('timer.overtime'),
        prep: tools('timer.prepGroup'),
        pause: tools('timer.pause'),
        resume: t('mobile.liveActivity.resume'),
        next: t('mobile.liveActivity.next'),
        ...idle,
      },
      controls: LIVE_ACTIVITY_BUTTONS,
    });
    syncTimerActivity(state, idle);
  }, [format, i18n.language, loaded, session, t]);

  // A clock that runs out while the phone is locked still says so (timer-alerts.ts).
  useTimerAlerts(session, loaded);

  const active = loaded && isActive(session.round);
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (active) {
      setLingering(true);
      return;
    }
    const timer = setTimeout(() => setLingering(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active || lingering ? <ClockSignals session={session} /> : null;
}

/**
 * Cues as a speech crosses its marks (a knock when points of information
 * open or close, a beep at one minute left, two at time), and an exhausted
 * prep bank stopping at zero with the time-up signal.
 */
function ClockSignals({ session }: { session: TimerSession }) {
  const signal = useTimerSignals();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const format = useMemo(() => formatFor(session.choice), [session.choice]);
  const segment = format.segments[session.round.segmentIndex] ?? format.segments[0];
  const segmentKey = `${format.id}:${format.name}:${session.round.segmentIndex}`;
  const elapsed = elapsedMs(session.round.speech, now);
  // Cues sound on crossings, so reopening the app mid-speech does not replay the ones already passed.
  // After a gap in the background only time up sounds, as the app's timer always did.
  const last = useRef<{ key: string; elapsed: number; at: number } | null>(null);
  useEffect(() => {
    const previous = last.current;
    last.current = { key: segmentKey, elapsed, at: now };
    if (!previous || previous.key !== segmentKey || !isSpeechRunning(session.round)) return;
    const cue = cueBetween(segment, previous.elapsed, elapsed);
    if (!cue || (now - previous.at > GAP_MS && cue !== 'double-beep')) return;
    signal(cue, !session.muted);
  }, [elapsed, now, segment, segmentKey, session.muted, session.round, signal]);

  useEffect(() => {
    if (settlePrep(session.round, now) === session.round) return;
    signal('double-beep', !session.muted);
    updateSession((current) => ({ ...current, round: settlePrep(current.round, Date.now()) }));
  }, [now, session.muted, session.round, signal]);

  return null;
}
