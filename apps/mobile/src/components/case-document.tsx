import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { Contention, GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { hostOf, shorten, type CitationTarget } from './citation-target';
import {
  Bullets,
  Callout,
  Divider,
  DocSection,
  FramingCard,
  Labeled,
  NumberedItems,
  Paragraph,
  Quote,
  SubHeading,
  Tag,
} from './document';
import { Icon } from './icon';
import { Text } from './text';

import type { Source } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

type SourceUsage = NonNullable<GenerateOutput['metadata']['sourceUsage']>[number];

const MIN_TITLE_MATCH = 4;

/**
 * The sources an argument names, as citation chips. The server records which
 * sources the case used (metadata.sourceUsage); an argument gets a chip for
 * each one whose title or site it mentions, then for Library sources it names,
 * as Ask's answers match them. Numbers stay the same across arguments.
 */
function argumentChips(contention: Contention, usage: SourceUsage[], library: Source[]): CitationTarget[] {
  const text = `${contention.claim} ${contention.reasoning} ${contention.evidence} ${contention.impact}`.toLocaleLowerCase();
  const mentions = (title: string) => {
    const needle = title.trim().toLocaleLowerCase();
    return needle.length >= MIN_TITLE_MATCH && text.includes(needle);
  };
  const chips: CitationTarget[] = [];
  const libraryIds = new Set(library.map((source) => source.id));
  usage.forEach((item, index) => {
    if (item.judgment === 'not_used') return;
    const host = item.origin && /^https?:\/\//i.test(item.origin) ? hostOf(item.origin) : '';
    if (!mentions(item.title) && !(host && text.includes(host.toLocaleLowerCase()))) return;
    chips.push({
      n: index + 1,
      label: shorten(item.title || host),
      sourceId: item.id && libraryIds.has(item.id) ? item.id : undefined,
      url: item.origin && /^https?:\/\//i.test(item.origin) ? item.origin : undefined,
    });
  });
  const named = new Set(usage.map((item) => item.id).filter(Boolean));
  library.forEach((source, index) => {
    if (named.has(source.id) || !mentions(source.title)) return;
    chips.push({ n: usage.length + index + 1, label: shorten(source.title), sourceId: source.id });
  });
  return chips;
}

/** Every part of the website's GenerateResults, in mock 03's document style. */
export function CaseDocument({
  output,
  library,
  sources,
  onCite,
}: {
  output: GenerateOutput;
  library: Source[];
  /** Researched sources, known only for a case generated in this session. */
  sources: DiscoveredSource[];
  onCite: (target: CitationTarget) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const chipsByArgument = useMemo(
    () => output.contentions.map((contention) => argumentChips(contention, output.metadata?.sourceUsage ?? [], library)),
    [output, library],
  );

  const items = output.contentions.map((contention, index) => {
    const chips = chipsByArgument[index];
    const pieces = chips.length || (contention.evidence.trim() ? 1 : 0);
    return {
      key: `${index}`,
      title: contention.claim,
      summary: pieces > 0
        ? t('mobile.results.evidenceCount', { count: pieces })
        : contention.needsSource ? t('generateResults.needsSource') : t('mobile.results.noEvidence'),
      body: (
        <>
          {contention.needsSource ? <Tag label={t('generateResults.needsSource')} color={colors.warning} icon="alert" /> : null}
          <Paragraph text={contention.reasoning} />
          {contention.evidence.trim() ? <Quote text={contention.evidence} chips={chips} onCite={onCite} /> : null}
          {contention.sourceQuery ? <Labeled label={t('generateResults.searchSuggestion')} text={contention.sourceQuery} /> : null}
          {contention.impact ? <Labeled label={t('generateResults.impact')} text={contention.impact} /> : null}
        </>
      ),
    };
  });

  const durationMs = output.metadata?.durationMs;
  const duration = durationMs && durationMs > 0
    ? durationMs < 1000
      ? t('generateResults.durationMs', { value: durationMs })
      : t('generateResults.durationS', { value: (durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0) })
    : null;
  const model = output.metadata?.model || output.metadata?.provider;
  const footer = [model ? t('generateResults.modelLabel', { value: model }) : null, duration].filter(Boolean).join(' • ');
  const definitions = output.caseStructure.keyDefinitions ?? [];

  return (
    <>
      <FramingCard
        blocks={[
          { label: t('generateResults.thesis'), text: output.caseStructure.thesis },
          { label: t('generateResults.framework'), text: output.caseStructure.framework },
        ].filter((block) => block.text?.trim())}
      />

      {output.exordio && (output.exordio.hook || output.exordio.transition) ? (
        <DocSection title={t('generateResults.exordio')} description={t('generateResults.exordioDesc')}>
          <SubHeading>{t('generateResults.hook')}</SubHeading>
          <Text style={styles.italic} selectable>
            {output.exordio.hook}
          </Text>
          <Divider />
          <SubHeading>{t('generateResults.transition')}</SubHeading>
          <Text style={styles.body} selectable>
            {output.exordio.transition}
          </Text>
        </DocSection>
      ) : null}

      <NumberedItems items={items} testID="case-arguments" outline />

      <DocSection title={t('generateResults.caseStructure')} description={t('generateResults.caseStructureDesc')}>
        <SubHeading>{t('generateResults.burdenOfProof')}</SubHeading>
        <Paragraph text={output.caseStructure.burdenOfProof} tone="foreground" />
        <Divider />
        <SubHeading>{t('generateResults.keyDefinitions')}</SubHeading>
        {definitions.length > 0 ? <Bullets items={definitions} /> : <Text tone="faint">{t('generateResults.noDefinitions')}</Text>}
      </DocSection>

      <DocSection title={t('generateResults.predictedOpponent')} description={t('generateResults.predictedOpponentDesc')}>
        <SubHeading>{t('generateResults.likelyArguments')}</SubHeading>
        <Bullets items={output.predictedOpponentCase.likelyArguments ?? []} color={colors.destructive} />
        <Divider />
        <SubHeading>{t('generateResults.strategicWeaknesses')}</SubHeading>
        <Bullets items={output.predictedOpponentCase.strategicWeaknesses ?? []} color={colors.warning} />
        <Divider />
        <SubHeading>{t('generateResults.keyClashes')}</SubHeading>
        <View style={styles.tags}>
          {(output.predictedOpponentCase.keyClashes ?? []).map((clash, index) => (
            <Tag key={index} label={clash} />
          ))}
        </View>
      </DocSection>

      <DocSection title={t('generateResults.preparedCounters')} description={t('generateResults.preparedCountersDesc')}>
        {output.counters.map((counter, index) => (
          <View key={index} style={styles.counter}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.counterTarget}>
              <Tag label={t('generateResults.target')} color={colors.destructive} />
              <Text weight="semibold" style={styles.counterTargetText} selectable>
                {counter.targetArgument}
              </Text>
            </View>
            <Labeled label={t('generateResults.counter')} text={counter.counterpoint} />
            <Callout title={t('generateResults.rebuttal').replace(/:$/, '')}>
              <Text style={styles.body} selectable>
                {counter.rebuttal}
              </Text>
            </Callout>
          </View>
        ))}
      </DocSection>

      <ResearchedSources sources={sources} />

      {footer ? (
        <Text tone="faint" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </>
  );
}

/** The website's researched-sources panel: each source with its quality, opening in the in-app browser. */
export function ResearchedSources({ sources }: { sources: DiscoveredSource[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (sources.length === 0) return null;
  return (
    <DocSection title={t('sourceQuality.researchedSources')} description={t('sourceQuality.fallbackNote')} testID="researched-sources">
      {sources.map((source, index) => (
        <Pressable
          key={`${source.url}-${index}`}
          accessibilityRole="link"
          onPress={() => void WebBrowser.openBrowserAsync(source.url)}
          style={({ pressed }) => [styles.source, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
          <Icon name="globe" color={colors.primary} size={18} />
          <View style={styles.sourceText}>
            <Text weight="medium" style={styles.sourceTitle} numberOfLines={2}>
              {source.title}
            </Text>
            <Text tone="faint" style={styles.sourceMeta} numberOfLines={1}>
              {[
                hostOf(source.url),
                source.qualityLabel ? t(`sourceQuality.labels.${source.qualityLabel}`) : null,
                source.qualityLabel === 'weak' ? t('sourceQuality.fallbackOnly') : null,
                source.semantic?.lastUsedInCase ? t('sourceQuality.usedInCase') : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      ))}
    </DocSection>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15.5, lineHeight: 22 },
  italic: { fontSize: 15.5, lineHeight: 22, fontStyle: 'italic' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  counter: { gap: 8 },
  counterTarget: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  counterTargetText: { flex: 1, fontSize: 15.5, lineHeight: 21 },
  footer: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sourceText: { flex: 1, gap: 2 },
  sourceTitle: { fontSize: 15, lineHeight: 20 },
  sourceMeta: { fontSize: 13 },
  pressed: { opacity: 0.7 },
});
