import { GENERAL_FOLDER, matchesLibrarySearch, normalizeFolder, sortLibrarySources, type LibrarySort } from '@debatelab/core/library';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { LibraryHeader } from '@/components/library-header';
import type { AddSourceKind, SourceTypeFilter } from '@/components/library-options';
import { FolderBar, GroundingBanner } from '@/components/library-parts';
import { OfflineNotice } from '@/components/offline-notice';
import { OneOffNotice } from '@/components/one-off-notice';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { folderLabel } from '@/components/source-display';
import { SourceRow } from '@/components/source-row';
import { SourceView } from '@/components/source-view';
import { Text } from '@/components/text';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { confirmDestructive, promptText } from '@/lib/confirm';
import { useDebates } from '@/lib/debate-context';
import { haptics } from '@/lib/haptics';
import { LIBRARY_ROOMY_WIDTH, LIST_WIDTH, useContentWidth, useLayoutClass } from '@/lib/layout';
import { openRowId } from '@/lib/open-pane';
import { pickSourceFile } from '@/lib/pick-source-file';
import { useSourceActions } from '@/lib/source-actions';
import { holdPickedFile } from '@/lib/source-file';
import { clearLibrary, createFolder, deleteFolder, fetchSources, renameFolder, subscribeSourcesChanged, type Source } from '@/lib/sources';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useLibraryFolders } from '@/lib/use-library-folders';
import { useTheme } from '@/theme/use-theme';

const ALL = '\u0000all';

/**
 * The Current Debate's sources, as in mock 04, with the website's Library
 * around them: folders, the Active switch, sorting, file import and Clear all.
 * It shows the Current Debate even in one-off mode, like the website.
 * On iPad the list and the open source sit side by side (iPad mock A).
 */
export default function LibraryScreen() {
  const { current } = useDebates();
  const layout = useLayoutClass();
  const debateId = current?.id ?? null;
  // A new debate starts with a fresh list, folder and search.
  return <LibraryView key={debateId ?? 'none'} debateId={debateId} layout={layout} />;
}

