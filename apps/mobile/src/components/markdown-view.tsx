import * as WebBrowser from 'expo-web-browser';
import { Fragment, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text as NativeText, View } from 'react-native';

import { CiteBadge } from './chip';
import { Text } from './text';

import { attachCitations, parseMarkdown, type Block, type Inline } from '@/lib/markdown';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

/**
 * An Ask answer as readable text, as in mock 07: paragraphs, bold lead-ins,
 * lists and numbered citation chips. `claims` are the citations' claims in
 * order; a chip is placed where the answer quotes one. While streaming, a
 * caret follows the last word.
 */
export function MarkdownView({
  source,
  claims = [],
  streaming,
  onCite,
}: {
  source: string;
  claims?: string[];
  streaming?: boolean;
  onCite?: (n: number) => void;
}) {
  const { colors } = useTheme();
  const blocks = useMemo(() => attachCitations(parseMarkdown(source), claims), [source, claims]);
  const caret = <View key="caret" style={[styles.caret, { backgroundColor: colors.primary }]} />;

  const inline = (nodes: Inline[], key = ''): ReactNode[] =>
    nodes.map((node, index) => {
      const id = `${key}${index}`;
      switch (node.type) {
        case 'text':
          return node.text;
        case 'bold':
          return (
            <NativeText key={id} style={{ fontFamily: fontFamily.bold, color: colors.foreground }}>
              {inline(node.children, `${id}.`)}
            </NativeText>
          );
        case 'italic':
          return (
            <NativeText key={id} style={styles.italic}>
              {inline(node.children, `${id}.`)}
            </NativeText>
          );
        case 'code':
          return (
            <NativeText key={id} style={[styles.inlineCode, { backgroundColor: colors.segmentTrack }]}>
              {node.text}
            </NativeText>
          );
        case 'link':
          return (
            <NativeText key={id} accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(node.url)} style={{ color: colors.primary, textDecorationLine: 'underline' }}>
              {node.text}
            </NativeText>
          );
        case 'cite':
          return (
            <NativeText key={id} accessibilityRole="button" accessibilityLabel={`[${node.n}]`} onPress={onCite ? () => onCite(node.n) : undefined}>
              {' '}
              <CiteBadge n={node.n} />
            </NativeText>
          );
      }
    });

  const last = blocks.length - 1;
  const render = (block: Block, index: number) => {
    const tail = streaming && index === last ? caret : null;
    switch (block.type) {
      case 'paragraph':
        return (
          <Text key={index} style={styles.paragraph}>
            {inline(block.inline)}
            {tail}
          </Text>
        );
      case 'heading':
        return (
          <Text key={index} weight="bold" style={[styles.paragraph, block.level <= 2 ? styles.h2 : styles.h3]}>
            {inline(block.inline)}
            {tail}
          </Text>
        );
      case 'quote':
        return (
          <View key={index} style={[styles.quote, { borderLeftColor: colors.border }]}>
            <Text tone="secondary" style={styles.paragraph}>
              {inline(block.inline)}
              {tail}
            </Text>
          </View>
        );
      case 'code':
        return (
          <View key={index} style={[styles.codeBlock, { backgroundColor: colors.segmentTrack }]}>
            <Text style={styles.code}>{block.text}</Text>
            {tail}
          </View>
        );
      case 'rule':
        return <View key={index} style={[styles.rule, { backgroundColor: colors.line }]} />;
      case 'list':
        return (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.item}>
                <Text tone="secondary" style={[styles.paragraph, styles.marker]}>
                  {block.ordered ? `${block.start + itemIndex}.` : '•'}
                </Text>
                <Text style={[styles.paragraph, styles.itemText]}>
                  {inline(item, `${itemIndex}:`)}
                  {streaming && index === last && itemIndex === block.items.length - 1 ? caret : null}
                </Text>
              </View>
            ))}
          </View>
        );
    }
  };

  return (
    <View style={styles.root}>
      {blocks.length === 0 && streaming ? <Text style={styles.paragraph}>{caret}</Text> : blocks.map((block, index) => <Fragment key={index}>{render(block, index)}</Fragment>)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 9 },
  paragraph: { fontSize: 17, lineHeight: 25 },
  h2: { fontSize: 19, lineHeight: 25 },
  h3: { fontSize: 17 },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: 'Courier', fontSize: 15 },
  quote: { borderLeftWidth: 3, paddingLeft: 12 },
  codeBlock: { borderRadius: 10, padding: 12 },
  code: { fontFamily: 'Courier', fontSize: 14, lineHeight: 20 },
  rule: { height: 1, marginVertical: 4 },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 18 },
  itemText: { flex: 1 },
  caret: { width: 9, height: 18, borderRadius: 2, marginLeft: 3, transform: [{ translateY: 3 }] },
});
