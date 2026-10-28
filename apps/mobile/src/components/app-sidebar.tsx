import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigationContainerRef, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { OwlMark, useReduceMotion } from './owl';
import { PressScale } from './press-scale';
import { SIDEBAR_SECTIONS, activeSidebarItem, type SidebarItem, type SidebarSection } from './sidebar-items';
import { Text } from './text';

import { useDebates } from '@/lib/debate-context';
import { haptics } from '@/lib/haptics';
import { SIDEBAR_MAX_FONT_SCALE } from '@/lib/layout';
import { DURATION, SPRING } from '@/theme/motion';
import { pickSourceFile } from '@/lib/pick-source-file';
import { holdPickedFile } from '@/lib/source-file';
import { useTheme } from '@/theme/use-theme';

const COLLAPSED_KEY = 'debateowl.sidebar.collapsed';

/** The part of a navigator's state the sidebar reads. */
type AnyState = { key?: string; index?: number; routes: { name: string; state?: unknown }[] };

// Screens the root layout declares; the stack holding any of them is the root stack.
const ROOT_SCREENS = new Set(['(tabs)', 'ask', 'history', 'generate', 'case/[id]', 'attack/index', 'attack/[id]', 'brainstorm/index', 'brainstorm/[id]', 'factoids/index', 'factoids/[id]', 'flowchart/index', 'crossfire', 'sparring/index', 'sparring/[id]', 'share/[code]']);

/** The root stack: the navigator that holds the tabs and every screen pushed above them. */
function rootStack(state: AnyState | undefined): AnyState | undefined {
  let current = state;
  while (current) {
    if (current.routes.some((route) => ROOT_SCREENS.has(route.name))) return current;
    const focused = current.routes[current.index ?? current.routes.length - 1];
    current = focused?.state as AnyState | undefined;
  }
  return undefined;
}

/** The tab under the pushed screens, as the `from` the tools' back buttons read ("prepare", "you"…). */
function tabUnder(stack: AnyState | undefined): string | undefined {
  const tabs = stack?.routes.find((route) => route.name === '(tabs)')?.state as AnyState | undefined;
  const name = tabs?.routes[tabs.index ?? 0]?.name;
  return name?.replace(/^\((.*)\)$/, '$1');
}

