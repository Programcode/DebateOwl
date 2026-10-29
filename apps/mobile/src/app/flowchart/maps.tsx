import { starterFlowchart } from '@debatelab/core/flowchart';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { runRequest } from '@/lib/run-request';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { ListItemIn, SkeletonTextRows } from '@/components/card';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/press-scale';
import { useRowArrivals } from '@/components/list-screen';
import { SheetList } from '@/components/sheet';
import { Text } from '@/components/text';
import { useLatest } from '@/lib/live-value';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { formatRelativeDate } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { getDraft, NEW_MAP, newDraft, openDraft, savedDraft, scopeDebateId, showDraft, useFlowchartDrafts } from '@/lib/flowchart-drafts';
import { fetchFlowchart, fetchFlowchartList, flowchartScreenCopies, type FlowchartSummary } from '@/lib/flowcharts';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { keepIfSame } from '@/lib/keep-if-same';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * The website's Saved Flowcharts list as a form sheet: the debate's saved
 * maps (or one-off maps), newest first, plus starting a new map from the
 * starter. A map opened this session comes back with its unsaved edits.
 */
export default function SavedMapsSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { scope } = useLocalSearchParams<{ scope: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  useFlowchartDrafts();
  const debateId = scopeDebateId(scope ?? 'one-off');
  const [list, setList] = useState<{ for: string; items: FlowchartSummary[] | null; failed: boolean } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [failedOpen, setFailedOpen] = useState(false);
  const loads = useRef(0);
  const copies = useCopyHolder();
  // Only the latest tap may open a map; an earlier one still loading is dropped.
  const selections = useRef(0);
  const live = useRef(true);
  const owner = useLatest(userId);

  useEffect(() => () => {
    live.current = false;
  }, []);

  const load = useCallback(async () => {
    const request = ++loads.current;
    if (!userId || !scope) return;
    const forUser = userId;
    const forScope = scope;
    const isCurrent = () => loads.current === request && live.current && owner.current === forUser;
    return await runRequest(async () => {
      const items = await fetchFlowchartList(forUser, debateId, copies.mark());
      if (isCurrent()) setList((previous) => keepIfSame(previous, { for: `${forUser}:${forScope}`, items, failed: false }));
    }, async (cause) => {
      console.warn('Could not load saved flowcharts:', cause instanceof Error ? cause.message : cause);
      if (isCurrent()) setList((previous) => (previous?.for === `${forUser}:${forScope}` && previous.items ? previous : { for: `${forUser}:${forScope}`, items: null, failed: true }));
    });
  }, [debateId, scope, userId, copies, owner]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = list && list.for === `${userId}:${scope}` ? list : null;
  const open = scope ? openDraft(scope) : null;
  const unsaved = scope ? getDraft(scope, NEW_MAP) : undefined;
  const background = scheme === 'dark' ? colors.card : colors.input;

  const choose = async (item: FlowchartSummary, index: number) => {
    if (!scope || !userId) return;
    const selection = ++selections.current;
    const held = getDraft(scope, item.id);
    if (held) {
      showDraft(scope, held);
      router.back();
      return;
    }
    const forUser = userId;
    setOpening(index);
    setFailedOpen(false);
    return await runRequest(async () => {
      // The map shows on the Flowchart screen once this sheet closes, so it counts there.
      const row = await fetchFlowchart(forUser, item.id, flowchartScreenCopies.mark());
      if (!live.current || owner.current !== forUser || selections.current !== selection) return;
      if (!row) {
        setFailedOpen(true);
        void load();
        return;
      }
      showDraft(scope, savedDraft(row));
      router.back();
    }, async (cause) => {
      console.warn('Could not open the flowchart:', cause instanceof Error ? cause.message : cause);
      if (live.current && selections.current === selection) setFailedOpen(true);
    }, () => {
      if (live.current && selections.current === selection) setOpening(null);
    });
  };

  const startNew = async () => {
    if (!scope) return;
    if (unsaved?.edited) {
      const confirmed = await confirmDestructive({
        title: t('mobile.flowchart.discardTitle'),
        message: t('mobile.flowchart.discardDesc'),
        confirm: t('mobile.flowchart.startNew'),
        cancel: t('common.cancel'),
      });
      if (!confirmed || !live.current) return;
    }
    selections.current += 1;
    showDraft(scope, newDraft(debateId, starterFlowchart(t)), { replace: true });
    router.back();
  };

  const items = shown?.items ?? [];
  const rows = [...(unsaved ? [{ key: NEW_MAP, item: null }] : []), ...items.map((item) => ({ key: item.id, item }))];
  const arrivals = useRowArrivals(rows.map((entry) => entry.key));

  const row = (key: string, title: string, meta: string, selected: boolean, onPress: () => void, index: number, busy = false) => (
    <ListItemIn key={key} index={index} enter={arrivals.entersNow(key)} style={index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }}>
      <PressScale
        accessibilityRole="button"
        // While a map opens, the rows wait for it.
        accessibilityState={{ selected, disabled: opening !== null }}
        disabled={opening !== null}
        onPress={() => {
          if (!selected) haptics.select();
          onPress();
        }}
        style={styles.row}
        testID="saved-map">
        <View style={styles.rowText}>
          <Text weight="semibold" style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {/* Opening one map is an inline busy state, so it keeps its spinner. */}
        {busy ? <ActivityIndicator color={colors.primary} /> : selected ? <Icon name="check" color={colors.primary} size={20} /> : null}
      </PressScale>
    </ListItemIn>
  );


  return (
    <SheetList
      testID="maps-sheet"
      data={rows}
      keyExtractor={(entry) => entry.key}
      header={
        <>
          <View style={styles.header}>
            <Text accessibilityRole="header" weight="display" style={styles.title}>
              {t('flowchart.savedFlowcharts')}
            </Text>
            <TextButton label={t('common.close')} onPress={() => router.back()} />
          </View>
          <Text tone="secondary" style={styles.body}>
            {t('flowchart.savedFlowchartsDesc')}
          </Text>
          <PrimaryButton icon="plus" label={t('mobile.flowchart.newMap')} onPress={() => void startNew()} testID="new-map" />
        </>
      }
      renderItem={({ item: entry, index }) => {
        const item = entry.item;
        const held = item && scope ? getDraft(scope, item.id) : undefined;
        const itemIndex = index - (unsaved ? 1 : 0);
        const meta = item ? (held?.edited ? `${formatRelativeDate(item.createdAt)} · ${t('mobile.flowchart.edited')}` : formatRelativeDate(item.createdAt)) : unsaved?.edited ? t('mobile.flowchart.edited') : t('mobile.flowchart.notSaved');
        return (
          <View style={[styles.list, { backgroundColor: background, borderColor: colors.border }, index === 0 && styles.firstRow, index === rows.length - 1 && styles.lastRow]}>
            {row(entry.key, item?.title ?? t('mobile.flowchart.untitled'), meta, open?.key === entry.key, () => {
              if (item) void choose(item, itemIndex);
              else if (unsaved) { showDraft(scope, unsaved); router.back(); }
            }, index, item !== null && opening === itemIndex)}
          </View>
        );
      }}
      ListFooterComponent={
        <>
          {!shown ? (
            <SkeletonTextRows rows={3} />
          ) : shown.failed ? (
            <View style={styles.failed}>
              <Text tone="secondary" style={styles.body}>
                {t('mobile.flowchart.loadFailed')}
              </Text>
              <TextButton label={t('common.retry')} onPress={() => void load()} />
            </View>
          ) : items.length === 0 ? (
            <Text tone="faint" style={styles.body}>
              {t('flowchart.noSavedFlowcharts')}
            </Text>
          ) : null}
          {failedOpen ? (
            <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
              {t('mobile.flowchart.openFailed')}
            </Text>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  list: { borderLeftWidth: 2, borderRightWidth: 2, overflow: 'hidden' },
  firstRow: { borderTopWidth: 2, borderTopLeftRadius: radius.field, borderTopRightRadius: radius.field },
  lastRow: { borderBottomWidth: 2, borderBottomLeftRadius: radius.field, borderBottomRightRadius: radius.field },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 11, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 13.5 },
  failed: { gap: 6, alignItems: 'flex-start' },
});
