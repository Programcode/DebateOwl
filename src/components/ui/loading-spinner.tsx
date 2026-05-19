// src/components/ui/loading-spinner.tsx
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', sizeClasses[size], className)}>
      <span className="motion-ping-ring absolute inset-0 rounded-full border border-current opacity-40" />
      <span className="absolute inset-0 rounded-full border border-current opacity-20" />
      <span className="h-full w-full animate-spin rounded-full border-2 border-current border-t-transparent text-primary" />
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Processing...' }: LoadingOverlayProps) {
  return (
    <div className="motion-swap absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/80 backdrop-blur-sm">
      <div className="motion-loading-card">
        <LoadingSpinner size="lg" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="motion-loading-bar h-full rounded-full bg-primary" />
      </div>
    </div>
  );
}
