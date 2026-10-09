import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { PREPARE_TOOLS, type PrepareTool } from '@/components/prepare-tools';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { WorkRow, workHref } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { fetchPrepareWork, type DebateItem } from '@/lib/debates';
import { useTheme } from '@/theme/use-theme';

const SAVED_LIMIT = 30;

/** The Prepare tools, then the Current Debate's saved Prepare results, newest first. */
export default function PrepareScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current, oneOff } = useDebates();
  const debateId = current?.id ?? null;
  const [items, setItems] = useState<DebateItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const openTool = (tool: PrepareTool) =>
    tool === 'generate' ? router.push({ pathname: '/generate', params: { from: 'prepare' } }) : router.push({ pathname: '/coming/[tool]', params: { tool } });

  const load = useCallback(async (isCurrent: () => boolean) => {
    if (!userId || !debateId) return;
    try {
      const next = await fetchPrepareWork(userId, debateId, SAVED_LIMIT);
      if (!isCurrent()) return;
      setItems(next);
      setFailed(false);
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load saved results:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [userId, debateId]);

  // Reload on focus, so a case generated a moment ago, or on the website, shows up.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.prepare')} />
      <Card style={styles.list}>
        {PREPARE_TOOLS.map((tool, index) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            onPress={() => openTool(tool.key)}
            testID={`prepare-tool-${tool.key}`}
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

      <Text accessibilityRole="header" weight="bold" style={styles.section}>
        {t('mobile.prepare.saved')}
      </Text>
      {oneOff || !debateId ? (
        <Text tone="secondary" style={styles.body}>
          {oneOff ? t('debate.oneOffStrip') : t('debate.noCurrentStrip')}
        </Text>
      ) : failed ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debate.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load(() => true)} />
        </Card>
      ) : items === null ? (
        <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />
      ) : items.length === 0 ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('debate.noWork')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {items.map((item, index) => (
            <WorkRow key={`${item.kind}-${item.id}`} item={item} first={index === 0} onPress={() => router.push(workHref(item, 'prepare'))} />
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
  pressed: { opacity: 0.7 },
  section: { fontSize: 18.5, lineHeight: 24, letterSpacing: -0.2, marginTop: 8, marginHorizontal: 2 },
  body: { fontSize: 15.5, lineHeight: 21 },
  loading: { marginTop: 16 },
});
