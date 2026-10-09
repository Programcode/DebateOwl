import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useDebates, type DebateSide } from '@/lib/debate-context';
import { fetchDebateCounts, fetchRecentWork, type DebateCounts, type DebateItem, type DebateItemKind } from '@/lib/debates';
import { formatWhen } from '@/lib/dates';
import { mainActionGradient, radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const RECENT_LIMIT = 3;

// The Prepare tools on the website's Current Debate page. Each opens the Prepare tab until its screen lands.
const PREPARE_TOOLS: { key: string; icon: IconName }[] = [
  { key: 'generate', icon: 'sparkles' },
  { key: 'brainstorm', icon: 'bulb' },
  { key: 'factoids', icon: 'book' },
  { key: 'flowchart', icon: 'branch' },
];

const KIND_ICONS: Record<DebateItemKind, IconName> = {
  case: 'sparkles',
  attack: 'swords',
  brainstorm: 'bulb',
  factoids: 'book',
  chat: 'chat',
  flowchart: 'branch',
  crossfire: 'target',
  sparring: 'swords',
};

const PRACTICE_KINDS = new Set<DebateItemKind>(['attack', 'crossfire', 'sparring']);

/** Home: the Current Debate, as in mock 01. */
export default function DebateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, current, oneOff, setOneOff, refresh, sideOf, setSide } = useDebates();

  // Debates switched on the website show up when the tab comes back into view.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void refresh();
      focusedBefore.current = true;
    }, [refresh]),
  );

  const openSwitcher = () => router.push('/debates');

  if (status === 'loading') {
    return (
      <Screen safeTop>
        <ActivityIndicator style={styles.loading} accessibilityLabel={t('common.loading')} />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen safeTop>
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debate.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void refresh()} />
        </Card>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen safeTop>
        <SwitcherPill onPress={openSwitcher} />
        <View style={styles.emptyText}>
          <Text accessibilityRole="header" weight="bold" style={styles.emptyTitle}>
            {t('debate.noCurrentTitle')}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {t('debate.noCurrentDesc')}
          </Text>
        </View>
        <MainActionButton label={t('debate.startDebate')} onPress={() => router.push('/new-debate')} />
      </Screen>
    );
  }

  const side = sideOf(current.id);

  return (
    <Screen safeTop gap={0}>
      <SwitcherPill onPress={openSwitcher} />
      {oneOff ? <OneOffNotice onReturn={() => setOneOff(false)} /> : null}
      <Text accessibilityRole="header" weight="bold" style={styles.motion} testID="current-debate-motion">
        {current.motion}
      </Text>
      <View accessibilityLabel={t('mobile.debate.sideAria')}>
        <SegmentedControl<DebateSide>
          options={[
            { value: 'pro', label: t('debate.side.pro') },
            { value: 'con', label: t('debate.side.con') },
          ]}
          value={side}
          onChange={(next) => setSide(current.id, next)}
        />
      </View>
      <DebateDetails key={current.id} debateId={current.id} side={side} />
    </Screen>
  );
}

function SwitcherPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('debate.switch')}
      onPress={onPress}
      testID="current-debate-pill"
      style={({ pressed }) => [styles.pill, { backgroundColor: colors.tile }, pressed && styles.pressed]}>
      <Text weight="semibold" style={[styles.pillLabel, { color: colors.tileForeground }]}>
        {t('nav.currentDebate')}
      </Text>
      <Icon name="chevronDown" color={colors.tileForeground} size={17} />
    </Pressable>
  );
}

function OneOffNotice({ onReturn }: { onReturn: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { borderColor: colors.border }]}>
      <Text tone="secondary" style={styles.noticeText}>
        {t('debate.oneOffStrip')}
      </Text>
      <TextButton label={t('debate.returnToDebate')} onPress={onReturn} />
    </View>
  );
}

