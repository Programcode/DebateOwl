import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClockAnnouncer, CLOCK_TONE_TEXT, clockTone } from '@/components/features/practice/RoundClock';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';
import { playSignal } from '@/lib/timer-signals';
import { BUILT_IN_FORMATS, formatDuration, isBuiltInFormatId, type RoundSegment } from '@/lib/free-tools/formats';
import {
  clockFace,
  cueBetween,
  elapsedMs,
  goToSegment,
  initialRoundState,
  isPrepRunning,
  isSpeechRunning,
  prepRemainingMs,
  resetPrep,
  resetSpeech,
  segmentStatus,
  settlePrep,
  togglePrep,
  toggleSpeech,
  type PrepSide,
} from '@/lib/free-tools/round-timer';
import { cn } from '@/lib/utils';
import { formatFor, initialSession, searchForChoice, storeSession, type FormatChoice, type TimerSession } from './timer-session';

const SIDE_TONE: Record<RoundSegment['side'], string> = {
  a: 'bg-sky-600 dark:bg-sky-400',
  b: 'bg-rose-600 dark:bg-rose-400',
  both: 'bg-slate-500 dark:bg-slate-400',
};

/** The fewest equal rows of at most `max` chips, as columns: 7 at 4 a row is 4 + 3, never 4 + 2 + 1. */
const balancedColumns = (count: number, max: number) => Math.ceil(count / Math.ceil(count / max));

// At most 4 speech chips a row on phones, 6 from sm and 8 from md (an iPad shows a whole school round).
const chipColumns = (count: number) => ({
  '--chips': balancedColumns(count, 4),
  '--chips-sm': balancedColumns(count, 6),
  '--chips-md': balancedColumns(count, 8),
}) as CSSProperties;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName);
}

/** The protected and open stretches of a speech, with a marker for where the speaker is. */
function PoiStrip({ segment, elapsed }: { segment: RoundSegment; elapsed: number }) {
  const { t } = useTranslation('tools');
  if (!segment.poi) return null;
  const total = segment.seconds;
  const opens = (segment.poi.opensAt / total) * 100;
  const closes = (segment.poi.closesAt / total) * 100;
  const position = Math.min(100, (elapsed / 1000 / total) * 100);
  return (
    <div className="w-full max-w-xl" aria-hidden="true">
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 bg-emerald-500/70 dark:bg-emerald-400/60" style={{ left: `${opens}%`, width: `${closes - opens}%` }} />
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground transition-[left] duration-200 ease-linear motion-reduce:transition-none" style={{ left: `${position}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>0:00</span>
        <span>{t('timer.poiWindow', { from: formatDuration(segment.poi.opensAt), to: formatDuration(segment.poi.closesAt) })}</span>
        <span>{formatDuration(total)}</span>
      </div>
    </div>
  );
}

interface DebateTimerProps {
  /** localStorage key for the round, so the tool page and an embed keep separate rounds. */
  storageKey: string;
  /** A chrome-less timer for iframes: no format picker, no share link. */
  embedded?: boolean;
  /** Called once, the first time a speech starts. */
  onFirstStart?: (formatId: string) => void;
  /** Extra controls under the clock (the custom format editor's toggle, say). */
  footer?: (session: TimerSession, setChoice: (choice: FormatChoice) => void) => ReactNode;
}

