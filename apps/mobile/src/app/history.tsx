import { Link, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ActionMenu } from '@/components/action-menu';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Chip } from '@/components/chip';
import { DocumentHeader } from '@/components/document-header';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { KIND_ICONS, workHref } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { confirmDestructive, showNotice } from '@/lib/confirm';
import { formatWhen } from '@/lib/dates';
import { useDebates } from '@/lib/debate-context';
import type { Debate } from '@/lib/debates';
import {
  attachToDebate,
  fetchDebateHistory,
  fetchUnsortedWork,
  HISTORY_TABS,
  type HistoryItem,
  type HistoryLists,
  type HistoryTab,
  type UnsortedEntry,
} from '@/lib/history';
import { keepIfSame } from '@/lib/keep-if-same';
import { suggestDebate } from '@/lib/motion';
import { deleteResult } from '@/lib/results';
import { deleteSparringRound, sparringDraft } from '@/lib/sparring';
import { hasDocumentText, useWorkActions } from '@/lib/work-actions';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';
import { EmptyState } from '@/components/empty-state';

/** What the History lists delete, with the website's confirmation and failure copy. */
const DELETIONS: Record<'case' | 'sparring', { tab: HistoryTab; title: string; desc: string; failed: string; label: string; run: (userId: string, id: string) => Promise<void> }> = {
  case: {
    tab: 'cases',
    title: 'historyPage.deleteCaseTitle',
    desc: 'historyPage.deleteCaseDesc',
    failed: 'historyPage.deleteFailed',
    label: 'historyPage.deleteCaseLabel',
    run: (userId, id) => deleteResult(userId, 'case', id),
  },
  sparring: {
    tab: 'sparring',
    title: 'historyPage.deleteSparringTitle',
    desc: 'historyPage.deleteSparringDesc',
    failed: 'historyPage.sparringDeleteFailed',
    label: 'historyPage.deleteSparringAria',
    run: async (userId, id) => {
      await deleteSparringRound(userId, id);
      // The finished round on the Sparring screen is this one; another round, finished or not, stays.
      if (sparringDraft.get()?.id === id) sparringDraft.set(null);
    },
  },
};

/** The History scope for work that belongs to no debate, as the website's OUTSIDE_DEBATES. */
const OUTSIDE = 'outside';

type Loaded =
  | { scope: string; kind: 'debate'; lists: HistoryLists }
  | { scope: typeof OUTSIDE; kind: 'unsorted'; entries: UnsortedEntry[] };

const EMPTY: Record<HistoryTab, { title: string; desc: string; action: string; href: Href | null }> = {
  cases: { title: 'historyPage.emptyCases', desc: 'historyPage.emptyCasesDesc', action: 'historyPage.createCase', href: { pathname: '/generate', params: { from: 'history' } } },
  chats: { title: 'historyPage.emptyChats', desc: 'historyPage.emptyChatsDesc', action: 'historyPage.startChat', href: '/ask' },
  attacks: { title: 'historyPage.emptyAttacks', desc: 'historyPage.emptyAttacksDesc', action: 'historyPage.attackCase', href: { pathname: '/attack', params: { from: 'history' } } },
  brainstorms: { title: 'historyPage.emptyBrainstorms', desc: 'historyPage.emptyBrainstormsDesc', action: 'historyPage.brainstormIdeas', href: { pathname: '/brainstorm', params: { from: 'history' } } },
  factoids: { title: 'historyPage.emptyFactoids', desc: 'historyPage.emptyFactoidsDesc', action: 'historyPage.findEvidence', href: { pathname: '/factoids', params: { from: 'history' } } },
  sparring: { title: 'historyPage.emptySparring', desc: 'historyPage.emptySparringDesc', action: 'historyPage.startSparring', href: { pathname: '/sparring', params: { from: 'history' } } },
};

/**
 * Where a History row opens, or null when the app cannot open it. Chats load
 * back into Ask, as the website's Resume does, and a Sparring round opens its
 * scorecard, as the website's Load does. The website cannot reopen a
 * Crossfire round, so neither can the app.
 */
