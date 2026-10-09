import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

interface ResultHeaderProps {
  title: ReactNode;
  /** One line under the title: model, time, counts. */
  meta?: ReactNode;
  /** Export, copy, discuss and practice actions, in one row. */
  actions?: ReactNode;
  /** Generate marks evidence that no researched source backs; others leave this off. */
  caveat?: ReactNode;
}

/** The same header on every tool result: what it is, what you can do with it, and how far to trust it. */
export function ResultHeader({ title, meta, actions, caveat }: ResultHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="mb-4 space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-tight tracking-[-0.014em] text-foreground">{title}</h2>
        {meta && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{caveat ?? t('tools.aiCaveat', 'AI-generated. Check facts and sources before using them in a round.')}</span>
      </p>
    </header>
  );
}
