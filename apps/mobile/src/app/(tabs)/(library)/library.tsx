import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { LibraryHeader, type AddSourceKind } from '@/components/library-header';
import { OneOffNotice } from '@/components/one-off-notice';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SOURCE_ICONS, sourceMeta } from '@/components/source-display';
import { SourceView } from '@/components/source-view';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { useDebates } from '@/lib/debate-context';
import { LIBRARY_ROOMY_WIDTH, LIST_WIDTH, SIDEBAR_WIDTH, useLayoutClass } from '@/lib/layout';
import { fetchSources, removeSource, subscribeSourcesChanged, type Source, type SourceType } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

type Filter = 'all' | SourceType;

// In the mock's order. Files are listed read-only: the app cannot add them yet.
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'mobile.library.filters.all' },
  { value: 'file', label: 'mobile.library.filters.files' },
  { value: 'url', label: 'mobile.library.filters.links' },
  { value: 'text', label: 'mobile.library.filters.notes' },
];

function matches(source: Source, query: string): boolean {
  // The website searches titles, text and origins.
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [source.title, source.content, source.origin ?? ''].some((value) => value.toLocaleLowerCase().includes(needle));
}

/**
 * The Current Debate's sources, as in mock 04. It shows the Current Debate even in one-off mode, like the website.
 * On iPad the list and the open source sit side by side (iPad mock A).
 */
export default function LibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, current } = useDebates();
  const debateId = current?.id ?? null;
  const layout = useLayoutClass();

  const onAdd = (kind: AddSourceKind) => router.push(kind === 'link' ? '/add-link' : '/new-note');

  if (layout !== 'phone') return <LibrarySplit wide={layout === 'wide'} onAdd={onAdd} />;

  return (
    <Screen>
      <LibraryHeader title={t('mobile.tabs.library')} onAdd={onAdd} disabled={!debateId} />
      {/* New sources still go to the Current Debate in one-off mode, as on the website, so this only says the mode is on. */}
      <OneOffNotice message="debate.oneOffActive" />
      {status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
      {status !== 'loading' && !debateId ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('debate.libraryNeedsDebate')}
          </Text>
          <TextButton label={t('debate.switch')} onPress={() => router.push('/debates')} />
        </Card>
      ) : null}
      {debateId ? <SourceList key={debateId} debateId={debateId} /> : null}
    </Screen>
  );
}

