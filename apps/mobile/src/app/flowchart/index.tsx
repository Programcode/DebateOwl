import { starterFlowchart, type FlowNode } from '@debatelab/core/flowchart';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runRequest } from '@/lib/run-request';
import { ActionMenu } from '@/components/action-menu';
import { TextButton } from '@/components/buttons';
import { ClaimInspector } from '@/components/claim-panel';
import { DocumentHeader, type HeaderAction } from '@/components/document-header';
import { FlowColumnsView, FlowLegend, MapTreeView } from '@/components/flowchart-views';
import { Icon } from '@/components/icon';
import { OfflineNotice } from '@/components/offline-notice';
import { OneOffNotice } from '@/components/one-off-notice';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useLatest } from '@/lib/live-value';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { confirmDestructive, promptText } from '@/lib/confirm';
import { formatWhen } from '@/lib/dates';
import { useDebates } from '@/lib/debate-context';
import { copyText, sharePdf } from '@/lib/export';
import { FLOWCHART_EXPORT_FILE_NAME, flowchartExportHtml } from '@/lib/export-html';
import {
  findDraft,
  findSavedDraft,
  forgetDraft,
  newDraft,
  openDraft,
  savedDraft,
  scopeKey,
  showDraft,
  updateDraft,
  useFlowchartDrafts,
  type FlowchartDraft,
} from '@/lib/flowchart-drafts';
import { flowchartToText } from '@/lib/flowchart-text';
import { deleteFlowchart, fetchFlowchart, fetchFlowchartList, flowchartScreenCopies, insertFlowchart, updateFlowchart } from '@/lib/flowcharts';
import { PANE_WIDTH, useLayoutClass } from '@/lib/layout';
import { openClaim } from '@/lib/open-pane';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';

const NOTICE_MS = 3500;

/**
 * The website's Flowchart in mock A's phone look: the Current Debate's newest
 * saved map (or the starter map), as role columns (Flow) or a tree (Map).
 * Tapping a card opens its claim sheet, or on iPad its claim docked beside the
 * map (iPad mock C); "+" adds a card; "..." saves, saves as, deletes and
 * exports. Edits stay in session memory until saved.
 */
