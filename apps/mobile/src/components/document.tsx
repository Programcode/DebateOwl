import { Children, Fragment, isValidElement, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, CiteBadge } from './chip';
import type { CitationTarget } from './citation-target';
import { Icon } from './icon';
import { MarkdownView } from './markdown-view';
import { OfflineNotice } from './offline-notice';
import { OutlineProvider, OutlineRail, useOutlineAnchor, useOutlineItems, useOutlineRail } from './outline';
import { Text } from './text';

import { RAIL_MIN_WIDTH, RAIL_WIDTH, useHeaderCover, useLayoutClass } from '@/lib/layout';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * A result read as a document, as in mock 03: a large title and meta line, a
 * pale-blue framing card, numbered arguments that collapse, quotes with a
 * left rule and citation chips, and the next steps pinned above the home bar.
 * Generate and Attack use these; Brainstorm and Factoids will too.
 */

const BODY = 15.5;
const PINNED_HEIGHT = 54;
// The page fades out over this height above the pinned bar, so text never shows between or behind the buttons.
const PINNED_FADE = 28;

/** The pinned buttons on a solid strip of the page colour, with the page fading out above it. */
function PinnedBar({
  actions,
  actionWidths,
  bottom,
  rail,
  onHeight,
}: {
  actions: ReactNode;
  actionWidths?: number[];
  bottom: number;
  rail?: boolean;
  onHeight: (height: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View pointerEvents="box-none" style={styles.pinned} onLayout={(event) => onHeight(event.nativeEvent.layout.height)}>
      <Svg pointerEvents="none" width="100%" height={PINNED_FADE}>
        <Defs>
          <LinearGradient id="pinned-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.card} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.card} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={PINNED_FADE} fill="url(#pinned-fade)" />
      </Svg>
      <View style={[styles.pinnedBody, rail && styles.pinnedRail, { backgroundColor: colors.card, paddingBottom: bottom }]}>
        {/* The pinned buttons share the width equally unless told otherwise, as in the mocks, within the document's column on iPad. */}
        <View style={[styles.pinnedRow, rail && styles.pinnedRowRail]}>
          {Children.map(unwrapFragment(actions), (action, index) => (action ? <View style={[styles.pinnedItem, actionWidths?.[index] ? { flex: actionWidths[index] } : null]}>{action}</View> : null))}
        </View>
      </View>
    </View>
  );
}

export type NoticeTone = 'info' | 'success';

/** A short notice above the pinned buttons: dark, or mint with a check mark when it confirms something done. */
function DocumentNotice({ text, tone = 'info', bottom }: { text: string; tone?: NoticeTone; bottom: number }) {
  const { colors } = useTheme();
  const success = tone === 'success';
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, success && [styles.noticeRow, { borderColor: colors.successFill }], { bottom, backgroundColor: success ? colors.successTint : colors.foreground }]}
      testID="document-notice">
      {/* As the website's success toast: the mint check carries the meaning, the text stays readable. */}
      {success ? (
        <View style={[styles.noticeCheck, { backgroundColor: colors.successFill }]}>
          <Icon name="check" color={colors.successTint} size={15} />
        </View>
      ) : null}
      <Text weight={success ? 'semibold' : 'regular'} style={[styles.noticeText, { color: success ? colors.success : colors.background }]}>
        {text}
      </Text>
    </View>
  );
}

/** The scrolling page under the header, leaving room for the pinned actions. */
export function DocumentScreen({
  header,
  children,
  actions,
  actionWidths,
  notice,
  noticeTone,
  testID,
  outline = false,
}: {
  header: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** How the pinned buttons share the width, such as [1, 1.4]; equally when absent. */
  actionWidths?: number[];
  notice?: string;
  /** A notice that confirms something done, such as a save: mint with a check mark. */
  noticeTone?: NoticeTone;
  testID?: string;
  /** A saved document: on a wide iPad window its headed parts are listed in a rail beside it (iPad mock A). */
  outline?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useLayoutClass();
  const { width } = useWindowDimensions();
  const bottom = Math.max(insets.bottom - 6, 14);
  // The bar grows when a label wraps, so the page and the notice clear its measured height.
  const [barHeight, setBarHeight] = useState(PINNED_FADE + PINNED_HEIGHT + bottom);
  if (outline && layout !== 'phone' && width >= RAIL_MIN_WIDTH) {
    return (
      <RailDocument header={header} actions={actions} actionWidths={actionWidths} notice={notice} noticeTone={noticeTone} testID={testID}>
        {children}
      </RailDocument>
    );
  }
  return (
    <View style={[styles.root, { backgroundColor: colors.card }]} testID={testID}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: actions ? barHeight + 8 : 16 + bottom }]}>
        <OfflineNotice />
        {children}
      </ScrollView>
      {notice ? <DocumentNotice text={notice} tone={noticeTone} bottom={actions ? barHeight - PINNED_FADE + 8 : bottom} /> : null}
      {actions ? <PinnedBar actions={actions} actionWidths={actionWidths} bottom={bottom} onHeight={setBarHeight} /> : null}
    </View>
  );
}

