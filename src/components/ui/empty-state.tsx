import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Owl, type OwlPose } from '@/components/brand/Owl';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** The tool's icon, shown as a badge on the owl. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A short muted line above the title, such as a status code. */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** The next step as an element, such as a router link inside a Button. Wins over actionLabel. */
  action?: ReactNode;
  /** The owl's pose; it points at the action by default. */
  pose?: OwlPose;
  /** Heading level, so the title fits the page outline (h1 when it is the page, h2 under a page h1). */
  headingLevel?: 'h1' | 'h2' | 'h3';
  /**
   * `compact` is a small owl and no badge, for a panel beside a form that is already the next
   * step. `compact-below-lg` is compact on phones and iPads, where the panel stacks under the
   * form, and regular beside it on desktop.
   */
  size?: 'regular' | 'compact' | 'compact-below-lg';
  className?: string;
}

/** Nothing here yet: the owl with the tool's icon badge, one line on what goes here, and the next step. */
export function EmptyState({
  icon: Icon, title, description, eyebrow, actionLabel, onAction, action, pose = 'point',
  headingLevel: Heading = 'h2', size = 'regular', className,
}: EmptyStateProps) {
  const compact = size === 'compact';
  const responsive = size === 'compact-below-lg';
  const next = action ?? (actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null);
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-card/60 px-6 text-center motion-safe:animate-in fade-in-0 duration-300',
        compact ? 'py-6' : responsive ? 'py-6 lg:py-10' : 'py-10',
        className,
      )}
    >
      <div className={cn('relative', compact ? 'mb-3' : responsive ? 'mb-3 lg:mb-4' : 'mb-4')}>
        {/* Decorative, so a second owl for the other size costs nothing to assistive tech. */}
        {(compact || responsive) && <Owl pose={pose} size={56} className={cn(responsive && 'lg:hidden')} />}
        {!compact && <Owl pose={pose} size={112} className={cn(responsive && 'hidden lg:inline-block')} />}
        {Icon && !compact && (
          <span
            className={cn(
              'absolute -bottom-1 -right-2 h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-brand-tint text-primary shadow-sm',
              responsive ? 'hidden lg:flex' : 'flex',
            )}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {eyebrow && <p className="mb-1 font-display text-sm font-[600] tracking-[0.08em] text-muted-foreground">{eyebrow}</p>}
      <Heading
        className={cn(
          'text-balance font-display font-[600] leading-tight text-heading',
          compact ? 'text-lg' : responsive ? 'text-lg lg:text-xl' : Heading === 'h1' ? 'text-2xl sm:text-3xl' : 'text-xl',
        )}
      >
        {title}
      </Heading>
      {description && <p className="mt-1.5 max-w-sm text-balance text-sm text-muted-foreground">{description}</p>}
      {next && <div className="mt-5">{next}</div>}
    </div>
  );
}
