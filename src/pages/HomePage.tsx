import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { PRACTICE_TOOLS, PREPARE_TOOLS, ToolLink, UTILITY_TOOLS, type Tool } from '@/components/features/tools/tool-links';
import { formatRelativeDate } from '@/lib/date-format';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useDebateCounts } from '@/components/features/debate/CurrentDebateStrip';

function ToolGroup({ title, tools }: { title: string; tools: readonly Tool[] }) {
  return (
    <Card className="h-full border-border/70 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {tools.map((tool) => <ToolLink key={tool.key} tool={tool} variant="row" tourId={`mode-${tool.key}`} />)}
      </CardContent>
    </Card>
  );
}

function CurrentDebateSummary({ t }: { t: TFunction }) {
  const debate = useCurrentDebate();
  const openDialog = useDebateStore((state) => state.openDialog);
  const oneOff = useDebateStore((state) => state.oneOff);
  // Until the server answers, an empty list means "not loaded yet", not "no debate".
  const loading = useDebateStore((state) => !state.hydrated && !state.loadFailed);
  const counts = useDebateCounts(debate?.id);

  if (!debate && loading) {
    return (
      <Card className="mb-6 border-border/70 bg-card/60" data-testid="home-current-debate-loading" data-tour="current-debate" aria-busy="true">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-32 shrink-0 animate-pulse rounded-md bg-muted" aria-hidden="true" />
          <span className="sr-only" role="status">{t('debate.loadingCurrent', 'Loading your current debate…')}</span>
        </CardContent>
      </Card>
    );
  }

  if (!debate) {
    return (
      <Card className="mb-6 border-dashed border-border bg-card/60" data-testid="home-current-debate" data-tour="current-debate">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{t('debate.noCurrentTitle', 'No current debate')}</p>
            <p className="text-sm text-muted-foreground">{t('debate.noCurrentDesc', 'Start a debate to keep one motion, its sources, and your results together.')}</p>
          </div>
          <Button onClick={() => openDialog('create')}>{t('debate.startDebate', 'Start debate')}</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-primary/25 bg-primary/5" data-testid="home-current-debate" data-tour="current-debate">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('nav.currentDebate', 'Current debate')}</p>
          <p className="break-words text-lg font-semibold leading-snug">{debate.motion}</p>
          <p className="text-sm text-muted-foreground">
            {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
            {' · '}
            {t('debate.counts', { sources: counts.sources, active: counts.activeSources, outputs: counts.outputs, defaultValue: '{{sources}} sources ({{active}} active) · {{outputs}} outputs' })}
          </p>
          {oneOff && <p className="text-sm font-medium text-primary">{t('debate.oneOffActive', 'One-off mode is on')}</p>}
        </div>
        <Button asChild className="shrink-0">
          <Link to="/app/debate">{t('debate.open', 'Open debate')}<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto min-h-[72vh] max-w-5xl">
        <PageHeader title={t('home.heading', 'What are you working on?')} />

        <CurrentDebateSummary t={t} />

        <div className="grid gap-6 md:grid-cols-2">
          <ToolGroup title={t('home.prepare', 'Prepare')} tools={PREPARE_TOOLS} />
          <ToolGroup title={t('home.practice', 'Practice')} tools={PRACTICE_TOOLS} />
        </div>

        <section className="mt-8 border-t border-border pt-6" aria-labelledby="home-utilities-title">
          <h2 id="home-utilities-title" className="text-lg font-semibold tracking-tight">{t('home.utilities', 'Utilities')}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {UTILITY_TOOLS.map((tool) => <ToolLink key={tool.key} tool={tool} variant="tile" tourId={`mode-${tool.key}`} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
