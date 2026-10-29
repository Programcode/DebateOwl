import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card, IconTile, ListItemIn, SessionEntrance } from '@/components/card';
import { Icon } from '@/components/icon';
import { OneOffNotice } from '@/components/one-off-notice';
import { PressScale } from '@/components/press-scale';
import { PREPARE_TOOLS, prepareToolHref, type PrepareTool } from '@/components/prepare-tools';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SkeletonRows } from '@/components/skeleton';
import { Text } from '@/components/text';
import { WorkRow } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { fetchPrepareWork, type DebateItem } from '@/lib/debates';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { keepIfSame } from '@/lib/keep-if-same';
import { useTheme } from '@/theme/use-theme';

const SAVED_LIMIT = 30;

/** The Prepare tools, then the Current Debate's saved Prepare results, newest first. */
export default function PrepareScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current } = useDebates();
  const debateId = current?.id ?? null;
  // Each load belongs to the debate it was read for, so another debate's results never show, or open, under this one.
  const [loaded, setLoaded] = useState<{ debateId: string; items: DebateItem[] | null; failed: boolean } | null>(null);
  const items = loaded?.debateId === debateId ? loaded.items : null;
  const failed = loaded?.debateId === debateId && loaded.failed;

  const openTool = (tool: PrepareTool) => router.push(prepareToolHref(tool, 'prepare'));

  // Every load, from focus or Retry, takes a number; only the newest may write, so a late Retry for another debate never replaces this one's.
  const loads = useRef(0);
  const copies = useCopyHolder();
  const load = useCallback(async () => {
    if (!userId || !debateId) return;
    const forDebate = debateId;
    const request = ++loads.current;
    const isCurrent = () => loads.current === request;
    try {
      const next = await fetchPrepareWork(userId, forDebate, SAVED_LIMIT, copies.mark());
      if (!isCurrent()) return;
      // Every focus rereads the list; an unchanged one keeps its identity, so the rows do not re-render.
      setLoaded((previous) => keepIfSame(previous, { debateId: forDebate, items: next, failed: false }));
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load saved results:', cause instanceof Error ? cause.message : cause);
      setLoaded({ debateId: forDebate, items: null, failed: true });
    }
  }, [userId, debateId, copies]);

  // Reload on focus, so a case generated a moment ago, or on the website, shows up. Out of view, its saved copies no longer count.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loads.current += 1;
        copies.release();
      };
    }, [load, copies]),
  );

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.prepare')} />
      <OneOffNotice />
      <Card style={styles.list}>
        {PREPARE_TOOLS.map((tool, index) => (
          <SessionEntrance key={tool.key} name={`prepare:${tool.key}`} index={index} style={index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }}>
            <PressScale accessibilityRole="button" onPress={() => openTool(tool.key)} testID={`prepare-tool-${tool.key}`} style={styles.row}>
              <IconTile name={tool.icon} size={42} />
              <View style={styles.rowText}>
                <Text weight="semibold" style={styles.rowTitle}>
                  {t(`nav.${tool.key}`)}
                </Text>
                <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
                  {t(`navDesc.${tool.key}`)}
                </Text>
              </View>
              <Icon name="chevronRight" color={colors.tabInactive} size={20} />
            </PressScale>
          </SessionEntrance>
        ))}
      </Card>

      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
        {t('mobile.prepare.saved')}
      </Text>
      {/* The Current Debate's results stay listed in one-off mode, as on the Debate tab and the website's home. */}
      {!debateId ? (
        <Text tone="secondary" style={styles.body}>
          {t('debate.noCurrentStrip')}
        </Text>
      ) : failed ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debate.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load()} />
        </Card>
      ) : items === null ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('debate.noWork')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {items.map((item, index) => (
            <ListItemIn key={`${item.kind}-${item.id}`} index={index} layout>
              <WorkRow item={item} first={index === 0} from="prepare" onDeleted={() => void load()} />
            </ListItemIn>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  section: { fontSize: 18.5, lineHeight: 24, letterSpacing: -0.2, marginTop: 8, marginHorizontal: 2 },
  body: { fontSize: 15.5, lineHeight: 21 },
});
