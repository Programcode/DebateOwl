import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  /** Small label above the title, such as "Current debate". */
  eyebrow?: ReactNode;
  /** One line under the title: a description or counts. */
  meta?: ReactNode;
  /** Buttons aligned with the title on wide screens, below it on phones. */
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  titleTestId?: string;
}

/** The one page header every app page uses, so h1 size, weight and tracking match everywhere. */
export function PageHeader({ title, eyebrow, meta, actions, icon, className, titleTestId }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p>}
        <div className="flex items-center gap-3">
          {icon && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-tint text-primary shadow-[0_3px_0_var(--do-primary-tint-border)] [&_svg]:h-5 [&_svg]:w-5">{icon}</span>}
          <h1 className="min-w-0 wrap-break-word font-display text-[1.75rem] font-[600] leading-tight tracking-[-0.015em] text-heading sm:text-[2rem]" data-testid={titleTestId}>{title}</h1>
        </div>
        {/* empty:hidden: a meta component that renders nothing leaves no gap. */}
        {meta && <div className="text-sm text-muted-foreground empty:hidden">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
