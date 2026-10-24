import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatEuropeanDateTime } from '@/lib/date-format';
import { sameMotion, useDebateStore, type Debate } from '@/lib/stores/debate-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useAllDebateItems, useOpenDebateItem, type DebateItem } from './debate-items';

type UnsortedEntry =
  | { kind: 'item'; item: DebateItem }
  | { kind: 'source'; id: string; title: string; createdAt: number };

function entryKey(entry: UnsortedEntry) {
  return entry.kind === 'item' ? `${entry.item.kind}-${entry.item.id}` : `source-${entry.id}`;
}

/** Suggest a debate only on an exact motion or title match; the user still confirms. */
// eslint-disable-next-line react-refresh/only-export-components
export function suggestDebate(debates: Debate[], candidates: Array<string | undefined>): Debate | undefined {
  return debates.find((debate) => candidates.some((candidate) => sameMotion(debate.motion, candidate)));
}

function UnsortedRow({ entry, debates }: { entry: UnsortedEntry; debates: Debate[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const attachItem = useSessionStore((state) => state.attachItem);
  const attachSparring = useSparringStore((state) => state.attachSessionToDebate);
  const openItem = useOpenDebateItem();
  const title = entry.kind === 'item' ? entry.item.title : entry.title;
  const suggestion = suggestDebate(debates, entry.kind === 'item' ? [entry.item.motion, entry.item.title] : [entry.title]);
  const [target, setTarget] = useState<string>(suggestion?.id ?? '');
  const [busy, setBusy] = useState(false);

  const attach = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (entry.kind === 'source') await attachItem('source', entry.id, target);
      else if (entry.item.kind === 'sparring') await attachSparring(entry.item.id, target);
      else await attachItem(entry.item.kind, entry.item.id, target);
      toast({ title: t('debate.attached', 'Added to debate') });
    } catch {
      toast({ title: t('debate.attachFailed', 'Could not add this to the debate'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4" data-testid="unsorted-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="wrap-break-word font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {entry.kind === 'item' ? t(`debate.kinds.${entry.item.kind}`) : t('debate.kinds.source', 'Source')}
            {' · '}
            {formatEuropeanDateTime(entry.kind === 'item' ? entry.item.createdAt : entry.createdAt)}
          </p>
        </div>
        {entry.kind === 'item' && entry.item.kind !== 'crossfire' && (
          <Button variant="outline" size="sm" onClick={() => openItem(entry.item)}>{t('historyPage.load', 'Load')}</Button>
        )}
      </div>
      {suggestion && (
        <p className="text-sm">
          <Badge variant="secondary" className="mr-2">{t('debate.suggested', 'Suggested')}</Badge>
          <span className="wrap-break-word">{suggestion.motion}</span>
        </p>
      )}
      {debates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="sm:flex-1" aria-label={t('debate.attachTo', 'Add to debate')}>
              <SelectValue placeholder={t('debate.chooseDebate', 'Choose a debate')} />
            </SelectTrigger>
            <SelectContent>
              {debates.map((debate) => <SelectItem key={debate.id} value={debate.id}>{debate.motion}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button disabled={!target || busy} onClick={() => void attach()}>{t('debate.attachConfirm', 'Add to debate')}</Button>
        </div>
      )}
    </li>
  );
}

/** One-off work and recent legacy material that belongs to no debate yet. */
export function UnsortedWork() {
  const { t } = useTranslation();
  const debates = useDebateStore((state) => state.debates);
  const items = useAllDebateItems();
  const sources = useSessionStore((state) => state.sourceLibrary);
  const entries: UnsortedEntry[] = [
    ...items.filter((item) => !item.debateId).map((item) => ({ kind: 'item' as const, item })),
    ...sources.filter((source) => !source.debateId).map((source) => ({ kind: 'source' as const, id: source.id, title: source.title, createdAt: source.createdAt })),
  ].sort((a, b) => (b.kind === 'item' ? b.item.createdAt : b.createdAt) - (a.kind === 'item' ? a.item.createdAt : a.createdAt));

  if (entries.length === 0) {
    return <EmptyState pose="sleepy" icon={Inbox} title={t('debate.unsortedEmpty', 'Nothing outside your debates')} description={t('debate.unsortedEmptyDesc', 'One-off results and older unsorted work appear here.')} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('debate.unsortedDesc', 'These results are not in any debate. Nothing moves until you confirm.')}</p>
      <ul className="space-y-3">
        {entries.map((entry) => <UnsortedRow key={entryKey(entry)} entry={entry} debates={debates} />)}
      </ul>
    </div>
  );
}
