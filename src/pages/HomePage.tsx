import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Clock,
  Crosshair,
  Database,
  Dumbbell,
  GitBranch,
  Lightbulb,
  MessageCircle,
  Sparkles,
  Swords,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRoutePrefetch } from '@/hooks/use-route-prefetch';
import { cn } from '@/lib/utils';
import { formatRelativeDate } from '@/lib/date-format';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useDebateCounts } from '@/components/features/debate/CurrentDebateStrip';

type Tool = {
  key: string;
  href: string;
  icon: LucideIcon;
};

const prepareTools = [
  { key: 'generate', href: '/app/generate', icon: Sparkles },
  { key: 'brainstorm', href: '/app/brainstorm', icon: Lightbulb },
  { key: 'factoids', href: '/app/factoids', icon: BookOpen },
  { key: 'flowchart', href: '/app/flowchart', icon: GitBranch },
] satisfies readonly Tool[];

const practiceTools = [
  { key: 'attack', href: '/app/attack', icon: Swords },
  { key: 'ask', href: '/app/ask', icon: MessageCircle },
  { key: 'crossfire', href: '/app/crossfire', icon: Crosshair },
  { key: 'sparring', href: '/app/sparring', icon: Dumbbell },
] satisfies readonly Tool[];

const utilityTools = [
  { key: 'library', href: '/app/library', icon: Database },
  { key: 'timer', href: '/app/timer', icon: Timer },
  { key: 'history', href: '/app/history', icon: Clock },
] satisfies readonly Tool[];

function ToolRow({ tool, t }: { tool: Tool; t: TFunction }) {
  const Icon = tool.icon;
  const prefetchHandlers = useRoutePrefetch(tool.href);
  return (
    <Link
      to={tool.href}
      {...prefetchHandlers}
      data-tour={`mode-${tool.key}`}
      className="motion-press group flex items-center gap-3 rounded-md border-b border-border/60 px-3 py-3 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{t(`home.${tool.key}`, tool.key)}</span>
        <span className="block text-xs leading-5 text-muted-foreground sm:text-sm">{t(`home.${tool.key}Desc`, '')}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary motion-reduce:group-hover:translate-x-0" aria-hidden="true" />
    </Link>
  );
}

function UtilityToolLink({ tool, t }: { tool: Tool; t: TFunction }) {
  const Icon = tool.icon;
  const prefetchHandlers = useRoutePrefetch(tool.href);
  return (
    <Link
      to={tool.href}
      {...prefetchHandlers}
      data-tour={`mode-${tool.key}`}
      className={cn(
        'motion-press inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground',
        'hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {t(`home.${tool.key}`, tool.key)}
    </Link>
  );
}

function ToolGroup({ title, tools, t }: { title: string; tools: readonly Tool[]; t: TFunction }) {
  return (
    <Card className="h-full border-border/70 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {tools.map((tool) => <ToolRow key={tool.key} tool={tool} t={t} />)}
      </CardContent>
    </Card>
  );
}

function CurrentDebateSummary({ t }: { t: TFunction }) {
  const debate = useCurrentDebate();
  const openDialog = useDebateStore((state) => state.openDialog);
  const oneOff = useDebateStore((state) => state.oneOff);
  const counts = useDebateCounts(debate?.id);

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
            {t('debate.counts', { sources: counts.sources, outputs: counts.outputs, defaultValue: '{{sources}} sources · {{outputs}} outputs' })}
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
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{t('home.title')}</h1>
        </div>

        <CurrentDebateSummary t={t} />

        <div className="grid gap-6 md:grid-cols-2">
          <ToolGroup title={t('home.prepare', 'Prepare')} tools={prepareTools} t={t} />
          <ToolGroup title={t('home.practice', 'Practice')} tools={practiceTools} t={t} />
        </div>

        <section className="mt-8 border-t border-border pt-6" aria-labelledby="home-utilities-title">
          <h2 id="home-utilities-title" className="text-lg font-semibold tracking-tight">{t('home.utilities', 'Utilities')}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {utilityTools.map((tool) => <UtilityToolLink key={tool.key} tool={tool} t={t} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
