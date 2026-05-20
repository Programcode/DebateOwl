import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StreamingIndicatorProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
}

export function StreamingIndicator({ messages, intervalMs = 3000, className }: StreamingIndicatorProps) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [messages.length, intervalMs]);

  useEffect(() => {
    setProgress(0);
    const step = 100 / (intervalMs / 50);
    const timer = setInterval(() => {
      setProgress((prev) => Math.min(prev + step, 100));
    }, 50);
    return () => clearInterval(timer);
  }, [index, intervalMs]);

  return (
    <div className={cn('motion-swap flex flex-col items-center justify-center gap-5 py-12', className)} role="status" aria-label="Loading">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="motion-ping-ring absolute h-full w-full rounded-full border border-primary/35" />
        <span className="motion-loading-card absolute h-10 w-10 rounded-full bg-primary/10" />
        <span className="h-4 w-4 rounded-full bg-primary shadow-[0_0_24px_hsl(var(--primary)/0.55)]" />
      </div>
      <div key={index} className="motion-swap text-sm font-medium text-muted-foreground" aria-live="polite">
        {messages[index]}
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
