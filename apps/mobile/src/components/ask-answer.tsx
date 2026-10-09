import type { AskOutput } from '@debatelab/core/ai/schemas/ask';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip, CiteBadge } from './chip';
import { MarkdownView } from './markdown-view';
import { Text } from './text';

import type { Source } from '@/lib/sources';

interface CitationTarget {
  n: number;
  label: string;
  url?: string;
  sourceId?: string;
}

/** The first web address in a citation's source, as the website's getFirstUrl. */
function firstUrl(text?: string): string | undefined {
  return text?.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;!?]+$/g, '');
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function shorten(text: string, max = 42): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Each citation as a chip: a Library source opens its detail, a web address opens the in-app browser. */
function citationTargets(output: AskOutput | undefined, library: Source[]): CitationTarget[] {
  return (output?.citations ?? []).map((citation, index) => {
    const n = index + 1;
    const source = citation.source?.trim() ?? '';
    const url = firstUrl(source);
    if (url) {
      const found = output?.searchInfo?.sources.find((item) => item.url === url);
      const named = source.replace(url, '').replace(/[\s,:;()–-]+$/u, '').replace(/^[\s,:;()–-]+/u, '');
      return { n, label: shorten(found?.title || named || hostOf(url)), url };
    }
    const needle = source.toLocaleLowerCase();
    const match = needle ? library.find((item) => item.title.trim() && needle.includes(item.title.trim().toLocaleLowerCase())) : undefined;
    if (match) return { n, label: shorten(match.title), sourceId: match.id };
    return { n, label: shorten(source || citation.claim) };
  });
}

/** One coach answer, as in mock 07, with the website's extra sections when the answer has them. */
export function AskAnswer({ content, output, streaming, library }: { content: string; output?: AskOutput; streaming?: boolean; library: Source[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const targets = useMemo(() => citationTargets(output, library), [output, library]);
  const claims = useMemo(() => (output?.citations ?? []).map((citation) => citation.claim), [output]);
  const cited = new Set(targets.map((target) => target.url).filter(Boolean));
  const webSources = (output?.searchInfo?.webSearchUsed ? output.searchInfo.sources : []).filter((item) => !cited.has(item.url));

  const open = (target: CitationTarget | undefined) => {
    if (target?.sourceId) router.push({ pathname: '/source/[id]', params: { id: target.sourceId } });
    else if (target?.url) void WebBrowser.openBrowserAsync(target.url);
  };

  return (
    <View style={styles.answer} testID={streaming ? 'ask-streaming' : 'ask-answer'}>
      {content || streaming ? (
        <MarkdownView source={content} claims={claims} streaming={streaming} onCite={(n) => open(targets[n - 1])} />
      ) : null}

      {targets.length > 0 || webSources.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
          {targets.map((target) => (
            <Chip key={target.n} label={target.label} leading={<CiteBadge n={target.n} />} onPress={() => open(target)} />
          ))}
          {webSources.map((item) => (
            <Chip key={item.url} icon="globe" label={shorten(item.title || hostOf(item.url))} onPress={() => void WebBrowser.openBrowserAsync(item.url)} />
          ))}
        </ScrollView>
      ) : null}

      {output?.prosConsAnalysis ? (
        <View style={styles.section}>
          <Section title={t('askChat.pros')} items={output.prosConsAnalysis.pros} marker="✓" />
          <Section title={t('askChat.cons')} items={output.prosConsAnalysis.cons} marker="✗" />
        </View>
      ) : null}

      {output?.argumentMap ? (
        <View style={styles.section}>
          <Text weight="semibold" tone="secondary" style={styles.sectionTitle}>
            {t('askChat.argumentMap')}
          </Text>
          <Section title={t('askChat.mainClaim')} items={[output.argumentMap.mainClaim]} />
          <Section title={t('askChat.supportingPoints')} items={output.argumentMap.supportingPoints} />
          <Section title={t('askChat.counterpoints')} items={output.argumentMap.counterpoints} />
          <Section title={t('askChat.assumptions')} items={output.argumentMap.assumptions} />
        </View>
      ) : null}

      {output?.followUpQuestions.length ? <Section title={t('askChat.followUp')} items={output.followUpQuestions} /> : null}
      {output?.uncertainties.length ? <Section title={t('askChat.uncertainties')} items={output.uncertainties} /> : null}
    </View>
  );
}

function Section({ title, items, marker = '•' }: { title: string; items: string[]; marker?: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.sectionBody}>
      <Text weight="semibold" tone="secondary" style={styles.sectionTitle}>
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={index} tone="secondary" style={styles.sectionItem}>
          {`${marker} ${item}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  answer: { gap: 12 },
  chipRow: { marginHorizontal: -20, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 20 },
  section: { gap: 10 },
  sectionBody: { gap: 3 },
  sectionTitle: { fontSize: 14 },
  sectionItem: { fontSize: 15, lineHeight: 21 },
});
