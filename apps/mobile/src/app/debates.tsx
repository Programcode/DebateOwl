import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useDebates } from '@/lib/debate-context';
import { fetchSourceCounts, type Debate } from '@/lib/debates';
import { formatRelativeDate, isToday } from '@/lib/dates';
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status, debates, current, oneOff, setOneOff, switchTo, refresh } = useDebates();
  const [query, setQuery] = useState('');
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ids = debates.map((debate) => debate.id).join(',');
  useEffect(() => {
    if (!ids) return;
    let active = true;
    fetchSourceCounts(ids.split(','))
      .then((counts) => {
        if (active) setSourceCounts(counts);
      })
      .catch((cause: unknown) => console.warn('Could not count sources:', cause));
    return () => {
      active = false;
    };
  }, [ids]);

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

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      testID="debates-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="bold" style={styles.title}>
          {t('debate.yourDebates')}
        </Text>
        <TextButton label={t('mobile.common.done')} onPress={() => router.back()} />
      </View>

      <View style={[styles.search, { backgroundColor: colors.segmentTrack }]}>
        <Icon name="search" color={colors.faint} size={19} />
        <TextInput
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
            return (
              <Pressable
                key={debate.id}
                accessibilityRole="button"
                accessibilityLabel={t('debate.switchToAria', { motion: debate.motion })}
                accessibilityState={{ selected: isCurrent, busy: switching === debate.id }}
                disabled={switching !== null}
                onPress={() => void pick(debate)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                  pressed && styles.pressed,
                ]}>
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
                {switching === debate.id ? (
                  <ActivityIndicator />
                ) : isCurrent ? (
                  <Icon name="check" color={colors.primary} size={22} />
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Card style={styles.oneOffCard}>
        <View style={styles.oneOff}>
          <View style={[styles.oneOffIcon, { backgroundColor: colors.segmentTrack }]}>
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
            onValueChange={setOneOff}
            disabled={!current}
            accessibilityLabel={t('mobile.debates.oneOff')}
            trackColor={{ false: colors.border, true: colors.primary }}
            ios_backgroundColor={colors.border}
            thumbColor="#ffffff"
          />
        </View>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton icon="plus" label={t('mobile.debates.newDebate')} onPress={() => router.push('/new-debate')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
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
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 3 },
  motion: { fontSize: 16.5, lineHeight: 22 },
  meta: { fontSize: 14, lineHeight: 19 },
  pressed: { opacity: 0.6 },
  oneOffCard: { padding: 0, gap: 0 },
  oneOff: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 16 },
  oneOffIcon: { width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