export default function FlowchartScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ from?: string; id?: string; built?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { activeDebateId, oneOff } = useDebates();
  useFlowchartDrafts();

  const [view, setView] = useState<'flow' | 'map'>('flow');
  // A saved map opened from a list; once it is deleted the screen follows the Current Debate again.
  const [requestedId, setRequestedId] = useState<string | null>(params.id ?? null);
  // The debate the requested map was found in, for that map only.
  const [found, setFound] = useState<{ id: string; scope: string } | null>(null);
  const scope = requestedId && found?.id === requestedId ? found.scope : requestedId ? null : scopeKey(activeDebateId);
  const [failure, setFailure] = useState<{ scope: string | null; kind: 'failed' | 'missing' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<'export' | null>(null);
  const [notice, setNoticeState] = useState('');
  const layout = useLayoutClass();
  // The card docked in the iPad inspector, with the account and map it was opened on.
  const [claim, setClaim] = useState<{ userId: string; scope: string; map: string; node: string } | null>(null);

  const live = useRef(true);
  const owner = useLatest(userId);
  const copies = useCopyHolder(flowchartScreenCopies);
  const loads = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tRef = useLatest(t);

  useEffect(() => () => {
    live.current = false;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const setNotice = useCallback((text: string) => {
    if (!live.current) return;
    setNoticeState(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      if (live.current) setNoticeState('');
    }, NOTICE_MS);
  }, []);

  // A case built into a map says so once, as the website's toast does.
  const built = params.built === '1';
  useEffect(() => {
    if (built) setNotice(t('flowchart.builtFromCase'));
  }, [built, setNotice, t]);

  // Open the requested map, or the debate's newest saved map, or the starter map. A map
  // already held this session opens as it was left. Only the latest load may land.
  useEffect(() => {
    const request = ++loads.current;
    if (!userId) return;
    const forUser = userId;
    const isCurrent = () => loads.current === request && live.current && owner.current === forUser;
    const mark = copies.mark();
    setFailure(null);
    const run = async () => {
      if (requestedId) {
        const held = findSavedDraft(requestedId);
        if (held) {
          showDraft(held.scope, held.draft);
          setFound({ id: requestedId, scope: held.scope });
          return;
        }
        const row = await fetchFlowchart(forUser, requestedId, mark);
        if (!isCurrent()) return;
        if (!row) {
          setFailure({ scope: null, kind: 'missing' });
          return;
        }
        const target = scopeKey(row.debateId);
        showDraft(target, savedDraft(row));
        setFound({ id: requestedId, scope: target });
        return;
      }
      const target = scopeKey(activeDebateId);
      if (openDraft(target)) return;
      const list = await fetchFlowchartList(forUser, activeDebateId, mark);
      if (!isCurrent() || openDraft(target)) return;
      const row = list.length > 0 ? await fetchFlowchart(forUser, list[0].id, mark) : null;
      if (!isCurrent() || openDraft(target)) return;
      showDraft(target, row ? savedDraft(row) : newDraft(activeDebateId, starterFlowchart(tRef.current)));
    };
    run().catch((cause: unknown) => {
      if (!isCurrent()) return;
      console.warn('Could not load flowcharts:', cause instanceof Error ? cause.message : cause);
      setFailure({ scope: requestedId ? null : scopeKey(activeDebateId), kind: 'failed' });
    });
  }, [userId, activeDebateId, requestedId, attempt, copies, owner, tRef]);

  const open = scope ? openDraft(scope) : null;
  const draft = open?.draft ?? null;
  const back = backLabel(t, params.from, 'prepare');
  const mapTitle = draft?.title || t('mobile.flowchart.untitled');

  const openCard = (node: FlowNode) => {
    if (!scope || !open) return;
    if (layout !== 'phone') {
      if (userId) setClaim({ userId, scope, map: open.draft.handle, node: node.id });
      return;
    }
    router.push({ pathname: '/flowchart/claim', params: { scope, map: open.draft.handle, node: node.id } });
  };
  const mapHandle = open?.draft.handle ?? null;
  // Switching maps, debates or accounts drops the docked card, so coming back does not reopen it.
  // A narrower window only hides it; widening again keeps the card the student had open.
  useEffect(() => {
    setClaim((current) => openClaim(current, { userId, scope, map: mapHandle }));
  }, [userId, scope, mapHandle]);
  const docked = layout !== 'phone' ? openClaim(claim, { userId, scope, map: mapHandle }) : null;

  /** Runs a save or delete for the map on screen, as the account and map were when the student chose it. */
  const act = async (work: (forUser: string, at: { scope: string; key: string; draft: FlowchartDraft }) => Promise<void>) => {
    if (!userId || !scope || !open || busy) return;
    setBusy(true);
    return await runRequest(async () => {
      await work(userId, { scope, key: open.key, draft: open.draft });
    }, undefined, () => {
      if (live.current) setBusy(false);
    });
  };

  const askTitle = (defaultValue: string) =>
    promptText({
      title: t('flowchart.saveFlowchartDialog'),
      message: t('flowchart.saveFlowchartDialogDesc'),
      defaultValue,
      confirm: t('flowchart.saveFlowchart'),
      cancel: t('common.cancel'),
    });

  /** The website's Save: a new row in the map's debate. The held map becomes that row. */
  const saveNew = (forUser: string, at: { scope: string; key: string; draft: FlowchartDraft }, title: string) =>
    insertFlowchart(forUser, { title, debateId: at.draft.debateId, doc: at.draft.doc }).then((row) => {
      if (owner.current !== forUser) return;
      const saved = savedDraft(row);
      // The held map becomes the new row; the map it was saved from (if any) goes back to its saved
      // state. Edits made while it saved stay held and unsaved, and the map on screen stays on screen.
      // It is found by its handle, because a new map started meanwhile takes the unsaved map's key.
      const now = findDraft(at.scope, at.draft.handle);
      if (now) updateDraft(at.scope, now.key, (current) => (current.doc === at.draft.doc ? saved : { ...saved, doc: current.doc, edited: true }));
      // A list-opened screen follows the new row only while that map is still the one on screen; a map chosen meanwhile stays.
      if (now && requestedId && openDraft(at.scope)?.draft.handle === at.draft.handle) {
        setFound({ id: row.id, scope: at.scope });
        setRequestedId(row.id);
      }
      setNotice(t('flowchart.savedToast'));
    });

  const save = () =>
    void act(async (forUser, at) => {
      return await runRequest(async () => {
        if (!at.draft.savedId) {
          const title = (await askTitle(''))?.trim();
          if (!title || owner.current !== forUser) return;
          await saveNew(forUser, at, title);
          return;
        }
        const done = await updateFlowchart(forUser, at.draft.savedId, at.draft.doc);
        if (owner.current !== forUser) return;
        if (!done) {
          setNotice(t('mobile.flowchart.missing'));
          return;
        }
        updateDraft(at.scope, at.key, (current) => ({ ...current, edited: current.doc !== at.draft.doc }));
        setNotice(t('flowchart.savedToast'));
      }, async (cause) => {
        console.warn('Could not save the flowchart:', cause instanceof Error ? cause.message : cause);
        setNotice(t('flowchart.saveFailedToast'));
      });
    });

  const saveAs = () =>
    void act(async (forUser, at) => {
      const title = (await askTitle(at.draft.title))?.trim();
      if (!title || owner.current !== forUser) return;
      return await runRequest(async () => {
        await saveNew(forUser, at, title);
      }, async (cause) => {
        console.warn('Could not save the flowchart:', cause instanceof Error ? cause.message : cause);
        setNotice(t('flowchart.saveFailedToast'));
      });
    });

  const remove = () =>
    void act(async (forUser, at) => {
      const savedId = at.draft.savedId;
      if (!savedId) return;
      const confirmed = await confirmDestructive({
        title: t('mobile.flowchart.deleteMapTitle'),
        message: t('mobile.flowchart.deleteMapDesc', { title: at.draft.title }),
        confirm: t('common.delete'),
        cancel: t('common.cancel'),
      });
      if (!confirmed || owner.current !== forUser) return;
      return await runRequest(async () => {
        await deleteFlowchart(forUser, savedId);
        if (owner.current !== forUser) return;
        forgetDraft(at.scope, at.key);
        setNotice(t('flowchart.deletedNamed', { title: at.draft.title }));
        // The screen then opens the debate's next newest map, or the starter map.
        if (requestedId) setRequestedId(null);
        else setAttempt((n) => n + 1);
      }, async (cause) => {
        console.warn('Could not delete the flowchart:', cause instanceof Error ? cause.message : cause);
        setNotice(t('flowchart.deleteFailedToast'));
      });
    });

  const runExport = (work: () => Promise<void>) => {
    work().catch((cause: unknown) => {
      console.warn('Export failed:', cause instanceof Error ? cause.message : cause);
      setNotice(t('flowchart.exportFailedToast'));
    });
  };

  const actions: HeaderAction[] = draft
    ? [
        { key: 'save', label: t('flowchart.save'), symbol: 'square.and.arrow.down', icon: 'download', onPress: save },
        { key: 'save-as', label: t('mobile.flowchart.saveAs'), symbol: 'plus.square.on.square', icon: 'copy', onPress: saveAs },
        { key: 'maps', label: t('flowchart.savedFlowcharts'), symbol: 'folder', icon: 'list', onPress: () => scope && router.push({ pathname: '/flowchart/maps', params: { scope } }) },
        { key: 'export', label: t('common.export'), symbol: 'square.and.arrow.up', icon: 'share', onPress: () => setMenu('export') },
        ...(draft.savedId
          ? [{ key: 'delete', label: t('mobile.flowchart.deleteMap'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: remove }]
          : []),
      ]
    : [];

  const shownFailure = failure && failure.scope === (requestedId ? null : scopeKey(activeDebateId)) ? failure.kind : null;

  const header = (
    <DocumentHeader
      backLabel={back}
      actions={actions}
      buttons={draft && scope && open ? [{ key: 'add', label: t('flowchart.addNode'), symbol: 'plus', icon: 'plus', onPress: () => router.push({ pathname: '/flowchart/card', params: { scope, map: open.draft.handle } }) }] : []}
    />
  );
  const page = (
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.head}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('nav.flowchart')}
        </Text>
        {draft && scope ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('flowchart.savedFlowcharts')}: ${mapTitle}`}
            onPress={() => router.push({ pathname: '/flowchart/maps', params: { scope } })}
            style={({ pressed }) => [styles.mapRow, pressed && styles.pressed]}
            testID="flowchart-maps">
            <View style={styles.mapText}>
              <Text weight="semibold" style={styles.mapTitle} numberOfLines={1}>
                {mapTitle}
              </Text>
              <Text tone="faint" style={styles.mapMeta} numberOfLines={1}>
                {draft.edited
                  ? t('mobile.flowchart.edited')
                  : draft.createdAt
                    ? t('mobile.flowchart.savedWhen', { when: formatWhen(draft.createdAt) })
                    : t('mobile.flowchart.notSaved')}
              </Text>
            </View>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name="chevronDown" color={colors.primary} size={20} />}
          </Pressable>
        ) : null}
        {oneOff ? <OneOffNotice /> : null}
        <OfflineNotice />
        <SegmentedControl
          options={[
            { value: 'flow', label: t('mobile.flowchart.flow') },
            { value: 'map', label: t('mobile.flowchart.map') },
          ]}
          value={view}
          onChange={setView}
        />
      </View>
      {draft ? (
        view === 'flow' ? (
          <>
            <FlowLegend />
            <FlowColumnsView doc={draft.doc} onOpen={openCard} selectedId={docked?.node} />
          </>
        ) : (
          <MapTreeView doc={draft.doc} onOpen={openCard} selectedId={docked?.node} />
        )
      ) : shownFailure ? (
        <View style={styles.state}>
          <Text tone="secondary" style={styles.stateText}>
            {shownFailure === 'missing' ? t('mobile.flowchart.mapMissing') : t('mobile.flowchart.loadFailed')}
          </Text>
          {shownFailure === 'missing' ? (
            <TextButton label={t('mobile.flowchart.openLatest')} onPress={() => setRequestedId(null)} />
          ) : (
            <TextButton label={t('common.retry')} onPress={() => setAttempt((n) => n + 1)} />
          )}
        </View>
      ) : (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      )}
    </ScrollView>
  );
  const toast = notice ? (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, { bottom: Math.max(insets.bottom, 14) + 8, backgroundColor: colors.foreground }]}
      testID="document-notice">
      <Text style={[styles.noticeText, { color: colors.background }]}>{notice}</Text>
    </View>
  ) : null;
  const exportMenu = (
    <ActionMenu
      visible={menu === 'export'}
      title={t('common.export')}
      testID="export-menu"
      items={[
        { key: 'pdf', label: t('common.pdf'), icon: 'file' },
        { key: 'copy', label: t('mobile.results.copyText'), icon: 'copy' },
      ]}
      cancelLabel={t('common.cancel')}
      onClose={() => setMenu(null)}
      onSelect={(choice) => {
        if (!draft) return;
        const meta = t('mobile.debate.itemMeta', { kind: t('debate.kinds.flowchart'), when: formatWhen(draft.createdAt ?? Date.now()) });
        if (choice === 'pdf') runExport(() => sharePdf(flowchartExportHtml(mapTitle, meta, draft.doc, t), FLOWCHART_EXPORT_FILE_NAME, mapTitle));
        if (choice === 'copy')
          runExport(async () => {
            await copyText(flowchartToText(mapTitle, draft.doc, t));
            setNotice(t('generateResults.copiedToClipboard'));
          });
      }}
    />
  );

  if (layout !== 'phone') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]} testID="flowchart-screen">
        {header}
        <View style={styles.split}>
          <View style={styles.canvas}>
            {page}
            {toast}
          </View>
          {docked ? <ClaimInspector claim={docked} width={PANE_WIDTH[layout]} onClose={() => setClaim(null)} /> : null}
        </View>
        {exportMenu}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="flowchart-screen">
      {header}
      {page}
      {toast}
      {exportMenu}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  canvas: { flex: 1 },
  content: { paddingTop: 4, gap: 14 },
  head: { paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: 980, alignSelf: 'center' },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -0.9 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -6 },
  mapText: { flex: 1, gap: 1 },
  mapTitle: { fontSize: 16.5, lineHeight: 22 },
  mapMeta: { fontSize: 13.5, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
  stateText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  notice: { position: 'absolute', left: 24, right: 24, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, alignSelf: 'center', maxWidth: 560 },
  noticeText: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
});
