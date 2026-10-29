import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useLatest } from '@/lib/live-value';

import { useTheme } from '@/theme/use-theme';

/**
 * The iPad document outline (mock A's "On this page" rail). Headed parts of a
 * document register themselves while a rail is shown; without one they do
 * nothing, so the phone document is untouched.
 */

interface Anchor {
  id: string;
  label: string;
  number?: number;
  view: () => View | null;
}

interface Outline {
  register: (anchor: Anchor) => () => void;
}

const OutlineContext = createContext<Outline | null>(null);

/** A ref for a headed part's root view, or undefined when no rail is shown. */
export function useOutlineAnchor(label: string | undefined): RefObject<View | null> | undefined {
  const outline = useContext(OutlineContext);
  const ref = useRef<View>(null);
  const id = useId();
  useEffect(() => {
    if (!outline || !label) return;
    return outline.register({ id, label, view: () => ref.current });
  }, [outline, label, id]);
  return outline ? ref : undefined;
}

/** Ref callbacks for a list of numbered items, or undefined when no rail is shown. */
export function useOutlineItems(items: { key: string; title: string }[], enabled: boolean): ((key: string) => (view: View | null) => void) | undefined {
  const outline = useContext(OutlineContext);
  const views = useRef(new Map<string, View | null>());
  const id = useId();
  const active = outline && enabled ? outline : null;
  const latestItems = useLatest(items);
  const signature = items.map((item) => `${item.key}\u0000${item.title}`).join('\u0001');
  useEffect(() => {
    if (!active) return;
    const removals = latestItems.current.map((item, index) =>
      active.register({ id: `${id}-${item.key}`, label: item.title, number: index + 1, view: () => views.current.get(item.key) ?? null }),
    );
    return () => removals.forEach((remove) => remove());
    // The signature stands for the items' keys and titles.
  }, [active, id, signature, latestItems]);
  if (!active) return undefined;
  return (key) => (view) => {
    views.current.set(key, view);
  };
}

/**
 * The rail beside the document and the state behind it. `content` is the view
 * that holds the document inside its scroll view; positions are measured from it.
 * `covered` is how much of the page's top a translucent bar hides.
 */
export function useOutlineRail(content: RefObject<View | null>, scroll: RefObject<ScrollView | null>, covered: number) {
  const [anchors, setAnchors] = useState<ReadonlyMap<string, Anchor>>(new Map());
  const [positions, setPositions] = useState<ReadonlyMap<string, number>>(new Map());
  const scrollY = useRef(0);
  const selected = useRef<string | undefined>(undefined);
  const [current, setCurrent] = useState<string | undefined>(undefined);

  const outline = useMemo<Outline>(
    () => ({
      register: (anchor) => {
        setAnchors((previous) => new Map(previous).set(anchor.id, anchor));
        return () =>
          setAnchors((previous) => {
            const next = new Map(previous);
            next.delete(anchor.id);
            return next;
          });
      },
    }),
    [],
  );

  const measure = () => {
    const root = content.current;
    if (!root) return;
    anchors.forEach((anchor) => {
      const view = anchor.view();
      view?.measureLayout(root, (_x, y) =>
        setPositions((previous) => (previous.get(anchor.id) === y ? previous : new Map(previous).set(anchor.id, y))),
      );
    });
  };
  const latestMeasure = useLatest(measure);
  useEffect(() => latestMeasure.current(), [anchors, content, latestMeasure]);

  const entries = [...anchors.values()].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  // The part whose heading has scrolled to the top of the page, or the first.
  const onScroll = (y: number) => {
    scrollY.current = y;
    const next = entries.reduce<string | undefined>((found, anchor) => ((positions.get(anchor.id) ?? Infinity) <= y + covered + 32 ? anchor.id : found), entries[0]?.id);
    if (next === selected.current) return;
    selected.current = next;
    setCurrent(next);
  };
  const latestScroll = useLatest(onScroll);
  useEffect(() => latestScroll.current(scrollY.current), [anchors, positions, covered, latestScroll]);

  const jump = (anchor: Anchor) => {
    const root = content.current;
    const view = anchor.view();
    if (!root || !view) return;
    view.measureLayout(root, (_x, y) => scroll.current?.scrollTo({ y: y - covered - 12, animated: true }));
  };

  return { outline, entries, current: current ?? entries[0]?.id, measure, jump, onScroll };
}

export function OutlineProvider({ outline, children }: { outline: Outline; children: ReactNode }) {
  return <OutlineContext.Provider value={outline}>{children}</OutlineContext.Provider>;
}

export function OutlineRail({ entries, current, onJump }: { entries: Anchor[]; current: string | undefined; onJump: (anchor: Anchor) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (entries.length === 0) return null;
  return (
    <View style={styles.rail} accessibilityRole="menu" testID="document-outline">
      <Text accessibilityRole="header" weight="semibold" tone="faint" style={styles.heading}>
        {t('mobile.document.onThisPage')}
      </Text>
      {entries.map((anchor) => {
        const on = anchor.id === current;
        return (
          <Pressable
            key={anchor.id}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: on }}
            onPress={() => onJump(anchor)}
            style={({ pressed }) => [styles.entry, on && { backgroundColor: colors.tile }, pressed && styles.pressed]}>
            <Text weight="bold" style={[styles.number, { color: colors.primary }]}>
              {anchor.number ?? ''}
            </Text>
            <Text weight={on ? 'semibold' : 'regular'} style={[styles.label, { color: on ? colors.chipSelectedForeground : colors.secondary }]} numberOfLines={2}>
              {anchor.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: 18, paddingTop: 10, gap: 2 },
  heading: { fontSize: 13.5, marginBottom: 8, marginLeft: 8 },
  entry: { flexDirection: 'row', gap: 8, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8 },
  number: { width: 14, fontSize: 14, lineHeight: 19 },
  label: { flex: 1, fontSize: 14.5, lineHeight: 19 },
  pressed: { opacity: 0.7 },
});