export function DebateTimer({ storageKey, embedded = false, onFirstStart, footer }: DebateTimerProps) {
  const { t } = useTranslation('tools');
  const [session, setSession] = useState<TimerSession>(() => initialSession(storageKey));
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [poiMessage, setPoiMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const startedOnce = useRef(false);

  const format = formatFor(session.choice);
  const { round, muted } = session;
  const segment = format.segments[round.segmentIndex] ?? format.segments[0];
  const speechRunning = isSpeechRunning(round);
  const prepRunning = isPrepRunning(round, 'a') || isPrepRunning(round, 'b');
  const elapsed = elapsedMs(round.speech, now);
  const status = segmentStatus(segment, elapsed, format.graceSeconds);
  const face = clockFace(status.remainingMs);
  const secondsLeft = Math.max(0, Math.ceil(status.remainingMs / 1000));
  const tone = status.overtime ? 'over' : clockTone(secondsLeft);

  useEffect(() => { storeSession(storageKey, session); }, [storageKey, session]);
  useScreenWakeLock(speechRunning || prepRunning);

  // A running clock re-renders four times a second against the wall clock.
  useEffect(() => {
    setNow(Date.now());
    if (!speechRunning && !prepRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [speechRunning, prepRunning]);

  // Cues fire on crossings, so a reload mid-speech does not replay the ones already passed.
  const lastTick = useRef({ segmentId: segment.id, formatId: format.id, elapsed });
  useEffect(() => {
    const previous = lastTick.current;
    lastTick.current = { segmentId: segment.id, formatId: format.id, elapsed };
    if (!speechRunning || previous.segmentId !== segment.id || previous.formatId !== format.id) return;
    const cue = cueBetween(segment, previous.elapsed, elapsed);
    if (cue && !muted) void playSignal(cue);
    if (cue === 'double-beep') navigator.vibrate?.([200, 100, 200]);
  }, [elapsed, segment, format.id, speechRunning, muted]);

  // An exhausted prep bank stops at zero with the time-up signal.
  useEffect(() => {
    if (!prepRunning) return;
    const settled = settlePrep(round, now);
    if (settled === round) return;
    if (!muted) void playSignal('double-beep');
    setSession((current) => ({ ...current, round: settlePrep(current.round, Date.now()) }));
  }, [now, prepRunning, round, muted]);

  const poiState = speechRunning ? status.poi : null;
  useEffect(() => {
    if (poiState === 'open') setPoiMessage(t('timer.poiAnnounceOpen'));
    else if (poiState === 'protected' && elapsed > 0) setPoiMessage(t('timer.poiAnnounceProtected'));
  }, [poiState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const update = useCallback((change: (current: TimerSession) => TimerSession) => setSession(change), []);

  const toggle = useCallback(() => {
    update((current) => {
      const next = { ...current, round: toggleSpeech(current.round, Date.now()) };
      if (!startedOnce.current && isSpeechRunning(next.round)) {
        startedOnce.current = true;
        onFirstStart?.(current.choice.id);
      }
      return next;
    });
  }, [update, onFirstStart]);
  const reset = useCallback(() => update((current) => ({ ...current, round: resetSpeech(current.round) })), [update]);
  const go = useCallback((delta: number) => update((current) => {
    const currentFormat = formatFor(current.choice);
    return { ...current, round: goToSegment(current.round, currentFormat, current.round.segmentIndex + delta, Date.now()) };
  }), [update]);
  const select = (index: number) => update((current) => ({ ...current, round: goToSegment(current.round, formatFor(current.choice), index, Date.now()) }));
  const prep = (side: PrepSide) => update((current) => ({ ...current, round: togglePrep(current.round, side, Date.now()) }));

  const setChoice = useCallback((choice: FormatChoice) => {
    setSession((current) => ({ ...current, choice, round: initialRoundState(formatFor(choice)) }));
    if (!embedded) window.history.replaceState(window.history.state, '', `${window.location.pathname}${searchForChoice(choice)}${window.location.hash}`);
  }, [embedded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      // On the tool page the timer sits in a long article: keys act only once the timer has focus,
      // so Space still scrolls the page. The embed is nothing but the timer.
      if (!embedded && !(event.target instanceof Node && sectionRef.current?.contains(event.target))) return;
      switch (event.code) {
        case 'Space':
          // A focused button answers Space itself.
          if (isActivatable(event.target)) return;
          event.preventDefault();
          toggle();
          break;
        case 'KeyR':
          // A stray key never wipes a running speech; pause first.
          if (!speechRunning) reset();
          break;
        case 'ArrowRight':
          go(1);
          break;
        case 'ArrowLeft':
          go(-1);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, reset, go, speechRunning, embedded]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen?.().catch((): undefined => undefined);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${searchForChoice(session.choice)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('timer.copyLinkPrompt'), url);
    }
  };

  const sideName = segment.side === 'both' ? t('timer.bothSides') : format.sideNames[segment.side === 'a' ? 0 : 1];
  const stateLabel = status.overtime
    ? (status.inGrace ? t('timer.grace') : t('timer.overtime'))
    : speechRunning ? t('timer.running') : elapsed > 0 ? t('timer.paused') : t('timer.ready');

  return (
    <section
      ref={sectionRef}
      // Clicking anywhere in the timer focuses it, which turns its keyboard shortcuts on.
      tabIndex={-1}
      aria-label={t('timer.region', { format: format.name })}
      className={cn('rounded-2xl border border-border bg-card text-card-foreground focus:outline-hidden', embedded ? 'border-0 bg-transparent' : 'shadow-sm')}
    >
      {!embedded && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('timer.format')}
            <select
              className="h-10 min-w-56 rounded-md border border-input bg-background px-3 text-base"
              value={session.choice.id}
              onChange={(event) => {
                const value = event.target.value;
                if (isBuiltInFormatId(value)) setChoice({ id: value });
              }}
            >
              {BUILT_IN_FORMATS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              {session.choice.id === 'custom' && <option value="custom">{format.name}</option>}
            </select>
          </label>
          <Button variant="outline" onClick={copyLink} className="h-10">
            {copied ? t('timer.linkCopied') : t('timer.copyLink')}
          </Button>
        </div>
      )}

      <nav aria-label={t('timer.speeches')} className="px-4 pt-4">
        {/* Every speech in view, in rows of equal length: 8 speeches are 4 + 4 on a phone and one row from md. */}
        <ol
          className="grid grid-cols-[repeat(var(--chips),minmax(0,1fr))] gap-2 pb-2 sm:grid-cols-[repeat(var(--chips-sm),minmax(0,1fr))] md:grid-cols-[repeat(var(--chips-md),minmax(0,1fr))]"
          style={chipColumns(format.segments.length)}
        >
          {format.segments.map((entry, index) => (
            <li key={entry.id} className="min-w-0">
              <button
                type="button"
                onClick={() => select(index)}
                aria-current={index === round.segmentIndex ? 'step' : undefined}
                title={entry.label}
                className={cn(
                  'flex min-h-11 w-full flex-col items-center justify-center rounded-md border px-1.5 py-1 text-sm leading-tight transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  index === round.segmentIndex ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
                )}
              >
                <span className="flex max-w-full items-center gap-1.5">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', SIDE_TONE[entry.side])} aria-hidden="true" />
                  <span className="truncate font-medium">{entry.short}</span>
                </span>
                <span className={cn('text-xs tabular-nums', index === round.segmentIndex ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{formatDuration(entry.seconds)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div
        ref={panelRef}
        className={cn('flex flex-col items-center gap-4 px-4 py-6 text-center', fullscreen && 'h-screen justify-center bg-background')}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn('h-2.5 w-2.5 rounded-full', SIDE_TONE[segment.side])} aria-hidden="true" />
            {sideName}
          </span>
          <h2 className={cn('font-semibold tracking-tight', fullscreen ? 'text-4xl' : 'text-xl')}>{segment.label}</h2>
        </div>

        <span
          role="timer"
          aria-label={t('timer.clockLabel')}
          className={cn(
            'font-mono font-bold tabular-nums leading-none tracking-[-0.04em] transition-colors duration-300',
            CLOCK_TONE_TEXT[tone],
            fullscreen ? 'text-[min(30vw,45vh)]' : embedded ? 'text-7xl sm:text-8xl' : 'text-7xl sm:text-9xl',
          )}
        >
          {face.text}
        </span>
        <ClockAnnouncer secondsLeft={secondsLeft} running={speechRunning || status.overtime} />
        <span className="sr-only" role="status" aria-live="polite">{poiMessage}</span>

        <div className="flex min-h-8 flex-wrap items-center justify-center gap-2 text-sm font-medium">
          <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">{stateLabel}</span>
          {status.poi && !status.overtime && (
            <span
              data-poi={status.poi}
              className={cn(
                'rounded-full px-3 py-1',
                status.poi === 'open'
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-200'
                  : 'bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200',
              )}
            >
              {status.poi === 'open' ? t('timer.poiOpen') : t('timer.protected')}
            </span>
          )}
          {segment.kind === 'reply' && <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">{t('timer.noPoiInReply')}</span>}
        </div>

        <PoiStrip segment={segment} elapsed={elapsed} />

        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => go(-1)} disabled={round.segmentIndex === 0} aria-label={t('timer.previous')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button size="lg" className="h-14 min-w-36 text-lg" onClick={toggle} variant={speechRunning ? 'secondary' : 'default'}>
            {speechRunning ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
            {speechRunning ? t('timer.pause') : t('timer.start')}
          </Button>
          <Button variant="outline" size="icon" className="h-12 w-12" onClick={reset} aria-label={t('timer.reset')}>
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => go(1)} disabled={round.segmentIndex === format.segments.length - 1} aria-label={t('timer.next')}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => update((current) => ({ ...current, muted: !current.muted }))} aria-pressed={muted}>
            {muted ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
            {muted ? t('timer.soundOff') : t('timer.soundOn')}
          </Button>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="mr-2 h-4 w-4" /> : <Maximize className="mr-2 h-4 w-4" />}
            {fullscreen ? t('timer.exitFullscreen') : t('timer.fullscreen')}
          </Button>
        </div>

        {format.prepSeconds > 0 && (
          <div className="grid w-full max-w-xl grid-cols-2 gap-3" role="group" aria-label={t('timer.prepGroup')}>
            {(['a', 'b'] as const).map((side) => {
              const left = prepRemainingMs(round, side, now);
              const running = isPrepRunning(round, side);
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => prep(side)}
                  disabled={left === 0}
                  aria-pressed={running}
                  className={cn(
                    'flex flex-col items-center rounded-lg border p-3 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    running ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted',
                  )}
                >
                  <span className="text-sm text-muted-foreground">{t('timer.prepFor', { side: format.sideNames[side === 'a' ? 0 : 1] })}</span>
                  <span className={cn('text-2xl font-semibold tabular-nums', left === 0 && 'text-destructive')}>{clockFace(left).text}</span>
                  <span className="text-xs font-medium">{left === 0 ? t('timer.prepUsed') : running ? t('timer.pausePrep') : t('timer.startPrep')}</span>
                </button>
              );
            })}
          </div>
        )}
        {format.prepSeconds > 0 && (
          <Button variant="link" size="sm" onClick={() => update((current) => ({ ...current, round: resetPrep(current.round, formatFor(current.choice)) }))}>
            {t('timer.resetPrep')}
          </Button>
        )}

        <p className="text-xs text-muted-foreground pointer-coarse:hidden">{t('timer.keyboardHint')}</p>
      </div>
      {footer?.(session, setChoice)}
    </section>
  );
}
