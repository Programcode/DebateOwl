import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface StreamingIndicatorProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
}

// Guard against 0/negative/NaN intervals causing a runaway timer.
const MIN_INTERVAL_MS = 200;

export function StreamingIndicator({ messages, intervalMs = 3000, className }: StreamingIndicatorProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const safeIntervalMs = Number.isFinite(intervalMs) ? Math.max(intervalMs, MIN_INTERVAL_MS) : MIN_INTERVAL_MS;

  useEffect(() => {
    if (messages.length === 0) return;
    setIndex((current) => Math.min(current, messages.length - 1));
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const interval = setInterval(() => {
      setFading(true);
      const timeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
        setFading(false);
        timeouts.delete(timeout);
      }, 200);
      timeouts.add(timeout);
    }, safeIntervalMs);
    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
    };
  }, [messages.length, safeIntervalMs]);

  useEffect(() => {
    setProgress(0);
    const step = 100 / (safeIntervalMs / 50);
    const timer = setInterval(() => {
      setProgress((prev) => Math.min(prev + step, 100));
    }, 50);
    return () => clearInterval(timer);
  }, [index, safeIntervalMs]);

  return (
    <div className={cn('motion-swap flex flex-col items-center justify-center gap-5 py-12', className)} role="status" aria-label={t('common.loading')}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="motion-ping-ring absolute h-full w-full rounded-full border border-primary/35" />
        <span className="absolute h-10 w-10 rounded-full bg-primary/10" />
        <span className="h-4 w-4 rounded-full bg-primary shadow-[0_0_24px_hsl(var(--primary)/0.55)]" />
      </div>
      <div key={index} className={cn('text-sm font-medium text-muted-foreground transition-opacity duration-200', fading ? 'opacity-0' : 'opacity-100')} aria-live="polite">
        {messages[index] ?? ''}
      </div>
      <div className="motion-shimmer h-1.5 w-56 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full bg-primary/60 rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