/** Counts, the main action, the Prepare tools and recent work for one debate. */
function DebateDetails({ debateId, side }: { debateId: string; side: DebateSide }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [counts, setCounts] = useState<DebateCounts | null>(null);
  const [recent, setRecent] = useState<DebateItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    try {
      const [nextCounts, nextRecent] = await Promise.all([fetchDebateCounts(debateId), fetchRecentWork(debateId, RECENT_LIMIT)]);
      if (!isCurrent()) return;
      setCounts(nextCounts);
      setRecent(nextRecent);
      setFailed(false);
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load the debate:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [debateId]);

  // Reload on focus, so work saved on the website shows up.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const open = (href: Href) => router.navigate(href);

  return (
    <>
      <View style={styles.stats} testID="debate-counts">
        <Stat value={counts?.sources} label={t('mobile.debate.statSources', { count: counts?.sources ?? 0 })} />
        <Stat value={counts?.results} label={t('mobile.debate.statResults', { count: counts?.results ?? 0 })} />
        <Stat value={counts?.rounds} label={t('mobile.debate.statRounds', { count: counts?.rounds ?? 0 })} />
      </View>

      <SparCard side={side} onPress={() => open('/practice')} />

      <Text accessibilityRole="header" weight="bold" style={styles.section}>
        {t('mobile.tabs.prepare')}
      </Text>
      <View style={styles.grid}>
        {PREPARE_TOOLS.map((tool) => (
          <ToolTile key={tool.key} icon={tool.icon} label={t(`nav.${tool.key}`)} onPress={() => open('/prepare')} />
        ))}
      </View>

      <Text accessibilityRole="header" weight="bold" style={styles.section}>
        {t('mobile.debate.pickUp')}
      </Text>
      {failed ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debate.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load(() => true)} />
        </Card>
      ) : recent === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : recent.length === 0 ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('debate.noWork')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {recent.map((item, index) => (
            <RecentRow
              key={`${item.kind}-${item.id}`}
              item={item}
              first={index === 0}
              onPress={() => open(PRACTICE_KINDS.has(item.kind) ? '/practice' : '/prepare')}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View>
      <Text weight="bold" style={styles.statValue}>
        {value ?? '–'}
      </Text>
      <Text tone="faint" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function SparCard({ side, onPress }: { side: DebateSide; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.spar, pressed && styles.pressed]}>
      <LinearGradient {...mainActionGradient} style={StyleSheet.absoluteFill} />
      <View style={styles.sparIcon}>
        <Icon name="swords" color="#ffffff" size={24} />
      </View>
      <View style={styles.sparText}>
        <Text weight="bold" style={styles.sparTitle}>
          {t('mobile.debate.spar')}
        </Text>
        <Text style={styles.sparLine}>
          {t('mobile.debate.sparLine', {
            format: t('sparring.format.standard'),
            side: t(side === 'pro' ? 'sparring.pro' : 'sparring.con'),
          })}
        </Text>
      </View>
      {/* A View, so the web preview paints it above the gradient like the other children. */}
      <View>
        <Icon name="chevronRight" color="#ffffff" size={22} />
      </View>
    </Pressable>
  );
}

// Long one-word labels (Hungarian "Folyamatábra") shrink to fit on iOS; the web preview cannot shrink text, so it truncates them.
function ToolTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}>
      <IconTile name={icon} size={38} />
      <Text weight="semibold" style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecentRow({ item, first, onPress }: { item: DebateItem; first: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.line },
        pressed && styles.pressed,
      ]}>
      <IconTile name={KIND_ICONS[item.kind]} size={42} />
      <View style={styles.rowText}>
        <Text weight="semibold" style={styles.rowTitle} numberOfLines={1}>
          {item.title || t(`debate.kinds.${item.kind}`)}
        </Text>
        <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
          {t('mobile.debate.itemMeta', { kind: t(`debate.kinds.${item.kind}`), when: formatWhen(item.createdAt) })}
        </Text>
      </View>
      <Icon name="chevronRight" color={colors.tabInactive} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 32 },
  body: { fontSize: 16, lineHeight: 22 },
  pressed: { opacity: 0.7 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingLeft: 14,
    paddingRight: 11,
    minHeight: 34,
    marginTop: 4,
  },
  pillLabel: { fontSize: 15 },
  notice: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.field,
    paddingHorizontal: 14,
    paddingTop: 10,
    alignItems: 'flex-start',
  },
  noticeText: { fontSize: 14, lineHeight: 19 },
  emptyText: { gap: 8 },
  emptyTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  motion: { fontSize: 27, lineHeight: 32, letterSpacing: -0.6, marginTop: 12, marginBottom: 15 },
  stats: { flexDirection: 'row', gap: 24, marginTop: 13, marginBottom: 15, marginHorizontal: 2 },
  statValue: { fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  statLabel: { fontSize: 15 },
  spar: {
    borderRadius: radius.card + 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 17,
    paddingHorizontal: 17,
  },
  sparIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparText: { flex: 1, gap: 2 },
  sparTitle: { color: '#ffffff', fontSize: 18, lineHeight: 23 },
  sparLine: { color: 'rgba(255,255,255,0.88)', fontSize: 14.5, lineHeight: 20 },
  section: { fontSize: 18.5, lineHeight: 24, letterSpacing: -0.2, marginTop: 20, marginBottom: 9, marginHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tileLabel: { flex: 1, fontSize: 15.5 },
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
});