function historyHref(item: HistoryItem): Href | null {
  switch (item.kind) {
    case 'chat':
      return { pathname: '/ask', params: { chat: item.id } };
    case 'crossfire':
      return null;
    default:
      return workHref(item, 'history');
  }
}

/** The website's History (src/pages/HistoryPage.tsx): saved work per debate, and work outside every debate. */
export default function HistoryScreen() {
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { status, debates, current, refresh: refreshDebates } = useDebates();
  // History opens on the Current Debate, also in one-off mode, as on the website; other debates stay reachable.
  const [scopeChoice, setScopeChoice] = useState<string | null>(null);
  const scope = scopeChoice && (scopeChoice === OUTSIDE || debates.some((debate) => debate.id === scopeChoice))
    ? scopeChoice
    : current?.id ?? OUTSIDE;
  const [tab, setTab] = useState<HistoryTab>('cases');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);

  // Only the latest load lands, and nothing lands after an account change or after leaving.
  const loads = useRef(0);
  const owner = useRef(userId);
  const live = useRef(true);
  useEffect(() => {
    owner.current = userId;
    loads.current += 1;
    setLoaded(null);
  }, [userId]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      loads.current += 1;
    };
  }, []);

  const copies = useCopyHolder();
  const load = useCallback(async (target: string) => {
    if (!userId) return;
    const forUser = userId;
    const request = ++loads.current;
    const isCurrent = () => live.current && loads.current === request && owner.current === forUser;
    const mark = copies.mark();
    try {
      const next: Loaded = target === OUTSIDE
        ? { scope: OUTSIDE, kind: 'unsorted', entries: await fetchUnsortedWork(forUser, mark) }
        : { scope: target, kind: 'debate', lists: await fetchDebateHistory(forUser, target, mark) };
      if (!isCurrent()) return;
      // Focus refreshes usually reread the same rows; keep the shown lists when they did not change.
      setLoaded((previous) => keepIfSame(previous, next));
      setFailed(null);
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load history:', cause instanceof Error ? cause.message : cause);
      setFailed(target);
    }
  }, [userId, copies]);

  // Reload on focus, so a case deleted in its document or work saved on the website shows up.
  // The scope follows the Current Debate, so wait for the debates instead of loading one-off work first.
  const debatesKnown = status !== 'loading';
  useFocusEffect(
    useCallback(() => {
      if (debatesKnown) void load(scope);
    }, [debatesKnown, load, scope]),
  );

  const shown = loaded?.scope === scope ? loaded : null;
  const scopeDebate = debates.find((debate) => debate.id === scope) ?? null;
  const scopeLabel = scope === OUTSIDE
    ? t('debate.outsideDebates')
    : `${scope === current?.id ? `${t('nav.currentDebate')}: ` : ''}${scopeDebate?.motion ?? ''}`;

  // The website's History deletes cases and Sparring rounds, each after its own confirmation.
  const remove = async (item: HistoryItem): Promise<boolean> => {
    const forUser = owner.current;
    const deletion = item.kind === 'case' || item.kind === 'sparring' ? DELETIONS[item.kind] : null;
    if (!forUser || !deletion) return false;
    const confirmed = await confirmDestructive({
      title: t(deletion.title),
      message: t(deletion.desc),
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed || owner.current !== forUser) return false;
    try {
      await deletion.run(forUser, item.id);
    } catch (cause) {
      console.warn(`Could not delete the ${item.kind}:`, cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === forUser) showNotice(t(deletion.failed));
      return false;
    }
    if (!live.current || owner.current !== forUser) return true;
    // Any load still running read the list before this delete.
    loads.current += 1;
    const list = deletion.tab;
    setLoaded((previous) => previous?.kind === 'debate'
      ? { ...previous, lists: { ...previous.lists, [list]: previous.lists[list].filter((entry) => entry.id !== item.id) } }
      : previous);
    return true;
  };

  const attached = (entry: UnsortedEntry) => {
    loads.current += 1;
    setLoaded((previous) => previous?.kind === 'unsorted'
      ? { ...previous, entries: previous.entries.filter((candidate) => !(candidate.kind === entry.kind && candidate.id === entry.id)) }
      : previous);
    // The debate's last activity moved; the switcher and the Debate tab show the new order.
    void refreshDebates();
  };

  return (
    <View style={styles.root}>
      <DocumentHeader backLabel={backLabel(t, from, 'debate')} actions={[]} />
      <Screen>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('historyPage.title')}
        </Text>
        <ScopePicker label={scopeLabel} onPress={() => setScopeOpen(true)} />
        <ActionMenu
          visible={scopeOpen}
          title={t('debate.historyScope')}
          items={[
            ...debates.map((debate) => ({
              key: debate.id,
              label: `${debate.id === current?.id ? `${t('nav.currentDebate')}: ` : ''}${debate.motion}`,
            })),
            { key: OUTSIDE, label: t('debate.outsideDebates') },
          ]}
          cancelLabel={t('common.cancel')}
          onClose={() => setScopeOpen(false)}
          onSelect={setScopeChoice}
          testID="history-scope-menu"
        />

        {scope !== OUTSIDE ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
            {HISTORY_TABS.map((entry) => (
              <Chip
                key={entry.key}
                accessibilityRole="tab"
                icon={KIND_ICONS[entry.kind]}
                label={t(`historyPage.tab${entry.key[0].toUpperCase()}${entry.key.slice(1)}`)}
                selected={tab === entry.key}
                onPress={() => setTab(entry.key)}
                testID={`history-tab-${entry.key}`}
              />
            ))}
          </ScrollView>
        ) : null}

        {failed === scope && !shown ? (
          <Card>
            <Text tone="secondary" style={styles.body}>
              {t('mobile.history.loadFailed')}
            </Text>
            <TextButton label={t('common.retry')} onPress={() => void load(scope)} />
          </Card>
        ) : !shown ? (
          <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />
        ) : shown.kind === 'unsorted' ? (
          <UnsortedList entries={shown.entries} debates={debates} userId={userId} onAttached={attached} />
        ) : (
          <TabList tab={tab} items={shown.lists[tab]} onDelete={remove} />
        )}
      </Screen>
    </View>
  );
}

