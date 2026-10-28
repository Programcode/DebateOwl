import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AnnouncementBanner } from '@/components/announcement-banner';
import { TrialBanner } from '@/components/trial-banner';
import { MainActionButton, TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { OneOffNotice } from '@/components/one-off-notice';
import { PREPARE_TOOLS, prepareToolHref } from '@/components/prepare-tools';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { SOURCE_ICONS, sourceMeta } from '@/components/source-display';
import { Text } from '@/components/text';
import { WorkRow } from '@/components/work-row';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import {
  fetchDebateCounts,
  fetchRecentWork,
  ROLE_LABEL_KEYS,
  type Debate,
  type DebateCounts,
  type DebateItem,
  type DebateSide,
} from '@/lib/debates';
import { HOME_COLUMNS_WIDTH, useLayoutClass } from '@/lib/layout';
import { useSourceActions } from '@/lib/source-actions';
import { fetchSources, type Source } from '@/lib/sources';
import { useAnnouncements } from '@/lib/use-announcements';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { Owl, OwlAvatar } from '@/components/owl';

const RECENT_LIMIT = 3;
/** The iPad dashboard lists more work, and the newest sources beside it (iPad mock A). */
const DASHBOARD_RECENT_LIMIT = 5;
const DASHBOARD_SOURCES = 3;

/** Home: the Current Debate, as in mock 01. */
export default function DebateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, current, refresh } = useDebates();
  const dashboard = useLayoutClass() !== 'phone';
  // The website's announcement banner, at the top of the Debate tab, including the iPad dashboard.
  const announcements = useAnnouncements();
  const refreshAnnouncements = announcements.refresh;

  // Debates switched on the website show up when the tab comes back into view.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void refresh();
      focusedBefore.current = true;
      refreshAnnouncements();
    }, [refresh, refreshAnnouncements]),
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
        <AnnouncementBanner announcements={announcements} />
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
        <AnnouncementBanner announcements={announcements} />
        <TrialBanner />
        <SwitcherPill onPress={openSwitcher} />
        <OneOffNotice />
        {/* Mirrored, so the owl points across at Start debate, as on the website's home. */}
        <Owl pose="point" size={112} mirrored style={styles.emptyOwl} />
        <View style={styles.emptyText}>
          <Text accessibilityRole="header" weight="display" style={styles.emptyTitle}>
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

  if (dashboard) {
    return (
      <Screen safeTop gap={0} wide>
        <AnnouncementBanner announcements={announcements} style={styles.banner} />
        <TrialBanner style={styles.banner} />
        <SwitcherPill onPress={openSwitcher} />
        <OneOffNotice style={styles.notice} />
        <Text accessibilityRole="header" weight="display" style={[styles.motion, styles.motionWide]} testID="current-debate-motion">
          {current.motion}
        </Text>
        <DebateSettingsCard debate={current} />
        <DebateDetails key={current.id} debateId={current.id} dashboard />
      </Screen>
    );
  }

  return (
    <Screen safeTop gap={0}>
      <AnnouncementBanner announcements={announcements} style={styles.banner} />
      <TrialBanner style={styles.banner} />
      <SwitcherPill onPress={openSwitcher} />
      <OneOffNotice style={styles.notice} />
      <Text accessibilityRole="header" weight="display" style={styles.motion} testID="current-debate-motion">
        {current.motion}
      </Text>
      <DebateSettingsCard debate={current} />
      <DebateDetails key={current.id} debateId={current.id} />
    </Screen>
  );
}

/**
 * The website's settings card under the motion (format and instructions), with
 * the role and judge the app's form adds, and Edit settings.
 */
