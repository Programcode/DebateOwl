import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Owl, type OwlPose } from '@/components/brand/Owl';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** The owl's pose; it points at the action by default. */
  pose?: OwlPose;
  /** Heading level, so the title fits the page outline (h2 under a page h1). */
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

/** Nothing here yet: the owl with the tool's icon badge, one line on what goes here, and the next step. */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, pose = 'point', headingLevel: Heading = 'h2', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-card/60 px-6 py-10 text-center animate-in fade-in-0 duration-300', className)}>
      <div className="relative mb-4">
        <Owl pose={pose} size={112} />
        <span className="absolute -bottom-1 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-brand-tint text-primary shadow-sm" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <Heading className="font-display text-xl font-[600] leading-tight text-heading">{title}</Heading>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
