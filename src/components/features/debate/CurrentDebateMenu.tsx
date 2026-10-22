import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatRelativeDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useDebateCounts } from './CurrentDebateStrip';
import { navSectionFor } from '@/components/layout/nav-sections';

/**
 * Header control for the Current Debate: a link to the debate dashboard, active on
 * the dashboard and every tool route, plus a separate chevron that opens the debate
 * actions. Desktop shows only the label; the mobile row also shows the motion.
 */
export function CurrentDebateMenu({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const debate = useCurrentDebate();
  const oneOff = useDebateStore((state) => state.oneOff);
  const openDialog = useDebateStore((state) => state.openDialog);
  const setOneOff = useDebateStore((state) => state.setOneOff);
  const counts = useDebateCounts(debate?.id);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = navSectionFor(pathname, Boolean(debate)) === 'debate';

  const itemClass = cn(
    'flex min-w-0 items-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  );

  if (!debate) {
    return (
      <button
        type="button"
        className={cn(itemClass, 'px-2', variant === 'desktop' && 'xl:px-3 whitespace-nowrap', variant === 'mobile' && 'w-full')}
        onClick={() => openDialog('create')}
        data-testid={`current-debate-${variant}`}
      >
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
      <PopoverAnchor asChild>
        <div className={cn('flex min-w-0 items-center', variant === 'mobile' && 'w-full')}>
          <Link
            to="/app/debate"
            aria-current={pathname === '/app/debate' ? 'page' : undefined}
            className={cn(itemClass, 'rounded-r-none pl-2 pr-1.5', variant === 'desktop' && 'xl:pl-3 whitespace-nowrap', variant === 'mobile' && 'flex-1')}
          >
            <span className="shrink-0">{t('nav.currentDebate', 'Current debate')}</span>
            {variant === 'mobile' && <span className="min-w-0 flex-1 truncate text-left font-normal text-muted-foreground">{debate.motion}</span>}
          </Link>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(itemClass, 'shrink-0 justify-center rounded-l-none px-1.5 pointer-coarse:min-w-11')}
              aria-label={t('debate.menuAria', { motion: debate.motion, defaultValue: 'Current debate: {{motion}}' })}
              data-testid={`current-debate-${variant}`}
            >
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
        <div className="space-y-1">
          <p className="break-words font-semibold leading-snug">{debate.motion}</p>
          <p className="text-xs text-muted-foreground">
            {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('debate.counts', { sources: counts.sources, active: counts.activeSources, outputs: counts.outputs, defaultValue: '{{sources}} sources ({{active}} active) · {{outputs}} outputs' })}
          </p>
          {oneOff && <p className="text-xs font-medium text-primary">{t('debate.oneOffActive', 'One-off mode is on')}</p>}
        </div>
        <div className="grid gap-1">
          <Button variant="ghost" className="justify-start" onClick={() => act(() => { navigate('/app/debate'); })}>{t('debate.open', 'Open debate')}</Button>
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