function LibraryView({ debateId, layout }: { debateId: string | null; layout: ReturnType<typeof useLayoutClass> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const width = useContentWidth();
  const { session } = useAuth();
  const { status } = useDebates();
  const userId = session?.user.id ?? null;
  const library = useLibrary(debateId);
  // On iPad the selection belongs to the account it was made in; signing out clears it.
  const [selected, setSelected] = useState<{ userId: string; id: string } | null>(null);
  const shown = layout !== 'phone' && selected && selected.userId === userId ? selected.id : null;

  // A refresh that no longer has the open source closes the detail pane. Searching does not: `sources` is the full list.
  useEffect(() => {
    if (!shown || library.sources === null) return;
    if (openRowId(shown, library.sources) === null) setSelected(null);
  }, [shown, library.sources]);

  const onAdd = async (kind: AddSourceKind) => {
    if (kind === 'link') return router.push('/add-link');
    if (kind === 'note') return router.push('/new-note');
    const asset = await pickSourceFile().catch((cause: unknown) => {
      console.warn('Could not open the file picker:', cause instanceof Error ? cause.message : cause);
      return null;
    });
    if (asset) router.push({ pathname: '/add-file', params: { file: holdPickedFile(asset) } });
  };

  const newFolder = async () => {
    if (!userId) return;
    const name = (await promptText({ title: t('libraryPage.newFolder'), message: '', defaultValue: '', confirm: t('libraryPage.createFolder'), cancel: t('common.cancel') }))?.trim();
    if (!name) return;
    try {
      const folder = await createFolder(userId, name);
      library.setFolder(folder);
      toast({ tone: 'success', title: t('libraryPage.newFolder'), message: folderLabel(t, folder) });
    } catch {
      toast({ tone: 'error', title: t('libraryPage.saveFailed') });
    }
  };

  const clearAll = async () => {
    if (!userId || !debateId) return;
    const confirmed = await confirmDestructive({ title: t('libraryPage.clearAll'), message: t('libraryPage.clearConfirm'), confirm: t('libraryPage.clearAll'), cancel: t('common.cancel') });
    if (!confirmed) return;
    try {
      await clearLibrary(userId, debateId);
      setSelected(null);
      library.setSources([]);
      toast({ tone: 'success', title: t('common.deleted'), message: t('libraryPage.clearSuccess') });
    } catch {
      toast({ tone: 'error', title: t('common.error'), message: t('libraryPage.clearFailed') });
    }
  };

  const header = (
    <LibraryHeader
      title={t('mobile.tabs.library')}
      onAdd={(kind) => void onAdd(kind)}
      disabled={!debateId}
      sort={library.sort}
      onSort={(sort) => {
        haptics.select();
        library.setSort(sort);
      }}
      filter={library.filter}
      onFilter={(filter) => {
        haptics.select();
        library.setFilter(filter);
      }}
      onNewFolder={() => void newFolder()}
      onClearAll={() => void clearAll()}
      canClear={(library.sources?.length ?? 0) > 0}
    />
  );
  const noDebate = status !== 'loading' && !debateId ? (
    <Card>
      <Text tone="secondary" style={styles.body}>
        {t('debate.libraryNeedsDebate')}
      </Text>
      <TextButton label={t('debate.switch')} onPress={() => router.push('/debates')} />
    </Card>
  ) : null;
  const body = debateId ? (
    <LibraryBody library={library} selectedId={shown} onSelect={layout === 'phone' || !userId ? undefined : (source) => setSelected({ userId, id: source.id })} />
  ) : null;

  if (layout === 'phone') {
    return (
      <Screen>
        {header}
        {/* New sources still go to the Current Debate in one-off mode, as on the website, so this only says the mode is on. */}
        <OneOffNotice message="debate.oneOffActive" />
        {status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
        {noDebate}
        {body}
      </Screen>
    );
  }

  const available = width;
  // With nothing open the list takes the whole width, as the website's Library does; an open
  // source splits it, and the list keeps 40% (at least its usual width) so titles stay readable.
  const listWidth = Math.max(available >= LIBRARY_ROOMY_WIDTH ? LIST_WIDTH.libraryRoomy : LIST_WIDTH.library, Math.round(available * 0.4));
  return (
    <View style={styles.split}>
      <ScrollView
        style={shown ? [styles.listPane, { width: listWidth, borderRightColor: colors.line }] : styles.listPaneFull}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.listContent, !shown && styles.listContentFull]}>
        <OfflineNotice />
        {header}
        <OneOffNotice message="debate.oneOffActive" />
        {status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
        {noDebate}
        {body}
      </ScrollView>
      {shown && userId ? (
        <ScrollView style={styles.detailPane} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.detailContent} testID="source-sheet">
          <SourceView key={`${userId}:${debateId}:${shown}`} id={shown} onRemoved={() => setSelected(null)} />
        </ScrollView>
      ) : null}
    </View>
  );
}

type Library = ReturnType<typeof useLibrary>;

