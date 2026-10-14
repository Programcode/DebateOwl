import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { PRACTICE_TOOLS, type PracticeTool } from '@/components/practice-tools';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { WorkRow } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { keepIfSame } from '@/lib/keep-if-same';
import { fetchSparringRounds, type SparringRoundSummary } from '@/lib/sparring';
import { useTheme } from '@/theme/use-theme';

const ROUNDS_LIMIT = 5;

const TOOL_ROUTES: Record<PracticeTool, Href> = {
  attack: { pathname: '/attack', params: { from: 'practice' } },
  ask: '/ask',
  crossfire: { pathname: '/crossfire', params: { from: 'practice' } },
  sparring: { pathname: '/sparring', params: { from: 'practice' } },
  timer: '/timer',
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
  const load = useCallback(async () => {
    if (!userId) return;
    const forDebate = debateId;
    const request = ++loads.current;
    const isCurrent = () => loads.current === request;
    try {
      const items = await fetchSparringRounds(userId, forDebate, ROUNDS_LIMIT);
      if (!isCurrent()) return;
      setRounds((previous) => keepIfSame(previous, { debateId: forDebate, items, failed: false }));
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load sparring rounds:', cause instanceof Error ? cause.message : cause);
      setRounds({ debateId: forDebate, items: null, failed: true });
    }
  }, [userId, debateId]);

  // Reload on focus, so a round just judged or deleted shows up.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loads.current += 1;
      };
    }, [load]),
  );

  const items = rounds?.debateId === debateId ? rounds.items : null;
  const failed = rounds?.debateId === debateId && rounds.failed;

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.practice')} />
      <Card style={styles.list}>
        {PRACTICE_TOOLS.map((tool, index) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            onPress={() => router.push(TOOL_ROUTES[tool.key])}
            testID={`practice-tool-${tool.key}`}
            style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
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
          </Pressable>
        ))}
      </Card>

      {/* The list appears once it has loaded, so the tools never wait behind a spinner. */}
      {items === null && !failed ? null : (
        <>
          <Text accessibilityRole="header" weight="bold" style={styles.section}>
            {t('historyPage.sparringTitle')}
          </Text>
          {items === null ? (
            <Card>
              <Text tone="secondary" style={styles.body}>
                {t('mobile.sparring.roundsFailed')}
              </Text>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <Text tone="secondary" style={styles.body}>
                {t('historyPage.emptySparringDesc')}
              </Text>
            </Card>
          ) : (
            <Card style={styles.list}>
              {items.map((round, index) => (
                <WorkRow
                  key={round.id}
                  item={{ id: round.id, kind: 'sparring', title: round.motion, createdAt: round.updatedAt }}
                  first={index === 0}
                  onPress={() => router.push({ pathname: '/sparring/[id]', params: { id: round.id, from: 'practice' } })}
                />
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
  pressed: { opacity: 0.7 },
  section: { fontSize: 20, lineHeight: 26, marginTop: 6 },
  body: { fontSize: 15.5, lineHeight: 22 },
});