/** The document with its outline rail on the left, the readable column beside it. */
function RailDocument({
  header,
  children,
  actions,
  actionWidths,
  notice,
  noticeTone,
  testID,
}: {
  header: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  actionWidths?: number[];
  notice?: string;
  noticeTone?: NoticeTone;
  testID?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom - 6, 14);
  const [barHeight, setBarHeight] = useState(PINNED_FADE + PINNED_HEIGHT + bottom);
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const rail = useOutlineRail(content, scroll, useHeaderCover());
  return (
    <View style={[styles.root, { backgroundColor: colors.card }]} testID={testID}>
      {header}
      <View style={styles.railRow}>
        <ScrollView style={styles.railPane} contentInsetAdjustmentBehavior="automatic">
          <OutlineRail entries={rail.entries} current={rail.current} onJump={rail.jump} />
        </ScrollView>
        <View style={styles.railDocument}>
          <ScrollView
            ref={scroll}
            contentInsetAdjustmentBehavior="automatic"
            scrollEventThrottle={32}
            onScroll={(event) => rail.onScroll(event.nativeEvent.contentOffset.y)}
            onContentSizeChange={rail.measure}>
            <View ref={content} style={[styles.content, styles.contentRail, { paddingBottom: actions ? barHeight + 8 : 16 + bottom }]}>
              <OfflineNotice />
              <OutlineProvider outline={rail.outline}>{children}</OutlineProvider>
            </View>
          </ScrollView>
          {notice ? <DocumentNotice text={notice} tone={noticeTone} bottom={actions ? barHeight - PINNED_FADE + 8 : bottom} /> : null}
          {actions ? <PinnedBar actions={actions} actionWidths={actionWidths} bottom={bottom} rail onHeight={setBarHeight} /> : null}
        </View>
      </View>
    </View>
  );
}

function unwrapFragment(node: ReactNode): ReactNode {
  return isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? node.props.children : node;
}

