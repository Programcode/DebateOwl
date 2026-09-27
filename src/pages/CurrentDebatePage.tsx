import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Crosshair,
  Database,
  Dumbbell,
  GitBranch,
  Lightbulb,
  MessageCircle,
  Pencil,
  Sparkles,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { DebateForm } from '@/components/features/debate/DebateForm';
import { sideLabelKey } from '@/components/features/debate/CurrentDebateStrip';
import { useAllDebateItems, useOpenDebateItem, type DebateItem } from '@/components/features/debate/debate-items';
import { useToast } from '@/hooks/use-toast';
import { formatEuropeanDateTime, formatRelativeDate } from '@/lib/date-format';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useSessionStore } from '@/lib/stores/session-store';

const TOOLS: Array<{ key: string; href: string; icon: LucideIcon }> = [
  { key: 'generate', href: '/app/generate', icon: Sparkles },
  { key: 'brainstorm', href: '/app/brainstorm', icon: Lightbulb },
  { key: 'factoids', href: '/app/factoids', icon: BookOpen },
  { key: 'flowchart', href: '/app/flowchart', icon: GitBranch },
  { key: 'attack', href: '/app/attack', icon: Swords },
  { key: 'ask', href: '/app/ask', icon: MessageCircle },
  { key: 'crossfire', href: '/app/crossfire', icon: Crosshair },
  { key: 'sparring', href: '/app/sparring', icon: Dumbbell },
];

function ItemRow({ item }: { item: DebateItem }) {
  const { t } = useTranslation();
  const openItem = useOpenDebateItem();
  const canOpen = item.kind !== 'crossfire';
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {t(`debate.kinds.${item.kind}`)} · {formatEuropeanDateTime(item.createdAt)}
        </p>
      </div>
      {canOpen && (
        <Button variant="ghost" size="sm" onClick={() => openItem(item)} aria-label={t('debate.openItemAria', { title: item.title, defaultValue: 'Open {{title}}' })}>
          {t('historyPage.load', 'Load')}
        </Button>
      )}
    </li>
  );
}

function SideSection({ side, items }: { side: 'pro' | 'con'; items: DebateItem[] }) {
  const { t } = useTranslation();
  const relevant = items.filter((item) => item.side === side || item.side === 'both');
  return (
    <Card className="h-full border-border/70 bg-card/60" data-testid={`debate-side-${side}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{t(sideLabelKey(side))}</CardTitle>
        <Badge variant="secondary">{t('debate.itemCount', { count: relevant.length, defaultValue: '{{count}} items' })}</Badge>
      </CardHeader>
      <CardContent>
        {relevant.length === 0
          ? <p className="text-sm text-muted-foreground">{t('debate.sideEmpty', 'No work for this side yet.')}</p>
          : <ul>{relevant.slice(0, 4).map((item) => <ItemRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>}
      </CardContent>
    </Card>
  );
}

export default function CurrentDebatePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const debate = useCurrentDebate();
  const openDialog = useDebateStore((state) => state.openDialog);
  const updateDebate = useDebateStore((state) => state.updateDebate);
  const sources = useSessionStore((state) => state.sourceLibrary);
  const allItems = useAllDebateItems();
  const [editing, setEditing] = useState(false);

  if (!debate) {
    return (
      <div className="container px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={Sparkles}
            title={t('debate.noCurrentTitle', 'No current debate')}
            description={t('debate.noCurrentDesc', 'Start a debate to keep one motion, its sources, and your results together.')}
            actionLabel={t('debate.startDebate', 'Start debate')}
            onAction={() => openDialog('create')}
          />
        </div>
      </div>
    );
  }

  const items = allItems.filter((item) => item.debateId === debate.id);
  const debateSources = sources.filter((source) => source.debateId === debate.id);

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t('nav.currentDebate', 'Current debate')}</p>
          <h1 className="break-words text-3xl font-bold tracking-tight text-foreground" data-testid="current-debate-motion">{debate.motion}</h1>
          <p className="text-sm text-muted-foreground">
            {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
            {' · '}
            {t('debate.counts', { sources: debateSources.length, outputs: items.length, defaultValue: '{{sources}} sources · {{outputs}} outputs' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing((value) => !value)}>
              <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />{t('debate.editSettings', 'Edit settings')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDialog('switch')}>{t('debate.switch', 'Switch debate')}</Button>
            <Button variant="outline" size="sm" onClick={() => openDialog('create')}>{t('debate.startNew', 'Start new debate')}</Button>
          </div>
        </header>

        {editing ? (
          <Card>
            <CardContent className="pt-6">
              <DebateForm
                idPrefix="edit-debate"
                initial={debate}
                submitLabel={t('common.save', 'Save')}
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  await updateDebate(debate.id, values);
                  setEditing(false);
                  toast({ title: t('debate.settingsSaved', 'Debate settings saved') });
                }}
              />
            </CardContent>
          </Card>
        ) : (debate.instructions || debate.settings.format) && (
          <Card className="border-border/70 bg-card/60">
            <CardContent className="space-y-2 pt-6 text-sm">
              {debate.settings.format && (
                <p><span className="text-muted-foreground">{t('debate.format', 'Format')}: </span>{t(`debate.formats.${debate.settings.format}`, debate.settings.format)}</p>
              )}
              {debate.instructions && <p className="whitespace-pre-wrap break-words">{debate.instructions}</p>}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <SideSection side="pro" items={items} />
          <SideSection side="con" items={items} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/70 bg-card/60" data-testid="debate-sources">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{t('debate.sources', 'Sources')}</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/library"><Database className="mr-1 h-4 w-4" aria-hidden="true" />{t('nav.library', 'Library')}</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {debateSources.length === 0
                ? <p className="text-sm text-muted-foreground">{t('debate.noSources', 'No sources in this debate yet.')}</p>
                : (
                  <ul className="space-y-1 text-sm">
                    {debateSources.slice(0, 6).map((source) => <li key={source.id} className="truncate">{source.title}</li>)}
                  </ul>
                )}
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/60" data-testid="debate-recent">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t('debate.recentWork', 'Recent work')}</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0
                ? <p className="text-sm text-muted-foreground">{t('debate.noWork', 'Results from any tool appear here automatically.')}</p>
                : <ul>{items.slice(0, 6).map((item) => <ItemRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>}
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="debate-tools-title">
          <h2 id="debate-tools-title" className="mb-3 text-lg font-semibold tracking-tight">{t('debate.tools', 'Prepare and practice')}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <Link
                key={tool.key}
                to={tool.href}
                className="motion-press group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <tool.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="flex-1">{t(`nav.${tool.key}`)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