/** Which sections the student closed; kept on the device, as iPadOS keeps a sidebar's sections. */
function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(COLLAPSED_KEY)
      .then((value) => {
        const keys: unknown = value ? JSON.parse(value) : [];
        if (live && Array.isArray(keys)) setCollapsed(new Set(keys.filter((key): key is string => typeof key === 'string')));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  return { collapsed, toggle };
}

/**
 * The iPad sidebar: the Current Debate switcher on top, then every tool under
 * collapsible Debate, Prepare, Practice, Library and You sections. It sits
 * beside the root stack (see the root _layout.tsx), so it stays while a tool
 * is open; picking a row closes the screens above the tabs first, so the
 * sidebar always leads to one screen, never a pile of them.
 */
export function AppSidebar({ width }: { width: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const { current, oneOff } = useDebates();
  const { collapsed, toggle } = useCollapsedSections();
  const active = activeSidebarItem(pathname);

  const open = async (item: SidebarItem) => {
    haptics.tap();
    const stack = rootStack(navigation.getRootState() as AnyState | undefined);
    const from = tabUnder(stack);
    const { target } = item;
    if (target.kind === 'screen' && pathname === target.pathname) return;
    let file: string | null = null;
    if (target.kind === 'pickFile') {
      const asset = await pickSourceFile().catch((cause: unknown) => {
        console.warn('Could not open the file picker:', cause instanceof Error ? cause.message : cause);
        return null;
      });
      if (!asset) return;
      file = holdPickedFile(asset);
    }
    // Close the screens above the tabs. With no tabs in the stack (a cold link before the anchor
    // could add them), start the stack again from the tabs, so tools never pile up.
    if (stack?.key && !stack.routes.some((route) => route.name === '(tabs)')) {
      navigation.dispatch({ type: 'RESET', payload: { index: 0, routes: [{ name: '(tabs)' }] }, target: stack.key });
    } else if (stack?.key && stack.routes.length > 1) navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key });
    if (target.kind === 'tab') router.navigate(target.href);
    else if (target.kind === 'pickFile') router.push({ pathname: '/add-file', params: { file: file! } });
    else router.push({ pathname: target.pathname as never, params: { ...(from ? { from } : {}), ...target.params } });
  };

  const toggleSection = (key: string) => {
    haptics.select();
    toggle(key);
  };

  const motion = oneOff ? t('debate.oneOffActive') : current?.motion ?? t('mobile.sidebar.noDebate');

  return (
    <View
      style={[styles.root, { width, backgroundColor: colors.card, borderRightColor: colors.line }]}
      accessibilityLabel={t('nav.mainNavigation')}
      testID="app-sidebar">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 18 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <OwlMark size={30} />
          <Text accessibilityRole="header" weight="display" style={styles.brandTitle} maxFontSizeMultiplier={SIDEBAR_MAX_FONT_SCALE}>
            DebateOwl
          </Text>
        </View>

        <View style={styles.switcherRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('debate.menuAria', { motion })}
            accessibilityHint={t('debate.switchDesc')}
            onPress={() => {
              haptics.tap();
              router.push('/debates');
            }}
            style={({ pressed }) => [styles.switcher, { backgroundColor: colors.tile, borderColor: colors.tileBorder }, pressed && styles.pressed]}
            testID="sidebar-debate-switcher">
            <View style={styles.switcherText}>
              <Text weight="semibold" style={[styles.switcherLabel, { color: colors.chipSelectedForeground }]}>
                {t('debate.current')}
              </Text>
              <Text weight="display" style={[styles.switcherMotion, { color: colors.tileText }]} numberOfLines={3}>
                {motion}
              </Text>
            </View>
            <Icon name="chevronDown" color={colors.chipSelectedForeground} size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('debate.startNew')}
            onPress={() => {
              haptics.tap();
              router.push('/new-debate');
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.newDebate, { backgroundColor: colors.primaryFill }, pressed && styles.pressed]}
            testID="sidebar-new-debate">
            <Icon name="plus" color={colors.onPrimary} size={20} />
          </Pressable>
        </View>

        {SIDEBAR_SECTIONS.map((section) => (
          <SidebarGroup
            key={section.key}
            section={section}
            expanded={!collapsed.has(section.key)}
            active={active}
            onToggle={() => toggleSection(section.key)}
            onOpen={(item) => void open(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SidebarGroup({
  section,
  expanded,
  active,
  onToggle,
  onOpen,
}: {
  section: SidebarSection;
  expanded: boolean;
  active: string | null;
  onToggle: () => void;
  onOpen: (item: SidebarItem) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const title = t(section.label);
  // A closed section still shows which of its rows is open, as the dot after its title.
  const holdsActive = section.items.some((item) => item.key === active);
  // The chevron turns with a spring as the section opens or closes; the rows slide in and out
  // and the sections below glide into place (Reanimated layout animations, still under Reduce Motion).
  const turn = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    turn.set(reduce ? (expanded ? 1 : 0) : withSpring(expanded ? 1 : 0, SPRING.pop));
  }, [expanded, reduce, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return (
    <Animated.View layout={LinearTransition.duration(DURATION.fast)} style={styles.group} testID={`sidebar-section-${section.key}`}>
      {/* A heading for VoiceOver's rotor that also opens and closes the section, as iPadOS sidebar headers do. */}
      <Pressable
        accessibilityRole="header"
        accessibilityLabel={title}
        aria-expanded={expanded}
        accessibilityHint={t(expanded ? 'mobile.sidebar.collapseHint' : 'mobile.sidebar.expandHint')}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onToggle}
        onPress={onToggle}
        style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
        testID={`sidebar-toggle-${section.key}`}>
        <Text weight="bold" style={[styles.groupTitle, { color: colors.heading }]} maxFontSizeMultiplier={SIDEBAR_MAX_FONT_SCALE}>
          {title}
        </Text>
        {!expanded && holdsActive ? <View style={[styles.activeDot, { backgroundColor: colors.primary }]} /> : null}
        <View style={styles.flex} />
        <Animated.View style={chevron}>
          <Icon name="chevronRight" color={colors.primary} size={18} />
        </Animated.View>
      </Pressable>
      {expanded
        ? section.items.map((item, index) => {
            const selected = item.key === active;
            return (
              <Animated.View
                key={item.key}
                entering={FadeInUp.delay(index * 25).duration(DURATION.fast)}
                exiting={FadeOutUp.duration(DURATION.quick)}
                layout={LinearTransition.duration(DURATION.fast)}>
              <PressScale
                accessibilityRole="button"
                aria-selected={selected}
                onPress={() => onOpen(item)}
                scaleTo={0.98}
                style={[styles.row, selected && { backgroundColor: colors.primaryFill }]}
                testID={`sidebar-item-${item.key}`}>
                <Icon name={item.icon} color={selected ? colors.onPrimary : colors.primary} size={21} />
                <Text
                  weight={selected ? 'semibold' : 'medium'}
                  style={[styles.rowLabel, { color: selected ? colors.onPrimary : colors.foreground }]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={SIDEBAR_MAX_FONT_SCALE}>
                  {t(item.label)}
                </Text>
              </PressScale>
              </Animated.View>
            );
          })
        : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { borderRightWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: 12, gap: 6 },
  flex: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 6 },
  brandTitle: { fontSize: 23, letterSpacing: -0.4 },
  switcherRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 8 },
  switcher: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  switcherText: { flex: 1, gap: 2 },
  switcherLabel: { fontSize: 12.5 },
  switcherMotion: { fontSize: 15.5, lineHeight: 20 },
  newDebate: { width: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  group: { gap: 2, marginTop: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 10 },
  groupTitle: { fontSize: 15, letterSpacing: 0.1 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, minHeight: 44 },
  rowLabel: { flex: 1, fontSize: 16, lineHeight: 21 },
  pressed: { opacity: 0.7 },
});
