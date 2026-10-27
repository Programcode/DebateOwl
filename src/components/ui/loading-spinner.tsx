// src/components/ui/loading-spinner.tsx
import { cn } from '@/lib/utils';
import { ThinkingDots } from '@/components/ui/button';
import { Owl, type OwlPose } from '@/components/brand/Owl';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/** The inline loading mark: three bouncing dots in the current text colour, sized to sit in a line of text. */
export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'text-[0.8rem]',
    md: 'text-base',
    lg: 'text-xl',
  };

  return <ThinkingDots className={cn('shrink-0', sizeClasses[size], className)} />;
}

interface OwlLoaderProps {
  /** Shown under the owl and announced politely. */
  message?: string;
  pose?: OwlPose;
  size?: number;
  className?: string;
}

/** A page or section waiting on the server: the owl bobbing over a status line with thinking dots. */
export function OwlLoader({ message, pose = 'idea', size = 96, className }: OwlLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center', className)}>
      <span className="owl-bob">
        <Owl pose={pose} size={size} priority breathe={false} />
      </span>
      {message ? (
        <p className="flex items-center gap-2 text-sm font-bold text-muted-foreground" role="status" aria-live="polite">
          <span>{message}</span>
          <ThinkingDots className="text-primary" />
        </p>
      ) : (
        <ThinkingDots className="text-primary" />
      )}
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Processing...' }: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/90 backdrop-blur-[2px] motion-safe:animate-in fade-in-0 duration-200">
      <OwlLoader message={message} size={72} />
    </div>
  );
}
