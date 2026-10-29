import { Link, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { ActionMenu } from '@/components/action-menu';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Card, IconTile, ListItemIn, usePressScale } from '@/components/card';
import { Chip } from '@/components/chip';
import { DocumentHeader } from '@/components/document-header';
import { Icon } from '@/components/icon';
import { CardRowFrame, ListScreen, useRowArrivals } from '@/components/list-screen';
import { SkeletonRows } from '@/components/skeleton';
import { Text } from '@/components/text';
import { KIND_ICONS, workHref } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { confirmDestructive, showNotice } from '@/lib/confirm';
import { formatWhen } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
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
import { useLatest } from '@/lib/live-value';
import { suggestDebate } from '@/lib/motion';
import { deleteCrossfireRound } from '@/lib/crossfire';
import { deleteResult } from '@/lib/results';
import { deleteSparringRound, sparringDraft } from '@/lib/sparring';
import { hasDocumentText, useWorkActions } from '@/lib/work-actions';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';
import { EmptyState } from '@/components/empty-state';

/** What the History lists delete, with the website's confirmation and failure copy. */
const DELETIONS: Record<'case' | 'sparring' | 'crossfire', { tab: HistoryTab; title: string; desc: string; failed: string; label: string; run: (userId: string, id: string) => Promise<void> }> = {
  case: {
    tab: 'cases',
    title: 'historyPage.deleteCaseTitle',
    desc: 'historyPage.deleteCaseDesc',
    failed: 'historyPage.deleteFailed',
    label: 'historyPage.deleteCaseLabel',
    run: (userId, id) => deleteResult(userId, 'case', id),
  },
  crossfire: {
    tab: 'crossfire',
    title: 'historyPage.deleteCrossfireTitle',
    desc: 'historyPage.deleteCrossfireDesc',
    failed: 'historyPage.crossfireDeleteFailed',
    label: 'historyPage.deleteCrossfireAria',
    run: deleteCrossfireRound,
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
  crossfire: { title: 'historyPage.emptyCrossfire', desc: 'historyPage.emptyCrossfireDesc', action: 'historyPage.startCrossfire', href: { pathname: '/crossfire', params: { from: 'history' } } },
  cases: { title: 'historyPage.emptyCases', desc: 'historyPage.emptyCasesDesc', action: 'historyPage.createCase', href: { pathname: '/generate', params: { from: 'history' } } },
  chats: { title: 'historyPage.emptyChats', desc: 'historyPage.emptyChatsDesc', action: 'historyPage.startChat', href: '/ask' },
  attacks: { title: 'historyPage.emptyAttacks', desc: 'historyPage.emptyAttacksDesc', action: 'historyPage.attackCase', href: { pathname: '/attack', params: { from: 'history' } } },
  brainstorms: { title: 'historyPage.emptyBrainstorms', desc: 'historyPage.emptyBrainstormsDesc', action: 'historyPage.brainstormIdeas', href: { pathname: '/brainstorm', params: { from: 'history' } } },
  factoids: { title: 'historyPage.emptyFactoids', desc: 'historyPage.emptyFactoidsDesc', action: 'historyPage.findEvidence', href: { pathname: '/factoids', params: { from: 'history' } } },
  sparring: { title: 'historyPage.emptySparring', desc: 'historyPage.emptySparringDesc', action: 'historyPage.startSparring', href: { pathname: '/sparring', params: { from: 'history' } } },
};

/**
 * Where a History row opens, or null when the app cannot open it. Chats load
 * back into Ask, as the website's Resume does, a Sparring round opens its
 * scorecard, as the website's Load does, and a Crossfire round opens its
 * debrief and transcript to read (crossfire-round/[id]).
 */
function historyHref(item: HistoryItem): Href | null {
  switch (item.kind) {
    case 'chat':
      return { pathname: '/ask', params: { chat: item.id } };
    default:
      return workHref(item, 'history');
  }
}

/** The website's History (src/pages/HistoryPage.tsx): saved work per debate, and work outside every debate. */
export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { status, debates, current, refresh: refreshDebates } = useDebates();
  // History opens on the Current Debate, also in one-off mode, as on the website; other debates stay reachable.
  const [scopeChoice, setScopeChoice] = useState<string | null>(null);
  const scope = scopeChoice && (scopeChoice === OUTSIDE || debates.some((debate) => debate.id === scopeChoice))
    ? scopeChoice
    : current?.id ?? OUTSIDE;
  const shownScope = useLatest(scope);
  const [tab, setTab] = useState<HistoryTab>('cases');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const shownLoaded = useLatest(loaded);
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

  // The website's History deletes cases, Sparring and Crossfire rounds, each after its own confirmation.
  const remove = async (item: HistoryItem): Promise<boolean> => {
    const forUser = owner.current;
    const deletion = item.kind === 'case' || item.kind === 'sparring' || item.kind === 'crossfire' ? DELETIONS[item.kind] : null;
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
      ? { ...previous, lists: { ...previous.lists, [list]: (previous.lists[list] ?? []).filter((entry) => entry.id !== item.id) } }
      : previous?.kind === 'unsorted' ? { ...previous, entries: previous.entries.filter((entry) => entry.id !== item.id || entry.kind !== item.kind) } : previous);
    return true;
  };

  const attached = (entry: UnsortedEntry) => {
    // The unsorted list on screen loses the item at once, and a load running now (which read it before
    // the attach) is dropped. Back on the unsorted scope before its list has loaded, it is read again
    // instead, so the item cannot come back. On a debate's History, that debate's load is left alone and
    // the unsorted list is read when it is opened.
    if (shownScope.current === OUTSIDE) {
      if (shownLoaded.current?.kind === 'unsorted') {
        loads.current += 1;
        setLoaded((previous) => previous?.kind === 'unsorted'
          ? { ...previous, entries: previous.entries.filter((candidate) => !(candidate.kind === entry.kind && candidate.id === entry.id)) }
          : previous);
      } else {
        void load(OUTSIDE);
      }
    }
    // The debate's last activity moved; the switcher and the Debate tab show the new order.
    void refreshDebates();
  };

  // "Add to debate" lives here, not in its row: a virtualized row can unmount while scrolled away,
  // and the debate picked for it and a request in flight must outlast that.
  const [attachChoices, setAttachChoices] = useState<Record<string, string>>({});
  const [attaching, setAttaching] = useState<ReadonlySet<string>>(() => new Set());
  const attachEntry = async (key: string, entry: UnsortedEntry, debateId: string) => {
    const forUser = owner.current;
    if (!forUser || attaching.has(key)) return;
    setAttaching((previous) => new Set(previous).add(key));
    try {
      await attachToDebate(forUser, entry, debateId);
      if (!live.current || owner.current !== forUser) return;
      if (shownScope.current === OUTSIDE) setAttachNotice({ scope: OUTSIDE, text: t('debate.attached') });
      attached(entry);
    } catch (cause) {
      console.warn('Could not add to the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === forUser) showNotice(t('debate.attachFailed'));
    } finally {
      if (live.current) {
        setAttaching((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }
    }
  };

  // The attach notice belongs to the list it was shown for.
  const [attachNotice, setAttachNotice] = useState<{ scope: string; text: string } | null>(null);
  const notice = attachNotice?.scope === scope ? attachNotice.text : null;

  const rows: HistoryListRow[] = !shown
    ? []
    : shown.kind === 'unsorted'
      ? shown.entries.map((entry) => ({ type: 'unsorted', key: `${entry.kind}-${entry.id}`, entry }))
      : (shown.lists[tab] ?? []).map((item) => ({ type: 'item', key: `${item.kind}-${item.id}`, item }));
  const arrivals = useRowArrivals(rows.map((row) => row.key));

  const header = (
    <>
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
        onSelect={(key) => {
          if (key !== scope) haptics.select();
          setScopeChoice(key);
        }}
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

      {shown?.kind === 'unsorted' && shown.entries.length > 0 ? (
        <>
          <Text tone="secondary" style={styles.body}>
            {t('debate.unsortedDesc')}
          </Text>
          {notice ? (
            <Text weight="semibold" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body} testID="unsorted-notice">
              {notice}
            </Text>
          ) : null}
        </>
      ) : null}
    </>
  );

  const empty =
    failed === scope && !shown ? (
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.history.loadFailed')}
        </Text>
        <TextButton label={t('common.retry')} onPress={() => void load(scope)} />
      </Card>
    ) : !shown ? (
      <SkeletonRows rows={4} />
    ) : shown.kind === 'unsorted' ? (
      <UnsortedEmpty notice={notice} />
    ) : (
      <TabEmpty tab={tab} />
    );

  return (
    <View style={styles.root}>
      <DocumentHeader backLabel={backLabel(t, from, 'debate')} actions={[]} />
      <ListScreen
        header={header}
        data={rows}
        keyExtractor={(row) => row.key}
        extraData={{ notice, attachChoices, attaching }}
        animateLayout
        onRefresh={() => load(scope)}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={shown?.kind === 'unsorted' ? UnsortedGap : undefined}
        renderItem={({ item: row, index }) => {
          if (row.type === 'unsorted') {
            return (
              <ListItemIn index={index} enter={arrivals.entersNow(row.key)}>
                <UnsortedRow
                  entry={row.entry}
                  debates={debates}
                  choice={attachChoices[row.key]}
                  busy={attaching.has(row.key)}
                  onDelete={row.entry.kind === 'crossfire' ? () => remove(row.entry as HistoryItem) : undefined}
                  onChoose={(debateId) => setAttachChoices((previous) => ({ ...previous, [row.key]: debateId }))}
                  onAttach={(debateId) => void attachEntry(row.key, row.entry, debateId)}
                />
              </ListItemIn>
            );
          }
          const href = historyHref(row.item);
          return (
            <CardRowFrame index={index} count={rows.length}>
              <ListItemIn index={index} enter={arrivals.entersNow(row.key)}>
                <HistoryRow
                  item={row.item}
                  first={index === 0}
                  onPress={href ? () => router.push(href) : undefined}
                  onDelete={row.item.kind === 'case' || row.item.kind === 'sparring' || row.item.kind === 'crossfire' ? () => remove(row.item) : undefined}
                />
              </ListItemIn>
            </CardRowFrame>
          );
        }}
      />
    </View>
  );
}

type HistoryListRow = { type: 'item'; key: string; item: HistoryItem } | { type: 'unsorted'; key: string; entry: UnsortedEntry };

function UnsortedGap() {
  return <View style={styles.gap} />;
}

function ScopePicker({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <BouncePressable
      accessibilityRole="button"
      accessibilityLabel={`${t('debate.historyScope')}: ${label}`}
      onPress={onPress}
      testID="history-scope"
      style={[styles.scope, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowText}>
        <Text tone="faint" style={styles.meta}>
          {t('debate.historyScope')}
        </Text>
        <Text weight="semibold" style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Icon name="chevronDown" color={colors.tabInactive} size={20} />
    </BouncePressable>
  );
}

function TabEmpty({ tab }: { tab: HistoryTab }) {
  const { t } = useTranslation();
  const router = useRouter();
  const empty = EMPTY[tab];
  return (
    <EmptyState pose="sleepy" title={t(empty.title)} description={t(empty.desc)}>
      {empty.href ? <TextButton label={t(empty.action)} onPress={() => router.push(empty.href!)} /> : null}
    </EmptyState>
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
  const press = usePressScale();
  const href = historyHref(item);
  const title = item.title || t(`debate.kinds.${item.kind}`);

  const remove = async () => {
    const removed = await onDelete?.();
    if (!removed) swipeable.current?.close();
  };

  // VoiceOver offers the long-press menu's actions on the row itself (swipe up or down).
  const document = href !== null && hasDocumentText(item);
  const a11yActions = [
    ...(document ? [{ name: 'discuss', label: t('common.discuss') }, { name: 'share', label: t('mobile.library.share') }] : []),
    ...(onDelete ? [{ name: 'delete', label: t('common.delete') }] : []),
  ];
  const row = (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? t('mobile.common.openItem', { title }) : undefined}
      accessibilityActions={a11yActions.length > 0 ? a11yActions : undefined}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === 'discuss') void work.discuss(item);
        else if (name === 'share') void work.share(item);
        else if (name === 'delete') void remove();
      }}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      testID="history-row"
      style={{ backgroundColor: colors.card }}>
      {() => (
        <Animated.View style={[styles.row, press.style]}>
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
        </Animated.View>
      )}
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
        <BouncePressable
          accessibilityRole="button"
          accessibilityLabel={item.kind === 'sparring' ? t(DELETIONS.sparring.label, { motion: title }) : t(item.kind === 'crossfire' ? DELETIONS.crossfire.label : DELETIONS.case.label, { title })}
          onPress={() => void remove()}
          style={[styles.deleteAction, { backgroundColor: colors.destructive }]}>
          <Icon name="trash" color="#ffffff" size={20} />
          <Text weight="semibold" style={styles.deleteLabel}>
            {t('common.delete')}
          </Text>
        </BouncePressable>
      )}>
      {body}
    </ReanimatedSwipeable>
  );
}