/** The iPad Library: the list on the left, the source it opened on the right, in place of the source sheet. */
function LibrarySplit({ wide, onAdd }: { wide: boolean; onAdd: (kind: AddSourceKind) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { status, current } = useDebates();
  const userId = session?.user.id ?? null;
  const debateId = current?.id ?? null;
  // The selection belongs to the account and debate it was made in; switching either clears it.
  const [selected, setSelected] = useState<{ userId: string; debateId: string; id: string } | null>(null);
  const shown = selected && selected.userId === userId && selected.debateId === debateId ? selected.id : null;
  const listWidth = width - (wide ? SIDEBAR_WIDTH : 0) >= LIBRARY_ROOMY_WIDTH ? LIST_WIDTH.libraryRoomy : LIST_WIDTH.library;

  return (
    <View style={styles.split}>
      <ScrollView
        style={[styles.listPane, { width: listWidth, borderRightColor: colors.line }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}>
        <LibraryHeader title={t('mobile.tabs.library')} onAdd={onAdd} disabled={!debateId} />
        <OneOffNotice message="debate.oneOffActive" />
        {status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
        {status !== 'loading' && !debateId ? (
          <Card>
            <Text tone="secondary" style={styles.body}>
              {t('debate.libraryNeedsDebate')}
            </Text>
            <TextButton label={t('debate.switch')} onPress={() => router.push('/debates')} />
          </Card>
        ) : null}
        {debateId && userId ? (
          <SourceList
            key={debateId}
            debateId={debateId}
            selectedId={shown}
            onOpen={(source) => setSelected({ userId, debateId, id: source.id })}
            onRemoved={(id) => setSelected((previous) => (previous?.id === id ? null : previous))}
          />
        ) : null}
      </ScrollView>
      <ScrollView style={styles.detailPane} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.detailContent} testID={shown ? 'source-sheet' : 'source-empty'}>
        {shown && userId ? (
          <SourceView key={`${userId}:${debateId}:${shown}`} id={shown} />
        ) : (
          <View style={styles.pick}>
            <Icon name="library" color={colors.tabInactive} size={30} />
            <Text tone="faint" style={styles.body}>
              {t('mobile.library.pickSource')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SourceList({
  debateId,
  selectedId,
  onOpen,
  onRemoved,
}: {
  debateId: string;
  /** The source open beside the list on iPad. */
  selectedId?: string | null;
  /** Opens a source beside the list instead of in the source sheet. */
  onOpen?: (source: Source) => void;
  onRemoved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const loads = useRef(0);
  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    const load = ++loads.current;
    try {
      const next = await fetchSources(userId, debateId);
      if (load !== loads.current) return;
      setSources(next);
      setFailed(false);
    } catch (cause) {
      if (load !== loads.current) return;
      console.warn('Could not load sources:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [userId, debateId]);

  // Sources added on the website show up when the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeSourcesChanged(() => void load()), [load]);

  const visible = useMemo(
    () => (sources ?? []).filter((source) => (filter === 'all' || source.type === filter) && matches(source, query)),
    [sources, filter, query],
  );

  const remove = async (source: Source) => {
    if (!userId) return false;
    const confirmed = await confirmDestructive({
      title: t('libraryPage.deleteSourceTitle'),
      message: t('libraryPage.deleteSourceDesc'),
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed) return false;
    setDeleteFailed(false);
    try {
      await removeSource(userId, source.id);
      setSources((previous) => previous?.filter((item) => item.id !== source.id) ?? previous);
      onRemoved?.(source.id);
      return true;
    } catch (cause) {
      console.warn('Could not delete the source:', cause instanceof Error ? cause.message : cause);
      setDeleteFailed(true);
      return false;
    }
  };

  if (failed && !sources) {
    return (
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.loadFailed')}
        </Text>
        <TextButton label={t('common.retry')} onPress={() => void load()} />
      </Card>
    );
  }
  if (!sources) return <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />;

  return (
    <>
      <SearchField value={query} onChangeText={setQuery} placeholder={t('mobile.library.search', { count: sources.length })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={t(option.label)}
            selected={filter === option.value}
            accessibilityRole="tab"
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ScrollView>

      {deleteFailed ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {t('mobile.library.deleteFailed')}
        </Text>
      ) : null}

      {sources.length === 0 ? (
        <Card>
          <Text weight="semibold" style={styles.emptyTitle}>
            {t('libraryPage.emptyTitle')}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {t('libraryPage.emptyDesc')}
          </Text>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <Text weight="semibold" style={styles.emptyTitle}>
            {t('libraryPage.noMatchingSources')}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {t('libraryPage.noMatchingSourcesDesc')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {visible.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              first={index === 0}
              selected={selectedId === source.id}
              onOpen={() => (onOpen ? onOpen(source) : router.push({ pathname: '/source/[id]', params: { id: source.id } }))}
              onDelete={() => remove(source)}
            />
          ))}
        </Card>
      )}
    </>
  );
}

/** A source row; swipe left to delete, with a confirmation, as on iOS. */
function SourceRow({
  source,
  first,
  selected = false,
  onOpen,
  onDelete,
}: {
  source: Source;
  first: boolean;
  selected?: boolean;
  onOpen: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);

  const remove = async () => {
    const removed = await onDelete();
    if (!removed) swipeable.current?.close();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={!first && { borderTopWidth: 1, borderTopColor: colors.line }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('libraryPage.deleteSourceLabel', { title: source.title })}
          onPress={() => void remove()}
          style={[styles.deleteAction, { backgroundColor: colors.destructive }]}>
          <Icon name="trash" color="#ffffff" size={20} />
          <Text weight="semibold" style={styles.deleteLabel}>
            {t('common.delete')}
          </Text>
        </Pressable>
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={selected ? { selected } : undefined}
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') void remove();
        }}
        onPress={onOpen}
        testID="source-row"
        style={({ pressed }) => [styles.row, { backgroundColor: selected ? colors.tile : colors.card }, pressed && styles.pressed]}>
        <IconTile name={SOURCE_ICONS[source.type]} size={42} />
        <View style={styles.rowText}>
          <Text weight="semibold" style={[styles.rowTitle, selected && { color: colors.chipSelectedForeground }]} numberOfLines={1}>
            {source.title || t('libraryPage.untitledSource')}
          </Text>
          <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
            {sourceMeta(t, source)}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 32 },
  body: { fontSize: 15, lineHeight: 21 },
  emptyTitle: { fontSize: 17 },
  chipRow: { marginHorizontal: -20, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 20 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  pressed: { opacity: 0.7 },
  deleteAction: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 3 },
  deleteLabel: { color: '#ffffff', fontSize: 13 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  detailPane: { flex: 1 },
  detailContent: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 36, paddingTop: 14, paddingBottom: 48, gap: 14 },
  pick: { alignItems: 'center', gap: 10, paddingTop: 120 },
});
