import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatRelativeDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useDebateCounts } from './CurrentDebateStrip';

/**
 * Header control for the Current Debate. Desktop shows only the label; the
 * mobile row also shows the motion on one truncated line.
 */
export function CurrentDebateMenu({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const debate = useCurrentDebate();
  const oneOff = useDebateStore((state) => state.oneOff);
  const openDialog = useDebateStore((state) => state.openDialog);
  const setOneOff = useDebateStore((state) => state.setOneOff);
  const counts = useDebateCounts(debate?.id);
  const [open, setOpen] = useState(false);

  const triggerClass = cn(
    'motion-press nav-glow flex min-w-0 items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    variant === 'desktop' && 'xl:px-3 whitespace-nowrap',
    variant === 'mobile' && 'w-full',
  );

  if (!debate) {
    return (
      <button type="button" className={triggerClass} onClick={() => openDialog('create')} data-testid={`current-debate-${variant}`}>
        {t('debate.startDebate', 'Start debate')}
      </button>
    );
  }

  const act = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={t('debate.menuAria', { motion: debate.motion, defaultValue: 'Current debate: {{motion}}' })}
          data-testid={`current-debate-${variant}`}
        >
          <span className="shrink-0 text-foreground">{t('nav.currentDebate', 'Current debate')}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          {variant === 'mobile' && <span className="min-w-0 flex-1 truncate text-left font-normal">{debate.motion}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
        <div className="space-y-1">
          <p className="break-words font-semibold leading-snug">{debate.motion}</p>
          <p className="text-xs text-muted-foreground">
            {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('debate.counts', { sources: counts.sources, outputs: counts.outputs, defaultValue: '{{sources}} sources · {{outputs}} outputs' })}
          </p>
          {oneOff && <p className="text-xs font-medium text-primary">{t('debate.oneOffActive', 'One-off mode is on')}</p>}
        </div>
        <div className="grid gap-1">
          <Button variant="ghost" className="justify-start" onClick={() => act(() => navigate('/app/debate'))}>{t('debate.open', 'Open debate')}</Button>
          <Button variant="ghost" className="justify-start" onClick={() => act(() => openDialog('switch'))}>{t('debate.switch', 'Switch debate')}</Button>
          <Button variant="ghost" className="justify-start" onClick={() => act(() => openDialog('create'))}>{t('debate.startNew', 'Start new debate')}</Button>
          <Button variant="ghost" className="justify-start" onClick={() => act(() => setOneOff(!oneOff))}>
            {oneOff ? t('debate.returnToDebate', 'Return to debate') : t('debate.useOneOff', 'Use one-off mode')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