function ScopePicker({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('debate.historyScope')}: ${label}`}
      onPress={onPress}
      testID="history-scope"
      style={({ pressed }) => [styles.scope, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text tone="faint" style={styles.meta}>
          {t('debate.historyScope')}
        </Text>
        <Text weight="semibold" style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Icon name="chevronDown" color={colors.tabInactive} size={20} />
    </Pressable>
  );
}

function TabList({ tab, items, onDelete }: { tab: HistoryTab; items: HistoryItem[]; onDelete: (item: HistoryItem) => Promise<boolean> }) {
  const { t } = useTranslation();
  const router = useRouter();
  if (items.length === 0) {
    const empty = EMPTY[tab];
    return (
      <EmptyState pose="sleepy" title={t(empty.title)} description={t(empty.desc)}>
        {empty.href ? <TextButton label={t(empty.action)} onPress={() => router.push(empty.href!)} /> : null}
      </EmptyState>
    );
  }
  return (
    <Card style={styles.list}>
      {items.map((item, index) => {
        const href = historyHref(item);
        return (
          <HistoryRow
            key={`${item.kind}-${item.id}`}
            item={item}
            first={index === 0}
            onPress={href ? () => router.push(href) : undefined}
            onDelete={item.kind === 'case' || item.kind === 'sparring' ? () => onDelete(item) : undefined}
          />
        );
      })}
    </Card>
  );
}

function itemMeta(t: ReturnType<typeof useTranslation>['t'], item: HistoryItem | UnsortedEntry): string {
  const kind = t(`debate.kinds.${item.kind}`);
  const when = formatWhen(item.createdAt);
  if (item.kind === 'source') return t('mobile.debate.itemMeta', { kind, when });
  const parts: string[] = [];
  if (item.side) parts.push(item.side.toUpperCase());
  if (item.messageCount !== undefined) parts.push(t('askChat.messageCount', { count: item.messageCount }));
  if (item.sparring) {
    parts.push(t(`sparring.format.${item.sparring.format}`, { defaultValue: item.sparring.format.toUpperCase() }));
    parts.push(item.sparring.userSide === 'pro' ? t('export.proposition') : t('export.opposition'));
    if (item.sparring.score) parts.push(t('historyPage.score', { user: item.sparring.score.user, ai: item.sparring.score.ai }));
  }
  return [t('mobile.debate.itemMeta', { kind, when }), ...parts].join(' · ');
}

/** One saved result. Tapping opens it where the app can; a case or a Sparring round swipes left to delete, with the website's confirmation. */
function HistoryRow({ item, first, onPress, onDelete }: { item: HistoryItem; first: boolean; onPress?: () => void; onDelete?: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const work = useWorkActions();
  const href = historyHref(item);
  const title = item.title || t(`debate.kinds.${item.kind}`);

  const remove = async () => {
    const removed = await onDelete?.();
    if (!removed) swipeable.current?.close();
  };

  const row = (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? t('mobile.common.openItem', { title }) : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: t('common.delete') }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') void remove();
      }}
      disabled={!onPress}
      onPress={onPress}
      testID="history-row"
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && styles.pressed]}>
      <IconTile name={KIND_ICONS[item.kind]} size={42} />
      <View style={styles.rowText}>
        <Text weight="semibold" style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text tone="faint" style={styles.meta} numberOfLines={2}>
          {itemMeta(t, item)}
        </Text>
      </View>
      {onPress ? <Icon name="chevronRight" color={colors.tabInactive} size={20} /> : null}
    </Pressable>
  );
  // Press and hold for a preview and the menu: Discuss and Share for a document, Delete where History deletes.
  const body = href ? (
    <Link
      href={href}
      asChild
      onPress={(event) => {
        event.preventDefault();
        onPress?.();
      }}>
      <Link.Trigger>{row}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {hasDocumentText(item) ? (
          <Link.MenuAction icon="bubble.left.and.bubble.right" onPress={() => void work.discuss(item)}>
            {t('common.discuss')}
          </Link.MenuAction>
        ) : null}
        {hasDocumentText(item) ? (
          <Link.MenuAction icon="square.and.arrow.up" onPress={() => void work.share(item)}>
            {t('mobile.library.share')}
          </Link.MenuAction>
        ) : null}
        {onDelete ? (
          <Link.MenuAction icon="trash" destructive onPress={() => void remove()}>
            {t('common.delete')}
          </Link.MenuAction>
        ) : null}
      </Link.Menu>
    </Link>
  ) : row;

  const divider = !first && { borderTopWidth: 1, borderTopColor: colors.line };
  if (!onDelete) return <View style={divider}>{body}</View>;
  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={divider}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.kind === 'sparring' ? t(DELETIONS.sparring.label, { motion: title }) : t(DELETIONS.case.label, { title })}
          onPress={() => void remove()}
          style={[styles.deleteAction, { backgroundColor: colors.destructive }]}>
          <Icon name="trash" color="#ffffff" size={20} />
          <Text weight="semibold" style={styles.deleteLabel}>
            {t('common.delete')}
          </Text>
        </Pressable>
      )}>
      {body}
    </ReanimatedSwipeable>
  );
}

/** The website's UnsortedWork: one-off and older work outside every debate, each with "Add to debate". */
function UnsortedList({
  entries,
  debates,
  userId,
  onAttached,
}: {
  entries: UnsortedEntry[];
  debates: Debate[];
  userId: string | null;
  onAttached: (entry: UnsortedEntry) => void;
}) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);
  if (entries.length === 0) {
    return (
      <Card>
        <Text weight="semibold" style={styles.rowTitle}>
          {t('debate.unsortedEmpty')}
        </Text>
        <Text tone="secondary" style={styles.body}>
          {t('debate.unsortedEmptyDesc')}
        </Text>
        {notice ? (
          <Text tone="secondary" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body} testID="unsorted-notice">
            {notice}
          </Text>
        ) : null}
      </Card>
    );
  }
  return (
    <>
      <Text tone="secondary" style={styles.body}>
        {t('debate.unsortedDesc')}
      </Text>
      {notice ? (
        <Text weight="semibold" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body} testID="unsorted-notice">
          {notice}
        </Text>
      ) : null}
      {entries.map((entry) => (
        <UnsortedRow
          key={`${entry.kind}-${entry.id}`}
          entry={entry}
          debates={debates}
          userId={userId}
          onAttached={() => {
            setNotice(t('debate.attached'));
            onAttached(entry);
          }}
        />
      ))}
    </>
  );
}

function UnsortedRow({ entry, debates, userId, onAttached }: { entry: UnsortedEntry; debates: Debate[]; userId: string | null; onAttached: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const suggestion = suggestDebate(debates, entry.kind === 'source' ? [entry.title] : [entry.motion, entry.title]);
  const [target, setTarget] = useState(suggestion?.id ?? '');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => {
    live.current = false;
  }, []);
  const chosen = debates.find((debate) => debate.id === target);
  const href = entry.kind === 'source' ? null : historyHref(entry);
  const title = entry.title || t(`debate.kinds.${entry.kind}`);

  const attach = async () => {
    if (!chosen || !userId || busy) return;
    setBusy(true);
    try {
      await attachToDebate(userId, entry, chosen.id);
      if (live.current) onAttached();
    } catch (cause) {
      console.warn('Could not add to the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current) showNotice(t('debate.attachFailed'));
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.unsortedHead}>
        <IconTile name={entry.kind === 'source' ? 'file' : KIND_ICONS[entry.kind]} size={42} />
        <View style={styles.rowText}>
          <Text weight="semibold" style={styles.rowTitle} numberOfLines={3}>
            {title}
          </Text>
          <Text tone="faint" style={styles.meta}>
            {itemMeta(t, entry)}
          </Text>
        </View>
      </View>
      {href ? <TextButton label={t('historyPage.load')} onPress={() => router.push(href)} /> : null}
      {suggestion ? (
        <View style={styles.suggested}>
          <View style={[styles.badge, { backgroundColor: colors.tile }]}>
            <Text weight="semibold" style={[styles.badgeText, { color: colors.tileForeground }]}>
              {t('debate.suggested')}
            </Text>
          </View>
          <Text style={[styles.body, styles.suggestedMotion]}>{suggestion.motion}</Text>
        </View>
      ) : null}
      {debates.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('debate.attachTo')}: ${chosen?.motion ?? t('debate.chooseDebate')}`}
            onPress={() => setPicking(true)}
            disabled={busy}
            testID="unsorted-target"
            style={({ pressed }) => [styles.target, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
            <Text tone={chosen ? 'foreground' : 'faint'} style={[styles.body, styles.targetText]} numberOfLines={2}>
              {chosen?.motion ?? t('debate.chooseDebate')}
            </Text>
            <Icon name="chevronDown" color={colors.tabInactive} size={18} />
          </Pressable>
          <ActionMenu
            visible={picking}
            title={t('debate.attachTo')}
            items={debates.map((debate) => ({ key: debate.id, label: debate.motion }))}
            cancelLabel={t('common.cancel')}
            onClose={() => setPicking(false)}
            onSelect={setTarget}
          />
          <PrimaryButton label={t('debate.attachConfirm')} busy={busy} disabled={!chosen} onPress={() => void attach()} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  body: { fontSize: 15, lineHeight: 21 },
  loading: { marginTop: 32 },
  pressed: { opacity: 0.7 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  tabRow: { marginHorizontal: -20, flexGrow: 0 },
  tabs: { gap: 8, paddingHorizontal: 20 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 14, lineHeight: 19 },
  deleteAction: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 3 },
  deleteLabel: { color: '#ffffff', fontSize: 13 },
  unsortedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  suggested: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  suggestedMotion: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 12.5 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13 },
  targetText: { flex: 1 },
});
