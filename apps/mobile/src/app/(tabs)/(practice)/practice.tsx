import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, IconTile, ListItemIn, SessionEntrance } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/press-scale';
import { PRACTICE_TOOLS, type PracticeTool } from '@/components/practice-tools';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { WorkRow } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { keepIfSame } from '@/lib/keep-if-same';
import { fetchSparringRounds, type SparringRoundSummary } from '@/lib/sparring';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';

const ROUNDS_LIMIT = 5;

const TOOL_ROUTES: Record<PracticeTool, Href> = {
  attack: { pathname: '/attack', params: { from: 'practice' } },
  ask: '/ask',
  crossfire: { pathname: '/crossfire', params: { from: 'practice' } },
  sparring: { pathname: '/sparring', params: { from: 'practice' } },
  timer: '/timer',
  'speech-time': { pathname: '/speech-time', params: { from: 'practice' } },
  'flow-sheet': { pathname: '/flow-sheet', params: { from: 'practice' } },
  motions: { pathname: '/motions', params: { from: 'practice' } },
};

/**
 * The Practice tools, each opening full screen, and the judged Sparring
 * rounds to reopen. Rounds come from the Current Debate, or from outside every
 * debate when there is none, as the website's history picks them.
 */
export default function PracticeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current } = useDebates();
  const debateId = current?.id ?? null;
  // Each load belongs to the debate it was read for, so another debate's rounds, or its failure, never show under this one.
  const [rounds, setRounds] = useState<{ debateId: string | null; items: SparringRoundSummary[] | null; failed: boolean } | null>(null);

  // Every load takes a number; only the newest may write, so a slow load for another debate never replaces this one's.
  const loads = useRef(0);
  const copies = useCopyHolder();
  const load = useCallback(async () => {
    if (!userId) return;
    const forDebate = debateId;
    const request = ++loads.current;
    const isCurrent = () => loads.current === request;
    try {
      const items = await fetchSparringRounds(userId, forDebate, ROUNDS_LIMIT, copies.mark());
      if (!isCurrent()) return;
      setRounds((previous) => keepIfSame(previous, { debateId: forDebate, items, failed: false }));
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load sparring rounds:', cause instanceof Error ? cause.message : cause);
      setRounds({ debateId: forDebate, items: null, failed: true });
    }
  }, [userId, debateId, copies]);

  // Reload on focus, so a round just judged or deleted shows up. Out of view, its saved copies no longer count.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loads.current += 1;
        copies.release();
      };
    }, [load, copies]),
  );

  const items = rounds?.debateId === debateId ? rounds.items : null;
  const failed = rounds?.debateId === debateId && rounds.failed;

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.practice')} />
      <Card style={styles.list}>
        {PRACTICE_TOOLS.map((tool, index) => (
          <SessionEntrance key={tool.key} name={`practice:${tool.key}`} index={index} style={index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }}>
            <PressScale accessibilityRole="button" onPress={() => router.push(TOOL_ROUTES[tool.key])} testID={`practice-tool-${tool.key}`} style={styles.row}>
              <IconTile name={tool.icon} size={42} />
              <View style={styles.rowText}>
                <Text weight="semibold" style={styles.rowTitle}>
                  {'title' in tool ? t(tool.title, { ns: 'tools' }) : t(`nav.${tool.key}`)}
                </Text>
                <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
                  {'description' in tool ? t(tool.description) : t(`navDesc.${tool.key}`)}
                </Text>
              </View>
              <Icon name="chevronRight" color={colors.tabInactive} size={20} />
            </PressScale>
          </SessionEntrance>
        ))}
      </Card>

      {/* The list appears once it has loaded, so the tools never wait behind a spinner. */}
      {items === null && !failed ? null : (
        <>
          <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
            {t('historyPage.sparringTitle')}
          </Text>
          {items === null ? (
            <Card>
              <Text tone="secondary" style={styles.body}>
                {t('mobile.sparring.roundsFailed')}
              </Text>
            </Card>
          ) : items.length === 0 ? (
            <EmptyState pose="arguing" title={t('historyPage.emptySparring')} description={t('historyPage.emptySparringDesc')} />
          ) : (
            <Card style={styles.list}>
              {items.map((round, index) => (
                <ListItemIn key={round.id} index={index} layout>
                  <WorkRow
                    item={{ id: round.id, kind: 'sparring', title: round.motion, createdAt: round.updatedAt }}
                    first={index === 0}
                    from="practice"
                    onDeleted={() => void load()}
                  />
                </ListItemIn>
              ))}
            </Card>
          )}
        </>
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
  section: { fontSize: 20, lineHeight: 26, marginTop: 6 },
  body: { fontSize: 15.5, lineHeight: 22 },
});
