// src/components/ui/loading-spinner.tsx
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/** One ring on a fast linear spin; a quicker spin reads as a quicker load. */
export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <span
      className={cn('inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-primary [animation-duration:700ms]', sizeClasses[size], className)}
      aria-hidden="true"
    />
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Processing...' }: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/90">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-medium text-muted-foreground" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