function DebateSettingsCard({ debate }: { debate: Debate }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { format, role, judge } = debate.settings;
  const facts = [
    format ? `${t('debate.format')}: ${t(`debate.formats.${format}`, { defaultValue: format })}` : null,
    role ? `${t('debate.role')}: ${role in ROLE_LABEL_KEYS ? t(ROLE_LABEL_KEYS[role as keyof typeof ROLE_LABEL_KEYS]) : role}` : null,
    judge ? `${t('mobile.debate.judge')}: ${judge}` : null,
  ].filter(Boolean);
  return (
    <View style={[styles.settings, { borderColor: colors.border }]} testID="debate-settings">
      <View style={styles.settingsText}>
        {facts.length > 0 ? (
          <Text tone="secondary" style={styles.settingsFacts}>
            {facts.join(' · ')}
          </Text>
        ) : null}
        {debate.instructions ? (
          <Text style={styles.settingsInstructions} numberOfLines={3}>
            {debate.instructions}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/edit-debate')}
        testID="edit-debate"
        hitSlop={6}
        style={({ pressed }) => [styles.editButton, { backgroundColor: colors.tile }, pressed && styles.pressed]}>
        <Icon name="pencil" color={colors.tileForeground} size={15} />
        <Text weight="semibold" style={[styles.editLabel, { color: colors.tileForeground }]} numberOfLines={1}>
          {t('debate.editSettings')}
        </Text>
      </Pressable>
    </View>
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

/**
 * Counts, the main action, the Prepare tools and recent work for one debate.
 * Students prepare both sides, so the toggle only chooses which side's work is
 * shown. It starts on In favor for each debate and is never stored.
 * On iPad (`dashboard`) they sit in two columns, with the newest sources.
 */
function DebateDetails({ debateId, dashboard = false }: { debateId: string; dashboard?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [view, setView] = useState<DebateSide>('pro');
  const [counts, setCounts] = useState<DebateCounts | null>(null);
  const [recent, setRecent] = useState<Record<DebateSide, DebateItem[]> | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const copies = useCopyHolder();

  // Both sides load together, so switching the view is instant.
  const load = useCallback(async (isCurrent: () => boolean) => {
    if (!userId) return;
    const limit = dashboard ? DASHBOARD_RECENT_LIMIT : RECENT_LIMIT;
    const mark = copies.mark();
    try {
      const [nextCounts, pro, con, nextSources] = await Promise.all([
        fetchDebateCounts(userId, debateId, mark),
        fetchRecentWork(userId, debateId, 'pro', limit, mark),
        fetchRecentWork(userId, debateId, 'con', limit, mark),
        dashboard ? fetchSources(userId, debateId, mark) : null,
      ]);
      if (!isCurrent()) return;
      setCounts(nextCounts);
      setRecent({ pro, con });
      setSources(nextSources?.slice(0, DASHBOARD_SOURCES) ?? null);
      setFailed(false);
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load the debate:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [userId, debateId, dashboard, copies]);

  // Reload on focus, so work saved on the website shows up. Out of view, its saved copies no longer count.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
        copies.release();
      };
    }, [load, copies]),
  );

  const results = counts?.results[view];
  const items = recent?.[view] ?? null;

  const sideAndStats = (
    <>
      <View accessibilityLabel={t('mobile.debate.viewAria')}>
        <SegmentedControl<DebateSide>
          options={[
            { value: 'pro', label: t('debate.side.pro') },
            { value: 'con', label: t('debate.side.con') },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      <View style={styles.stats} testID="debate-counts">
        <Stat value={counts?.sources} label={t('mobile.debate.statSources', { count: counts?.sources ?? 0 })} />
        <Stat value={results} label={t('mobile.debate.statResults', { count: results ?? 0 })} />
        <Stat value={counts?.rounds} label={t('mobile.debate.statRounds', { count: counts?.rounds ?? 0 })} />
      </View>

    </>
  );
  const spar = <SparCard onPress={() => router.push({ pathname: '/sparring', params: { from: 'debate' } })} />;
  const prepare = (
    <>
      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
        {t('mobile.tabs.prepare')}
      </Text>
      <View style={styles.grid}>
        {PREPARE_TOOLS.map((tool) => (
          <ToolTile
            key={tool.key}
            icon={tool.icon}
            label={t(`nav.${tool.key}`)}
            onPress={() => router.push(prepareToolHref(tool.key, 'debate'))}
          />
        ))}
      </View>
    </>
  );
  const twoColumns = dashboard && width >= HOME_COLUMNS_WIDTH;
  const pickUp = (
    <>
      <View style={[styles.sectionRow, twoColumns && styles.columnTop]}>
        <Text accessibilityRole="header" weight="bold" tone="heading" style={[styles.section, styles.sectionTitle]}>
          {t('mobile.debate.pickUp')}
        </Text>
        <TextButton
          label={t('mobile.debate.seeAll')}
          onPress={() => router.push({ pathname: '/history', params: { from: 'debate' } })}
        />
      </View>
      {failed ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.debate.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load(() => true)} />
        </Card>
      ) : items === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : items.length === 0 ? (
        <Card>
          <Text tone="secondary" style={styles.body}>
            {t('debate.sideEmpty')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {items.map((item, index) => (
            <WorkRow key={`${item.kind}-${item.id}`} item={item} first={index === 0} from="debate" onDeleted={() => void load(() => true)} />
          ))}
        </Card>
      )}
    </>
  );

  if (!dashboard) {
    return (
      <>
        {sideAndStats}
        {spar}
        {prepare}
        {pickUp}
      </>
    );
  }

  const recentSources = failed ? null : sources === null ? (
    <ActivityIndicator style={styles.loading} />
  ) : sources.length === 0 ? (
    <Card>
      <Text tone="secondary" style={styles.body}>
        {t('libraryPage.emptyDesc')}
      </Text>
    </Card>
  ) : (
    <Card style={styles.list}>
      {sources.map((source, index) => (
        <RecentSource key={source.id} source={source} first={index === 0} />
      ))}
    </Card>
  );

  return (
    <View style={twoColumns ? styles.columns : undefined} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} testID="debate-dashboard">
      <View style={twoColumns ? styles.column : undefined}>
        <View style={styles.sideColumn}>{sideAndStats}</View>
        {spar}
        {prepare}
      </View>
      <View style={twoColumns ? styles.column : undefined}>
        {pickUp}
        {failed ? null : (
          <>
            <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
              {t('mobile.debate.recentSources')}
            </Text>
            {recentSources}
          </>
        )}
      </View>
    </View>
  );
}

/** A source in the dashboard's Recent sources; it opens in the source sheet, with a preview and Copy and Share on a long press. */
function RecentSource({ source, first }: { source: Source; first: boolean }) {
  const { t } = useTranslation();
  const actions = useSourceActions();
  return (
    <Link href={{ pathname: '/source/[id]', params: { id: source.id } }} asChild>
      <Link.Trigger>
        <RecentSourceRow source={source} first={first} />
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction icon="doc.on.doc" onPress={() => void actions.copy(source)}>
          {t('common.copy')}
        </Link.MenuAction>
        <Link.MenuAction icon="square.and.arrow.up" onPress={() => actions.share(source)}>
          {t('mobile.library.share')}
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
}

function RecentSourceRow({ source, first, onPress }: { source: Source; first: boolean; onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID="recent-source"
      style={!first ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
      {({ pressed }) => (
        <View style={[styles.sourceRow, pressed && styles.pressed]}>
          <IconTile name={SOURCE_ICONS[source.type]} size={42} />
          <View style={styles.sourceText}>
            <Text weight="semibold" style={styles.sourceTitle} numberOfLines={2}>
              {source.title || t('libraryPage.untitledSource')}
            </Text>
            <Text tone="faint" style={styles.sourceMeta} numberOfLines={1}>
              {sourceMeta(t, source)}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </View>
      )}
    </Pressable>
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

// The website's primary look, a card-sized tactile button: a blue face on its ledge, which it sinks onto while pressed.
function SparCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.spar,
        { backgroundColor: colors.primaryFill, borderBottomColor: colors.primaryLedge },
        pressed && styles.sparPressed,
      ]}>
      <OwlAvatar pose="arguing" size={52} />
      <View style={styles.sparText}>
        <Text weight="display" style={styles.sparTitle}>
          {t('mobile.debate.spar')}
        </Text>
        <Text style={styles.sparLine}>{t('sparring.format.standard')}</Text>
        <Text style={styles.sparLine}>{t('mobile.debate.sparSide')}</Text>
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
  notice: { marginTop: 12 },
  emptyText: { gap: 8 },
  emptyTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  emptyOwl: { alignSelf: 'flex-start', marginTop: 8, marginBottom: -6 },
  motion: { fontSize: 27, lineHeight: 32, letterSpacing: -0.6, marginTop: 12, marginBottom: 10 },
  settings: { gap: 9, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 11, marginBottom: 15 },
  settingsText: { gap: 3 },
  settingsFacts: { fontSize: 14, lineHeight: 19 },
  settingsInstructions: { fontSize: 14.5, lineHeight: 20 },
  editButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 11, minHeight: 32 },
  editLabel: { fontSize: 14 },
  stats: { flexDirection: 'row', gap: 24, marginTop: 13, marginBottom: 15, marginHorizontal: 2 },
  statValue: { fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  statLabel: { fontSize: 15 },
  spar: {
    borderRadius: radius.card,
    borderBottomWidth: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  // Sinks onto its ledge, as the website's buttons do.
  sparPressed: { borderBottomWidth: 0, marginTop: 5 },
  sparText: { flex: 1, gap: 2 },
  sparTitle: { color: '#ffffff', fontSize: 19, lineHeight: 24 },
  sparLine: { color: 'rgba(255,255,255,0.88)', fontSize: 14.5, lineHeight: 20 },
  banner: { marginBottom: 14 },
  section: { fontSize: 18.5, lineHeight: 24, letterSpacing: -0.2, marginTop: 20, marginBottom: 9, marginHorizontal: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginRight: 2 },
  sectionTitle: { flex: 1, marginTop: 0, marginBottom: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tileLabel: { flex: 1, fontSize: 15.5 },
  list: { padding: 0, gap: 0 },
  motionWide: { fontSize: 34, lineHeight: 40, letterSpacing: -0.9 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  column: { flex: 1, minWidth: 0 },
  columnTop: { marginTop: 0 },
  sideColumn: { maxWidth: 420 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  sourceText: { flex: 1, gap: 2 },
  sourceTitle: { fontSize: 16 },
  sourceMeta: { fontSize: 14 },
});