/** One debate's sources and folders, with the website's search, folder filter and sort, kept while the tab is open. */
function useLibrary(debateId: string | null) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [sources, setSources] = useState<Source[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceTypeFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('smart');
  const [folder, setFolder] = useState<string>(ALL);
  const { folders } = useLibraryFolders(debateId);
  const loads = useRef(0);
  const copies = useCopyHolder();

  const load = useCallback(async () => {
    if (!userId || !debateId) return;
    const load = ++loads.current;
    try {
      const next = await fetchSources(userId, debateId, copies.mark());
      if (load !== loads.current) return;
      setSources(next);
      setFailed(false);
    } catch (cause) {
      if (load !== loads.current) return;
      console.warn('Could not load sources:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [userId, debateId, copies]);

  // Sources added on the website show up when the tab comes back into view.
  // Out of view, its saved copies no longer count for the offline notice.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => copies.release();
    }, [load, copies]),
  );
  useEffect(() => subscribeSourcesChanged(() => void load()), [load]);

  // A folder that no longer exists here (renamed or deleted elsewhere, or only another debate's)
  // shows all folders again. Checked only when the folder list reloads: a folder just created or
  // renamed here is chosen before its reload lands, and the reload then lists it.
  const chosen = useRef(folder);
  chosen.current = folder;
  useEffect(() => {
    if (chosen.current !== ALL && !folders.includes(chosen.current)) setFolder(ALL);
  }, [folders]);

  const inFolder = useMemo(
    () => (sources ?? []).filter((source) => folder === ALL || normalizeFolder(source.folder) === folder),
    [sources, folder],
  );
  const visible = useMemo(
    () => sortLibrarySources(inFolder.filter((source) => (filter === 'all' || source.type === filter) && matchesLibrarySearch(source, query)), sort),
    [inFolder, filter, query, sort],
  );

  /** Shows a change at once; `undo` puts the rows back when the write fails. */
  const patch = useCallback((ids: string[], change: Partial<Source>) => {
    setSources((previous) => previous?.map((source) => (ids.includes(source.id) ? { ...source, ...change } : source)) ?? previous);
  }, []);

  return { userId, debateId: debateId!, sources, setSources, failed, load, query, setQuery, filter, setFilter, sort, setSort, folder, setFolder, folders, inFolder, visible, patch };
}

function LibraryBody({ library, selectedId, onSelect }: { library: Library; selectedId: string | null; onSelect?: (source: Source) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const actions = useSourceActions();
  const activeWrites = useRef({ seq: 0, latest: new Map<string, number>(), confirmed: new Map<string, boolean>() });
  const { sources, failed, folders, folder, inFolder, visible, patch, userId, debateId } = library;

  if (failed && !sources) {
    return (
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.loadFailed')}
        </Text>
        <TextButton label={t('common.retry')} onPress={() => void library.load()} />
      </Card>
    );
  }
  if (!sources) return <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />;

  const active = sources.filter((source) => source.isActive).length;
  const chipFolders = Array.from(new Set([...folders, ...sources.map((source) => source.folder)])).sort();

  // The newest change to each source decides what shows, as the website's switch queue does: a
  // failure that a newer tap already replaced changes nothing, and otherwise the row goes back to
  // the last value the server accepted, not to what showed when it was tapped.
  const toggle = async (targets: Source[], isActive: boolean, inFolderName?: string) => {
    const writes = activeWrites.current;
    const seq = ++writes.seq;
    const ids = targets.map((source) => source.id);
    for (const source of targets) {
      if (!writes.confirmed.has(source.id)) writes.confirmed.set(source.id, source.isActive);
      writes.latest.set(source.id, seq);
    }
    patch(ids, { isActive });
    const saved = await actions.setActive(targets, isActive, inFolderName);
    const back = new Map<string, boolean>();
    for (const id of ids) {
      if (saved) writes.confirmed.set(id, isActive);
      if (writes.latest.get(id) !== seq) continue;
      writes.latest.delete(id);
      if (!saved) back.set(id, writes.confirmed.get(id) ?? !isActive);
      writes.confirmed.delete(id);
    }
    if (back.size > 0) library.setSources((previous) => previous?.map((source) => (back.has(source.id) ? { ...source, isActive: back.get(source.id)! } : source)) ?? previous);
  };

  const remove = async (source: Source) => {
    const removed = await actions.remove(source);
    if (removed) library.setSources((previous) => previous?.filter((item) => item.id !== source.id) ?? previous);
    return removed;
  };

  const rename = async () => {
    if (!userId || folder === ALL || folder === GENERAL_FOLDER) return;
    const next = (await promptText({ title: t('libraryPage.renameFolder'), message: t('mobile.library.renamePrompt'), defaultValue: folder, confirm: t('common.save'), cancel: t('common.cancel') }))?.trim();
    if (!next || next === folder) return;
    // Merging into an existing folder can't be split again, so it asks first.
    if (chipFolders.includes(next)) {
      const merge = await confirmDestructive({ title: t('libraryPage.mergeFolderTitle', { name: folderLabel(t, next) }), message: t('libraryPage.folderMergeConfirm'), confirm: t('libraryPage.mergeFolders'), cancel: t('common.cancel') });
      if (!merge) return;
    }
    try {
      await renameFolder(userId, debateId, folder, next);
      library.setFolder(next);
      toast({ tone: 'success', title: t('libraryPage.folderRenamed'), message: t('libraryPage.folderRenamedDesc') });
    } catch {
      toast({ tone: 'error', title: chipFolders.includes(next) ? t('libraryPage.mergeFailed') : t('libraryPage.folderUpdateFailed') });
    }
  };

  const removeFolder = async () => {
    if (!userId || folder === ALL || folder === GENERAL_FOLDER) return;
    const confirmed = await confirmDestructive({ title: t('libraryPage.deleteFolderTitle'), message: t('libraryPage.deleteFolderDesc'), confirm: t('common.delete'), cancel: t('common.cancel') });
    if (!confirmed) return;
    try {
      await deleteFolder(userId, debateId, folder);
      library.setFolder(GENERAL_FOLDER);
      toast({ tone: 'success', title: t('libraryPage.folderDeleted'), message: t('libraryPage.folderDeletedDesc') });
    } catch {
      toast({ tone: 'error', title: t('libraryPage.folderUpdateFailed') });
    }
  };

  return (
    <>
      <Text tone="secondary" style={styles.summary} testID="library-summary">
        {t('libraryPage.summary', {
          sources: t('libraryPage.sourceCount', { count: sources.length }),
          active: t('libraryPage.activeCount', { count: active }),
          folders: t('libraryPage.folderCount', { count: chipFolders.length }),
        })}
      </Text>
      {sources.length > 0 ? <GroundingBanner active={active > 0} /> : null}
      <SearchField value={library.query} onChangeText={library.setQuery} placeholder={t('mobile.library.search', { count: sources.length })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow} accessibilityLabel={t('libraryPage.folder')}>
        {[ALL, ...chipFolders].map((option) => (
          <Chip
            key={option}
            label={option === ALL ? t('libraryPage.allFolders') : folderLabel(t, option)}
            icon={option === ALL ? undefined : 'folder'}
            selected={folder === option}
            accessibilityRole="tab"
            testID="folder-chip"
            onPress={() => library.setFolder(option)}
          />
        ))}
      </ScrollView>
      {folder !== ALL ? (
        <FolderBar
          folder={folder}
          sources={inFolder}
          onSetActive={(isActive) => void toggle(inFolder, isActive, folder)}
          onRename={() => void rename()}
          onDelete={() => void removeFolder()}
        />
      ) : null}

      {sources.length === 0 ? (
        <EmptyState pose="reading" title={t('libraryPage.emptyTitle')} description={t('libraryPage.emptyDesc')} />
      ) : visible.length === 0 ? (
        <EmptyState pose="surprised" title={t('libraryPage.noMatchingSources')} description={t('libraryPage.noMatchingSourcesDesc')} />
      ) : (
        <Card style={styles.list}>
          {visible.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              folders={chipFolders}
              first={index === 0}
              selected={selectedId === source.id}
              selectInstead={Boolean(onSelect)}
              showFolder={folder === ALL}
              compact={Boolean(selectedId)}
              actions={{
                onOpen: () => (onSelect ? onSelect(source) : router.push({ pathname: '/source/[id]', params: { id: source.id } })),
                onToggle: (isActive) => void toggle([source], isActive),
                onDelete: () => remove(source),
                onCopy: () => void actions.copy(source),
                onShare: () => actions.share(source),
                onMove: (target) => {
                  patch([source.id], { folder: target });
                  void actions.move(source, target).then((moved) => {
                    if (!moved) patch([source.id], { folder: source.folder });
                  });
                },
              }}
            />
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 32 },
  body: { fontSize: 15, lineHeight: 21 },
  summary: { fontSize: 14.5, marginHorizontal: 2, marginTop: -6 },
  chipRow: { marginHorizontal: -20, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 20 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  listPaneFull: { flex: 1 },
  listContentFull: { width: '100%', maxWidth: 880, alignSelf: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  detailPane: { flex: 1 },
  detailContent: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 36, paddingTop: 14, paddingBottom: 48, gap: 14 },
});
