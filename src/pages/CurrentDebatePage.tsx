import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database, Pencil, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { PRACTICE_TOOLS, PREPARE_TOOLS, ToolLink } from '@/components/features/tools/tool-links';
import { DebateForm } from '@/components/features/debate/DebateForm';
import { debateCountsLabel, sideLabelKey, useDebateCounts } from '@/components/features/debate/CurrentDebateStrip';
import { useAllDebateItems, useOpenDebateItem, type DebateItem } from '@/components/features/debate/debate-items';
import { useToast } from '@/hooks/use-toast';
import { formatEuropeanDateTime, formatRelativeDate } from '@/lib/date-format';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { useSessionStore } from '@/lib/stores/session-store';

const TOOLS = [...PREPARE_TOOLS, ...PRACTICE_TOOLS];

function ViewAll({ to, count, shown }: { to: string; count: number; shown: number }) {
  const { t } = useTranslation();
  if (count <= shown) return null;
  return (
    <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
      <Link to={to}>{t('debate.viewAll', { total: count, defaultValue: 'View all ({{total}})' })}</Link>
    </Button>
  );
}

function ItemRow({ item }: { item: DebateItem }) {
  const { t } = useTranslation();
  const openItem = useOpenDebateItem();
  const canOpen = item.kind !== 'crossfire';
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {t(`debate.kinds.${item.kind}`)} · {formatEuropeanDateTime(item.createdAt)}
        </p>
      </div>
      {/* The name starts with the visible word (WCAG 2.5.3) and ends with which item it loads. */}
      {canOpen && (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => openItem(item)}>
          {t('historyPage.load', 'Load')}<span className="sr-only"> {item.title}</span>
        </Button>
      )}
    </li>
  );
}

function SideSection({ side, items }: { side: 'pro' | 'con'; items: DebateItem[] }) {
  const { t } = useTranslation();
  const relevant = items.filter((item) => item.side === side || item.side === 'both');
  return (
    <Card className="h-full min-w-0 border-border/70 bg-card/60" data-testid={`debate-side-${side}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle>{t(sideLabelKey(side))}</CardTitle>
        <Badge variant="secondary" className="shrink-0">{t('debate.itemCount', { count: relevant.length, defaultValue: '{{count}} items' })}</Badge>
      </CardHeader>
      <CardContent>
        {relevant.length === 0
          ? <p className="text-sm text-muted-foreground">{t('debate.sideEmpty', 'No work for this side yet.')}</p>
          : <ul>{relevant.slice(0, 4).map((item) => <ItemRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>}
        <ViewAll to="/app/history" count={relevant.length} shown={4} />
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
  const sourceCounts = useDebateCounts(debate?.id);
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
        <PageHeader
          className="mb-0"
          eyebrow={t('nav.currentDebate', 'Current debate')}
          title={debate.motion}
          titleTestId="current-debate-motion"
          meta={<>
            {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
            {' · '}
            {debateCountsLabel(t, { ...sourceCounts, outputs: items.length })}
          </>}
          actions={<>
            <Button variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />{t('debate.editSettings', 'Edit settings')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openDialog('switch')}>{t('debate.switch', 'Switch debate')}</Button>
            <Button variant="ghost" size="sm" onClick={() => openDialog('create')}>{t('debate.startNew', 'Start new debate')}</Button>
          </>}
        />

        {/* The tools are the main thing to do here, so they come first. */}
        <section aria-labelledby="debate-tools-title">
          <h2 id="debate-tools-title" className="mb-3 text-lg font-semibold tracking-tight">{t('debate.tools', 'Prepare and practice')}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => <ToolLink key={tool.key} tool={tool} variant="tile" />)}
          </div>
        </section>

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
              {debate.instructions && <p className="whitespace-pre-wrap wrap-break-word">{debate.instructions}</p>}
            </CardContent>
          </Card>
        )}

        {/* grid-cols-1 is minmax(0, 1fr): a long title truncates instead of widening the page. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SideSection side="pro" items={items} />
          <SideSection side="con" items={items} />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="min-w-0 border-border/70 bg-card/60" data-testid="debate-sources">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle>{t('debate.sources', 'Sources')}</CardTitle>
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
              <ViewAll to="/app/library" count={debateSources.length} shown={6} />
            </CardContent>
          </Card>
          <Card className="min-w-0 border-border/70 bg-card/60" data-testid="debate-recent">
            <CardHeader className="pb-2">
              <CardTitle>{t('debate.recentWork', 'Recent work')}</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0
                ? <p className="text-sm text-muted-foreground">{t('debate.noWork', 'Results from any tool appear here automatically.')}</p>
                : <ul>{items.slice(0, 6).map((item) => <ItemRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>}
              <ViewAll to="/app/history" count={items.length} shown={6} />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
