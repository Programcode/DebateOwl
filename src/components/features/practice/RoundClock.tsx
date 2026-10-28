import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type ClockTone = 'normal' | 'warning' | 'over';

/** One urgency rule for every speaking clock: amber in the last 30 seconds, red at zero. */
// eslint-disable-next-line react-refresh/only-export-components
export function clockTone(secondsLeft: number): ClockTone {
  if (secondsLeft <= 0) return 'over';
  if (secondsLeft <= 30) return 'warning';
  return 'normal';
}

// eslint-disable-next-line react-refresh/only-export-components
export const CLOCK_TONE_TEXT: Record<ClockTone, string> = {
  normal: 'text-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  over: 'text-destructive',
};

// eslint-disable-next-line react-refresh/only-export-components
export function formatClock(secondsLeft: number) {
  const total = Math.max(0, Math.ceil(secondsLeft));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const ANNOUNCE_AT = [60, 30, 0];

/**
 * A visually hidden live region that speaks only at 1:00, 0:30 and 0:00, so a screen
 * reader isn't read every second of a running clock.
 */
export function ClockAnnouncer({ secondsLeft, running }: { secondsLeft: number; running: boolean }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const previous = useRef(secondsLeft);
  useEffect(() => {
    const before = previous.current;
    previous.current = secondsLeft;
    if (!running && secondsLeft > 0) return;
    const crossed = ANNOUNCE_AT.find((mark) => before > mark && secondsLeft <= mark);
    if (crossed === undefined) return;
    setMessage(crossed === 0
      ? t('clock.timeUp', 'Time is up.')
      : t('clock.remaining', { time: formatClock(crossed), defaultValue: '{{time}} left.' }));
  }, [running, secondsLeft, t]);
  return <span className="sr-only" role="status" aria-live="polite">{message}</span>;
}

/** The speaking clock: tabular JetBrains Mono figures, coloured by how much time is left. */
export function RoundClock({ secondsLeft, className, label }: { secondsLeft: number; className?: string; label?: string }) {
  return (
    <span
      role="timer"
      aria-label={label}
      className={cn('font-mono font-bold tabular-nums tracking-[-0.03em] transition-colors duration-300', CLOCK_TONE_TEXT[clockTone(secondsLeft)], className)}
    >
      {formatClock(secondsLeft)}
    </span>
  );
}
