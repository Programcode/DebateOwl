import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppTextInput } from '@/components/app-text-input';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { WEB_SWITCH_THUMB } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { useDebates } from '@/lib/debate-context';
import { fetchSourceCounts, type Debate } from '@/lib/debates';
import { formatRelativeDate, isToday } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

function normalize(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** "Your debates": switch the Current Debate, turn on one-off mode, or start a new one (mock 02). */
export default function DebatesSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { status, debates, current, oneOff, setOneOff, switchTo, refresh, remove } = useDebates();
  const [deleting, setDeleting] = useState<string | null>(null);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [query, setQuery] = useState('');
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState('');
  const copies = useCopyHolder();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ids = debates.map((debate) => debate.id).join(',');
  useEffect(() => {
    if (!userId || !ids) return;
    let active = true;
    fetchSourceCounts(userId, ids.split(','), copies.mark())
      .then((counts) => {
        if (active) setSourceCounts(counts);
      })
      .catch((cause: unknown) => console.warn('Could not count sources:', cause));
    return () => {
      active = false;
    };
  }, [userId, ids, copies]);

  const visible = useMemo(() => {
    const needle = normalize(query);
    return needle ? debates.filter((debate) => normalize(debate.motion).includes(needle)) : debates;
  }, [debates, query]);

  const pick = async (debate: Debate) => {
    if (switching) return;
    if (debate.id === current?.id && !oneOff) {
      router.back();
      return;
    }
    setSwitching(debate.id);
    setError('');
    try {
      await switchTo(debate.id);
      router.back();
    } catch {
      setError(t('debate.switchFailed'));
    } finally {
      setSwitching(null);
    }
  };

  // The website deletes any debate but the current one, after its warning; its sources and saved work go too.
  const removeDebate = async (debate: Debate) => {
    if (deleting || switching) return;
    const confirmed = await confirmDestructive({
      title: t('mobile.debate.deleteTitle'),
      message: `${debate.motion}\n\n${t('debate.deleteWarning')}`,
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed) return;
    setDeleting(debate.id);
    setError('');
    try {
      await remove(debate.id);
      haptics.success();
    } catch {
      haptics.warning();
      setError(t('debate.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="debates-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('debate.yourDebates')}
        </Text>
        <TextButton label={t('mobile.common.done')} onPress={() => router.back()} />
      </View>

      <View style={[styles.search, { backgroundColor: colors.segmentTrack }]}>
        <Icon name="search" color={colors.faint} size={19} />
        <AppTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.debates.search')}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t('mobile.debates.search')}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.foreground }]}
        />
      </View>

      {status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
      {status === 'error' ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debates.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void refresh()} />
        </Card>
      ) : null}
      {status === 'ready' && debates.length === 0 ? (
        <Text tone="secondary" style={styles.body}>
          {t('debate.noOtherDebates')}
        </Text>
      ) : null}
      {status === 'ready' && debates.length > 0 && visible.length === 0 ? (
        <Text tone="secondary" style={styles.body}>
          {t('mobile.debates.noMatches')}
        </Text>
      ) : null}
      {visible.length > 0 ? (
        <Card style={styles.list}>
          {visible.map((debate, index) => {
            const isCurrent = debate.id === current?.id;
            const sources = sourceCounts[debate.id];
            const when = isToday(debate.lastActivityAt)
              ? t('mobile.debates.activeToday')
              : formatRelativeDate(debate.lastActivityAt);
            const row = (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('debate.switchToAria', { motion: debate.motion })}
                accessibilityState={{ selected: isCurrent, busy: switching === debate.id || deleting === debate.id }}
                accessibilityActions={isCurrent ? undefined : [{ name: 'delete', label: t('common.delete') }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'delete') void removeDebate(debate);
                }}
                disabled={switching !== null}
                onPress={() => void pick(debate)}
                style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && styles.pressed]}>
                <View style={styles.rowText}>
                  <Text weight="semibold" style={styles.motion}>
                    {debate.motion}
                  </Text>
                  <Text tone="faint" style={styles.meta} numberOfLines={1}>
                    {sources === undefined
                      ? when
                      : t('mobile.debates.meta', { sources: t('mobile.debates.sourceCount', { count: sources }), when })}
                  </Text>
                </View>
                {switching === debate.id || deleting === debate.id ? (
                  <ActivityIndicator />
                ) : isCurrent ? (
                  <Icon name="check" color={colors.primary} size={22} />
                ) : null}
              </Pressable>
            );
            const divider = index > 0 && { borderTopWidth: 1, borderTopColor: colors.line };
            // The current debate cannot be deleted, as on the website.
            if (isCurrent) return <View key={debate.id} style={divider}>{row}</View>;
            return (
              <ReanimatedSwipeable
                key={debate.id}
                friction={2}
                rightThreshold={40}
                overshootRight={false}
                containerStyle={divider}
                renderRightActions={() => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('debate.deleteAria', { motion: debate.motion })}
                    onPress={() => void removeDebate(debate)}
                    style={[styles.deleteAction, { backgroundColor: colors.destructive }]}>
                    <Icon name="trash" color="#ffffff" size={20} />
                    <Text weight="semibold" style={styles.deleteLabel}>
                      {t('common.delete')}
                    </Text>
                  </Pressable>
                )}>
                {row}
              </ReanimatedSwipeable>
            );
          })}
        </Card>
      ) : null}

      <Card style={styles.oneOffCard}>
        <View style={styles.oneOff}>
          <View style={[styles.oneOffIcon, { backgroundColor: colors.line }]}>
            <Icon name="x" color={colors.secondary} size={21} />
          </View>
          <View style={styles.rowText}>
            <Text weight="semibold" style={styles.motion}>
              {t('mobile.debates.oneOff')}
            </Text>
            <Text tone="faint" style={styles.meta}>
              {t('mobile.debates.oneOffDesc')}
            </Text>
          </View>
          <Switch
            value={oneOff}
            onValueChange={(value) => {
              haptics.tap();
              setOneOff(value);
            }}
            accessibilityLabel={t('mobile.debates.oneOff')}
            trackColor={{ false: colors.border, true: colors.primaryFill }}
            ios_backgroundColor={colors.border}
            thumbColor="#ffffff"
            {...WEB_SWITCH_THUMB}
          />
        </View>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton icon="plus" label={t('mobile.debates.newDebate')} onPress={() => router.push('/new-debate')} />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: radius.field,
    paddingHorizontal: 13,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 16.5, fontFamily: fontFamily.regular, paddingVertical: 10 },
  loading: { marginVertical: 24 },
  body: { fontSize: 15, lineHeight: 21 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  deleteAction: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 3 },
  deleteLabel: { color: '#ffffff', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 3 },
  motion: { fontSize: 16.5, lineHeight: 22 },
  meta: { fontSize: 14, lineHeight: 19 },
  pressed: { opacity: 0.6 },
  oneOffCard: { padding: 0, gap: 0 },
  oneOff: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 16 },
  oneOffIcon: { width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
