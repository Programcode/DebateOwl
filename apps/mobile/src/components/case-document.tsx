import { readCase, sourceLabel, type CaseArgument } from '@debatelab/core/ai/case-view';
import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { hostOf, shorten, type CitationTarget } from './citation-target';
import { Bullets, Callout, Divider, DocSection, Labeled, NumberedItems, Quote, SubHeading, Tag } from './document';
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
function argumentChips(argument: CaseArgument, usage: SourceUsage[], library: Source[]): CitationTarget[] {
  const text = [argument.title, argument.point, argument.explanation, argument.evidence, argument.whyItMatters].filter(Boolean).join(' ').toLocaleLowerCase();
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

/**
 * Every part of the website's GenerateResults, in mock 03's document style:
 * the opening, the arguments (or R2's backed-up arguments, or a Conclusor's
 * reasons why we win), "If they say… we answer…", the closing line and the
 * sources. Older cases' sections come through `readCase`'s legacy part and
 * show only when they have content, under the website's plain names.
 */
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
  const view = useMemo(() => readCase(output), [output]);
  const { opening, legacy } = view;
  const chipsByArgument = useMemo(
    () => view.arguments.map((argument) => argumentChips(argument, output.metadata?.sourceUsage ?? [], library)),
    [view, output, library],
  );
  // Without web research, evidence is the model's own claim and is labelled that way, as on the website.
  const researched = sources.length > 0;

  const items = view.arguments.map((argument, index) => {
    const chips = chipsByArgument[index];
    const pieces = chips.length || (argument.evidence ? 1 : 0);
    return {
      // By position: a model can repeat an id, and two arguments must never open and close together.
      key: `${index}`,
      title: argument.title ?? argument.point,
      summary: pieces > 0
        ? t('mobile.results.evidenceCount', { count: pieces })
        : argument.needsSource ? t('generateResults.needsSource') : t('mobile.results.noEvidence'),
      body: (
        <>
          {argument.needsSource ? <Tag label={t('generateResults.needsSource')} color={colors.warning} icon="alert" /> : null}
          {argument.title && argument.point ? <Labeled label={t('generateResults.point')} text={argument.point} /> : null}
          {argument.explanation ? <Labeled label={t('generateResults.explanation')} text={argument.explanation} /> : null}
          {argument.evidence ? (
            <View style={styles.evidence}>
              <View style={styles.evidenceHead}>
                <SubHeading>{t('generateResults.evidence').replace(/:$/, '')}</SubHeading>
                {!researched && !argument.needsSource ? <Tag label={t('generateResults.unverified')} color={colors.warning} /> : null}
              </View>
              <Quote text={argument.evidence} chips={chips} onCite={onCite} />
            </View>
          ) : null}
          {argument.sourceQuery ? <Labeled label={t('generateResults.searchSuggestion')} text={argument.sourceQuery} /> : null}
          {argument.whyItMatters ? <Labeled label={t('generateResults.whyItMatters')} text={argument.whyItMatters} /> : null}
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
  const hasOpening = Boolean(opening.hook || opening.definition || opening.roadmap || legacy.framework || legacy.burdenOfProof || legacy.definitions.length);
  const hasAnswers = view.ifTheySay.length > 0 || legacy.likelyArguments.length > 0 || legacy.weaknesses.length > 0 || legacy.clashes.length > 0;

  return (
    <>
      {researched ? null : (
        <View style={[styles.caveat, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} testID="case-unresearched">
          <Icon name="alert" color={colors.warning} size={16} />
          <Text tone="secondary" style={styles.caveatText}>
            {t('generateResults.unresearchedCaveat')}
          </Text>
        </View>
      )}

      {hasOpening ? (
        <DocSection title={t('generateResults.opening')} description={t('generateResults.openingDesc')} testID="case-opening">
          {opening.hook ? <Quote text={opening.hook} italic /> : null}
          {opening.definition ? <Labeled label={t('generateResults.definition')} text={opening.definition} /> : null}
          {opening.roadmap ? (
            <>
              <SubHeading>{t('generateResults.roadmap')}</SubHeading>
              <Text style={styles.body} selectable>
                {opening.roadmap}
              </Text>
            </>
          ) : null}
          {legacy.framework ? (
            <>
              <SubHeading>{t('generateResults.legacyJudgeBy')}</SubHeading>
              <Text style={styles.body} selectable>
                {legacy.framework}
              </Text>
            </>
          ) : null}
          {legacy.burdenOfProof ? (
            <>
              <SubHeading>{t('generateResults.legacyMustShow')}</SubHeading>
              <Text style={styles.body} selectable>
                {legacy.burdenOfProof}
              </Text>
            </>
          ) : null}
          {legacy.definitions.length ? (
            <>
              <SubHeading>{t('generateResults.legacyDefinitions')}</SubHeading>
              <Bullets items={legacy.definitions} />
            </>
          ) : null}
        </DocSection>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.group}>
          <View style={styles.groupHead}>
            <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.groupTitle}>
              {t('generateResults.arguments')}
            </Text>
            <Text tone="faint" style={styles.groupDescription}>
              {t('generateResults.argumentCount', { count: items.length })}
            </Text>
          </View>
          <NumberedItems items={items} testID="case-arguments" outline />
        </View>
      ) : null}

      {view.reinforce.length > 0 ? (
        <DocSection title={t('generateResults.reinforce')} description={t('generateResults.reinforceDesc')} testID="case-reinforce">
          {view.reinforce.map((item, index) => (
            <View key={index} style={styles.stack}>
              {index > 0 ? <Divider /> : null}
              {item.argument ? (
                <Text weight="bold" style={styles.itemTitle} selectable>
                  {item.argument}
                </Text>
              ) : null}
              <Text style={styles.body} selectable>
                {item.text}
              </Text>
            </View>
          ))}
        </DocSection>
      ) : null}

      {view.whyWeWin.length > 0 ? (
        <DocSection title={t('generateResults.whyWeWin')} description={t('generateResults.whyWeWinDesc')} testID="case-why-we-win">
          {view.whyWeWin.map((reason, index) => (
            <View key={index} style={styles.reason}>
              <Text weight="bold" style={[styles.reasonNumber, { color: colors.primary }]}>
                {index + 1}.
              </Text>
              <Text style={[styles.body, styles.flex]} selectable>
                {reason}
              </Text>
            </View>
          ))}
        </DocSection>
      ) : null}

      {hasAnswers ? (
        <DocSection title={t('generateResults.ifTheySay')} description={t('generateResults.ifTheySayDesc')} testID="case-if-they-say">
          {view.ifTheySay.map((answer, index) => (
            <View key={index} style={styles.stack}>
              {index > 0 ? <Divider /> : null}
              {answer.theySay ? (
                <View style={styles.theySay}>
                  <Tag label={t('generateResults.theySay')} color={colors.destructive} />
                  <Text weight="semibold" style={styles.theySayText} selectable>
                    {answer.theySay}
                  </Text>
                </View>
              ) : null}
              {answer.weAnswer ? <Labeled label={t('generateResults.weAnswer')} text={answer.weAnswer} /> : null}
              {answer.inRound ? (
                <Callout title={t('generateResults.legacySayItLike').replace(/:$/, '')}>
                  <Text style={styles.body} selectable>
                    {answer.inRound}
                  </Text>
                </Callout>
              ) : null}
              {answer.source ? (
                <Text tone="faint" style={styles.small} selectable>
                  <Text weight="semibold" tone="faint" style={styles.small}>
                    {t('generateResults.source')}{' '}
                  </Text>
                  {answer.source}
                </Text>
              ) : null}
            </View>
          ))}
          {legacy.likelyArguments.length ? (
            <>
              <SubHeading>{t('generateResults.legacyAlsoSay')}</SubHeading>
              <Bullets items={legacy.likelyArguments} color={colors.destructive} />
            </>
          ) : null}
          {legacy.weaknesses.length ? (
            <>
              <SubHeading>{t('generateResults.legacyWeakSpots')}</SubHeading>
              <Bullets items={legacy.weaknesses} color={colors.warning} />
            </>
          ) : null}
          {legacy.clashes.length ? (
            <>
              <SubHeading>{t('generateResults.legacyDecidingPoints')}</SubHeading>
              <Bullets items={legacy.clashes} />
            </>
          ) : null}
        </DocSection>
      ) : null}

      {view.closingLine ? (
        <DocSection title={t('generateResults.closingLine')} description={t('generateResults.closingLineDesc')} testID="case-closing">
          <Text weight="semibold" style={styles.closing} selectable>
            {view.closingLine}
          </Text>
        </DocSection>
      ) : null}

      {view.sources.length > 0 ? (
        <DocSection title={t('generateResults.sources')} description={t('generateResults.sourcesDesc')} testID="case-sources">
          {view.sources.map((source, index) => {
            const url = source.url;
            const label = [sourceLabel(source), source.claim].filter(Boolean).join(' – ');
            return url ? (
              <BouncePressable
                key={index}
                accessibilityRole="link"
                accessibilityHint={hostOf(url)}
                onPress={() => void WebBrowser.openBrowserAsync(url)}
                style={[styles.caseSource]}>
                <Text style={[styles.body, styles.flex]}>
                  <Text weight="semibold">{sourceLabel(source)}</Text>
                  {source.claim ? `${source.org ? ' – ' : ''}${source.claim}` : ''}
                  <Text style={{ color: colors.primary }}>{` – ${hostOf(url)}`}</Text>
                </Text>
                <Icon name="globe" color={colors.primary} size={16} />
              </BouncePressable>
            ) : (
              <Text key={index} style={styles.body} selectable>
                {label}
              </Text>
            );
          })}
        </DocSection>
      ) : null}

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
        <BouncePressable
          key={`${source.url}-${index}`}
          accessibilityRole="link"
          onPress={() => void WebBrowser.openBrowserAsync(source.url)}
          style={[styles.source, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
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
        </BouncePressable>
      ))}
    </DocSection>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15.5, lineHeight: 22 },
  flex: { flex: 1 },
  small: { fontSize: 13.5, lineHeight: 19 },
  caveat: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 2, borderRadius: 14, padding: 12 },
  caveatText: { flex: 1, fontSize: 14, lineHeight: 20 },
  group: { gap: 8 },
  groupHead: { gap: 2, marginHorizontal: 2 },
  groupTitle: { fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  groupDescription: { fontSize: 14, lineHeight: 19 },
  evidence: { gap: 6 },
  evidenceHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stack: { gap: 8 },
  itemTitle: { fontSize: 16, lineHeight: 22 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reasonNumber: { fontSize: 15.5, lineHeight: 22, minWidth: 20 },
  theySay: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  theySayText: { flex: 1, minWidth: 160, fontSize: 15.5, lineHeight: 21 },
  closing: { fontSize: 16.5, lineHeight: 24 },
  caseSource: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  footer: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sourceText: { flex: 1, gap: 2 },
  sourceTitle: { fontSize: 15, lineHeight: 20 },
  sourceMeta: { fontSize: 13 },
});