/** The website's UnsortedWork with nothing in it. Its rows ("Add to debate") are UnsortedRow. */
function UnsortedEmpty({ notice }: { notice: string | null }) {
  const { t } = useTranslation();
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

/**
 * One unsorted item with "Add to debate". The list is virtualized, so the row may unmount while
 * scrolled away: the debate picked and the request in flight belong to the screen (`choice`, `busy`,
 * `onAttach`), and only the open menu is the row's own.
 */
function UnsortedRow({
  entry,
  debates,
  choice,
  busy,
  onChoose,
  onAttach,
  onDelete,
}: {
  entry: UnsortedEntry;
  debates: Debate[];
  /** The debate picked for it, if the student changed the suggestion. */
  choice: string | undefined;
  busy: boolean;
  onChoose: (debateId: string) => void;
  onAttach: (debateId: string) => void;
  onDelete?: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const suggestion = suggestDebate(debates, entry.kind === 'source' ? [entry.title] : [entry.motion, entry.title]);
  const target = choice ?? suggestion?.id ?? '';
  const setTarget = onChoose;
  const [picking, setPicking] = useState(false);
  const chosen = debates.find((debate) => debate.id === target);
  const href = entry.kind === 'source' ? null : historyHref(entry);
  const title = entry.title || t(`debate.kinds.${entry.kind}`);

  const attach = () => {
    if (!chosen || busy) return;
    onAttach(chosen.id);
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
      {onDelete ? <TextButton label={t('common.delete')} onPress={() => void onDelete()} /> : null}
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
          <BouncePressable
            accessibilityRole="button"
            accessibilityLabel={`${t('debate.attachTo')}: ${chosen?.motion ?? t('debate.chooseDebate')}`}
            onPress={() => setPicking(true)}
            disabled={busy}
            testID="unsorted-target"
            style={[styles.target, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <Text tone={chosen ? 'foreground' : 'faint'} style={[styles.body, styles.targetText]} numberOfLines={2}>
              {chosen?.motion ?? t('debate.chooseDebate')}
            </Text>
            <Icon name="chevronDown" color={colors.tabInactive} size={18} />
          </BouncePressable>
          <ActionMenu
            visible={picking}
            title={t('debate.attachTo')}
            items={debates.map((debate) => ({ key: debate.id, label: debate.motion }))}
            cancelLabel={t('common.cancel')}
            onClose={() => setPicking(false)}
            onSelect={(key) => {
              if (key !== target) haptics.select();
              setTarget(key);
            }}
          />
          <PrimaryButton label={t('debate.attachConfirm')} busy={busy} disabled={!chosen} onPress={attach} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  body: { fontSize: 15, lineHeight: 21 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  tabRow: { marginHorizontal: -20, flexGrow: 0 },
  tabs: { gap: 8, paddingHorizontal: 20 },
  gap: { height: 16 },
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
