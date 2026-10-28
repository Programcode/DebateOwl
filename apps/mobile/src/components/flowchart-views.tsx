import { flowColumns, mapRows, type FlowchartDocument, type FlowEdgeKind, type FlowNode, type FlowNodeType } from '@debatelab/core/flowchart';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from './text';

import { flowMeta, mapMeta, typeLabel, viaLabel } from '@/lib/flowchart-text';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * The Flowchart as mock A draws it: the website's cards in role columns
 * (Flow) or as an indented tree (Map), each with its type's coloured rule.
 */

/** The website's node colours (nodeColors); the thesis takes the app's primary blue. */
export function useFlowColors() {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  return {
    type: {
      thesis: colors.primary,
      contention: dark ? '#34d399' : '#10b981',
      attack: dark ? '#f87171' : '#ef4444',
      rebuttal: dark ? '#60a5fa' : '#3b82f6',
      dropped: dark ? '#fbbf24' : '#f59e0b',
    } satisfies Record<FlowNodeType, string>,
    /** Column headings and link labels, a shade darker than the rules for contrast. */
    heading: {
      yourCase: colors.primary,
      attacks: dark ? '#f87171' : '#dc2626',
      rebuttals: dark ? '#60a5fa' : '#2563eb',
    },
    via: {
      support: colors.faint,
      attack: dark ? '#f87171' : '#dc2626',
      rebuttal: dark ? '#60a5fa' : '#2563eb',
    } satisfies Record<FlowEdgeKind, string>,
    cardFill: dark ? colors.card : colors.input,
  };
}

const COLUMN_WIDTH = 170;
const COLUMN_GAP = 12;
const SIDE = 16;
/** From this width every column fits, as on iPad. */
const WIDE = 600;

export function FlowCard({ node, meta, onPress, testID, selected = false }: { node: FlowNode; meta: string | null; onPress: () => void; testID?: string; selected?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const flow = useFlowColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel(t, node.data.type)}: ${node.data.label}`}
      accessibilityState={selected ? { selected } : undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: flow.cardFill, borderColor: colors.border, borderLeftColor: flow.type[node.data.type] },
        // The card open in the iPad inspector.
        selected && { backgroundColor: colors.tile, borderColor: colors.chipSelectedBorder, borderLeftColor: flow.type[node.data.type] },
        pressed && styles.pressed,
      ]}>
      <Text weight="medium" style={styles.cardLabel}>
        {node.data.label}
      </Text>
      {meta ? (
        <Text tone="faint" style={styles.cardMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function FlowLegend() {
  const { t } = useTranslation();
  const flow = useFlowColors();
  const items: [FlowNodeType, string][] = [
    ['thesis', 'flowchart.legendThesis'],
    ['contention', 'flowchart.legendArgument'],
    ['attack', 'flowchart.legendAttack'],
    ['rebuttal', 'flowchart.legendRebuttal'],
    ['dropped', 'flowchart.legendDropped'],
  ];
  return (
    <View style={styles.legend} accessibilityLabel={t('flowchart.legend')}>
      {items.map(([type, key]) => (
        <View key={type} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: flow.type[type] }]} />
          <Text tone="secondary" style={styles.legendText}>
            {t(key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The Flow tab: your case, their attacks and your rebuttals side by side, snapping column by column on a phone. */
export function FlowColumnsView({ doc, onOpen, selectedId }: { doc: FlowchartDocument; onOpen: (node: FlowNode) => void; selectedId?: string }) {
  const { t } = useTranslation();
  const flow = useFlowColors();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const groups = flowColumns(doc);
  const columns = [
    { key: 'yourCase', title: t('mobile.flowchart.columns.yourCase'), color: flow.heading.yourCase, cards: groups.yourCase },
    { key: 'attacks', title: t('mobile.flowchart.columns.attacks'), color: flow.heading.attacks, cards: groups.attacks },
    { key: 'rebuttals', title: t('mobile.flowchart.columns.rebuttals'), color: flow.heading.rebuttals, cards: groups.rebuttals },
  ];
  const body = columns.map((column) => (
    <View key={column.key} style={wide ? styles.wideColumn : styles.column} testID={`flow-column-${column.key}`}>
      <Text accessibilityRole="header" weight="bold" style={[styles.columnTitle, { color: column.color }]} numberOfLines={1}>
        {column.title}
      </Text>
      {column.cards.length === 0 ? (
        <Text tone="faint" style={styles.empty}>
          {t('mobile.flowchart.emptyColumn')}
        </Text>
      ) : (
        column.cards.map((node, index) => <FlowCard key={index} node={node} meta={flowMeta(t, doc, node)} onPress={() => onOpen(node)} testID="flow-card" selected={node.id === selectedId} />)
      )}
    </View>
  ));
  if (wide) return <View style={styles.wideRow}>{body}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={COLUMN_WIDTH + COLUMN_GAP}
      decelerationRate="fast"
      contentContainerStyle={styles.columns}
      testID="flow-columns">
      {body}
    </ScrollView>
  );
}

const INDENT = 18;
const MAX_INDENT = 4;

/** The Map tab: from the thesis down through what supports, attacks and rebuts it. */
export function MapTreeView({ doc, onOpen, selectedId }: { doc: FlowchartDocument; onOpen: (node: FlowNode) => void; selectedId?: string }) {
  const { t } = useTranslation();
  const flow = useFlowColors();
  return (
    <View style={styles.tree} testID="map-tree">
      {mapRows(doc).map(({ node, depth, via }, index) => (
        <View key={index} style={{ marginLeft: Math.min(depth, MAX_INDENT) * INDENT }}>
          {via ? (
            <Text weight="semibold" style={[styles.via, { color: flow.via[via] }]}>
              {`↳ ${viaLabel(t, via)}`}
            </Text>
          ) : null}
          <FlowCard node={node} meta={mapMeta(t, doc, node)} onPress={() => onOpen(node)} testID="map-card" selected={node.id === selectedId} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderLeftWidth: 4, borderRadius: radius.field, paddingHorizontal: 11, paddingVertical: 10, marginBottom: 10 },
  cardLabel: { fontSize: 14.5, lineHeight: 19 },
  cardMeta: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingHorizontal: SIDE, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12.5 },
  columns: { paddingHorizontal: SIDE, gap: COLUMN_GAP },
  column: { width: COLUMN_WIDTH },
  wideRow: { flexDirection: 'row', gap: 16, paddingHorizontal: SIDE + 8 },
  wideColumn: { flex: 1 },
  columnTitle: { fontSize: 13.5, marginBottom: 8, letterSpacing: -0.1 },
  empty: { fontSize: 13, lineHeight: 18 },
  tree: { paddingHorizontal: SIDE },
  via: { fontSize: 11.5, marginBottom: 4 },
});