export function DocumentTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" weight="display" style={styles.title} selectable>
        {title}
      </Text>
      {meta ? (
        <Text tone="faint" style={styles.meta}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/** The pale-blue card the document opens with. */
export function FramingCard({ blocks }: { blocks: { label: string; text: string }[] }) {
  const { colors } = useTheme();
  const anchor = useOutlineAnchor(blocks[0]?.label);
  return (
    <View ref={anchor} style={[styles.framing, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} testID="document-framing">
      {blocks.map((block, index) => (
        <View key={index} style={styles.framingBlock}>
          <Text weight="semibold" style={[styles.framingLabel, { color: colors.chipSelectedForeground }]}>
            {block.label}
          </Text>
          <Text style={[styles.framingText, { color: colors.tileText }]} selectable>
            {block.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export interface NumberedItem {
  key: string;
  title: string;
  /** What a collapsed item says under its title, such as "2 pieces of evidence". */
  summary: string;
  body: ReactNode;
}

/**
 * Numbered items that open one at a time or together. The first is open. An
 * open item gets its own card; neighbouring closed items share one, as in the mock.
 * With `outline`, each item is listed in the iPad document rail.
 */
export function NumberedItems({ items, testID, outline = false }: { items: NumberedItem[]; testID?: string; outline?: boolean }) {
  const { colors } = useTheme();
  const anchorFor = useOutlineItems(items, outline);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(items[0] ? [items[0].key] : []));
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Runs of closed items share a card.
  const groups: { open: boolean; entries: { item: NumberedItem; n: number }[] }[] = [];
  items.forEach((item, index) => {
    const isOpen = open.has(item.key);
    const last = groups[groups.length - 1];
    if (!isOpen && last && !last.open) last.entries.push({ item, n: index + 1 });
    else groups.push({ open: isOpen, entries: [{ item, n: index + 1 }] });
  });

  return (
    <View style={styles.items} testID={testID}>
      {groups.map((group) => (
        <View key={group.entries[0].item.key} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {group.entries.map(({ item, n }, index) => (
            <Fragment key={item.key}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
              <Pressable
                ref={anchorFor?.(item.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded: group.open }}
                onPress={() => toggle(item.key)}
                testID="document-item"
                style={({ pressed }) => [styles.itemHeader, pressed && styles.pressed]}>
                <Text weight="bold" style={[styles.itemNumber, { color: colors.primary }, group.open && styles.itemNumberOpen]}>
                  {n}
                </Text>
                <View style={styles.itemHeaderText}>
                  <Text weight={group.open ? 'bold' : 'semibold'} style={group.open ? styles.itemTitleOpen : styles.itemTitle} numberOfLines={group.open ? undefined : 2}>
                    {item.title}
                  </Text>
                  {group.open ? null : (
                    <Text tone="faint" style={styles.itemSummary} numberOfLines={2}>
                      {item.summary}
                    </Text>
                  )}
                </View>
                <Icon name={group.open ? 'chevronUp' : 'chevronDown'} color={colors.tabInactive} size={20} />
              </Pressable>
              {group.open ? <View style={styles.itemBody}>{item.body}</View> : null}
            </Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Body text that may carry Markdown, as the website renders model output. */
export function Paragraph({ text, tone = 'secondary' }: { text: string; tone?: 'foreground' | 'secondary' }) {
  return <MarkdownView source={text} size={BODY} tone={tone} />;
}

/** A labelled line, like the website's "Impact:" rows. */
export function Labeled({ label, text, italic }: { label: string; text: string; italic?: boolean }) {
  return (
    <Text tone="secondary" style={styles.labeled} selectable>
      <Text weight="semibold" tone="faint" style={styles.labeled}>
        {label.replace(/:?$/, ':')}{' '}
      </Text>
      <Text tone="foreground" style={[styles.labeled, italic && styles.italic]}>
        {text}
      </Text>
    </Text>
  );
}

/** A quote with the mock's left rule, followed by its citation chips. */
export function Quote({ text, chips = [], onCite, italic }: { text: string; chips?: CitationTarget[]; onCite?: (target: CitationTarget) => void; italic?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.quote, { borderLeftColor: colors.primary }]}>
      <Text style={[styles.quoteText, italic && styles.italic]} selectable>
        {text}
        {chips.map((chip) => (
          <Text key={chip.n} accessibilityRole="button" accessibilityLabel={chip.label} onPress={onCite ? () => onCite(chip) : undefined}>
            {' '}
            <CiteBadge n={chip.n} />
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** The sources behind citation chips, as a row of chips. */
export function SourceChips({ chips, onCite }: { chips: CitationTarget[]; onCite: (target: CitationTarget) => void }) {
  if (chips.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
      {chips.map((chip) => (
        <Chip key={chip.n} label={chip.label} leading={<CiteBadge n={chip.n} />} onPress={() => onCite(chip)} />
      ))}
    </ScrollView>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  const anchor = useOutlineAnchor(title);
  return (
    <View ref={anchor} style={[styles.sectionHead, styles.sectionHeading]}>
      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.sectionTitle}>
        {title}
      </Text>
      {description ? (
        <Text tone="faint" style={styles.sectionDescription}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

/** A titled part of the document, in the same card style as the arguments. */
export function DocSection({ title, description, children, testID }: { title: string; description?: string; children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const anchor = useOutlineAnchor(title);
  return (
    <View ref={anchor} style={styles.section} testID={testID}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.sectionTitle}>
          {title}
        </Text>
        {description ? (
          <Text tone="faint" style={styles.sectionDescription}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

/** A small heading inside a section. */
export function SubHeading({ children }: { children: string }) {
  return (
    <Text weight="semibold" tone="faint" style={styles.subHeading}>
      {children}
    </Text>
  );
}

export function Bullets({ items, marker = '•', color }: { items: string[]; marker?: string; color?: string }) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.bullets}>
      {items.map((item, index) => (
        <View key={index} style={styles.bullet}>
          <Text weight="bold" style={[styles.bulletMarker, { color: color ?? colors.primary }]}>
            {marker}
          </Text>
          <Text style={styles.bulletText} selectable>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A small outlined label, such as a severity or "Needs Source". */
export function Tag({ label, color, icon }: { label: string; color?: string; icon?: 'alert' }) {
  const { colors } = useTheme();
  const tint = color ?? colors.secondary;
  return (
    <View style={[styles.tag, { borderColor: tint }]}>
      {icon ? <Icon name={icon} color={tint} size={13} /> : null}
      <Text weight="semibold" style={[styles.tagText, { color: tint }]}>
        {label}
      </Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
}

/** A tinted box inside an item, such as the website's "Improved Version". */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.callout, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]}>
      <Text weight="semibold" style={[styles.calloutTitle, { color: colors.chipSelectedForeground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 4, gap: 12, width: '100%', maxWidth: 680, alignSelf: 'center' },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  pinnedBody: { width: '100%', alignItems: 'center', paddingTop: 2 },
  pinnedRow: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 680, paddingHorizontal: 14 },
  pinnedItem: { flex: 1 },
  railRow: { flex: 1, flexDirection: 'row' },
  railPane: { width: RAIL_WIDTH, flexGrow: 0, flexShrink: 0 },
  railDocument: { flex: 1 },
  contentRail: { alignSelf: 'flex-start', paddingLeft: 20, paddingRight: 28 },
  pinnedRail: { alignItems: 'flex-start' },
  pinnedRowRail: { paddingLeft: 16, paddingRight: 24 },
  pressed: { opacity: 0.7 },
  notice: { position: 'absolute', left: 24, right: 24, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, alignSelf: 'center', maxWidth: 560 },
  noticeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 2 },
  noticeCheck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noticeText: { fontSize: 15, lineHeight: 20, textAlign: 'center', flexShrink: 1 },
  titleBlock: { gap: 6, marginBottom: 4 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  meta: { fontSize: 15, lineHeight: 20 },
  framing: { borderWidth: 2, borderRadius: radius.card + 1, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  framingBlock: { gap: 4 },
  framingLabel: { fontSize: 15 },
  framingText: { fontSize: 15.5, lineHeight: 22.5 },
  items: { gap: 10 },
  itemCard: { borderWidth: 2, borderRadius: radius.card + 1, overflow: 'hidden' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 64 },
  itemNumber: { fontSize: 17, minWidth: 14 },
  itemNumberOpen: { alignSelf: 'flex-start', marginTop: 1 },
  itemHeaderText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16.5, lineHeight: 22 },
  itemTitleOpen: { fontSize: 17.5, lineHeight: 23 },
  itemSummary: { fontSize: 14.5, lineHeight: 19 },
  itemBody: { paddingLeft: 42, paddingRight: 16, paddingBottom: 16, gap: 10, marginTop: -4 },
  labeled: { fontSize: BODY, lineHeight: 22 },
  italic: { fontStyle: 'italic' },
  quote: { borderLeftWidth: 3.5, paddingLeft: 12, paddingVertical: 2 },
  quoteText: { fontSize: 15, lineHeight: 22 },
  chipRow: { flexGrow: 0, marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  section: { gap: 8, marginTop: 8 },
  sectionHead: { gap: 2, marginHorizontal: 2 },
  sectionHeading: { marginTop: 8 },
  sectionTitle: { fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  sectionDescription: { fontSize: 14, lineHeight: 19 },
  sectionCard: { borderWidth: 2, borderRadius: radius.card + 1, padding: 16, gap: 12 },
  subHeading: { fontSize: 14, lineHeight: 19 },
  bullets: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8 },
  bulletMarker: { fontSize: BODY, lineHeight: 22, minWidth: 12 },
  bulletText: { flex: 1, fontSize: BODY, lineHeight: 22 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 12.5, lineHeight: 17 },
  divider: { height: 1 },
  callout: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  calloutTitle: { fontSize: 14.5 },
});
