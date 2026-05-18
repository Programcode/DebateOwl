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
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12', className)}>
      <div className="streaming-pulse text-sm font-medium text-muted-foreground">
        {messages[index]}
      </div>
      <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <style>{`
        @keyframes streaming-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .streaming-pulse {
          animation: streaming-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
