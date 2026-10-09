import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { BrainstormInput, BrainstormOutput, Idea } from '@debatelab/core/ai/schemas/brainstorm';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ResearchedSources } from './case-document';
import { Bullets, DocSection, FramingCard, Labeled, NumberedItems, Paragraph, SectionHeading, Tag, type NumberedItem } from './document';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

const STRENGTHS = ['strong', 'moderate', 'weak'] as const;
const SIDES = ['pro', 'con', 'neutral'] as const;

/** An idea's side and strength, with the website's defaults for old or broken rows. */
function ideaLabels(idea: Partial<Idea> | undefined) {
  const side = SIDES.find((value) => value === idea?.side) ?? 'neutral';
  const strength = STRENGTHS.find((value) => value === idea?.strength) ?? 'moderate';
  return { side, strength };
}

function IdeaBody({ idea, whyTop }: { idea: Partial<Idea> | undefined; whyTop?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { side, strength } = ideaLabels(idea);
  const sideColor = { pro: colors.primary, con: colors.destructive, neutral: colors.secondary }[side];
  const tradeoffs = Array.isArray(idea?.tradeoffs) ? idea.tradeoffs : [];
  return (
    <>
      <View style={styles.tags}>
        <Tag label={t(`brainstormResults.${side}`)} color={sideColor} />
        <Tag label={t(`mobile.brainstorm.strengths.${strength}`)} />
      </View>
      {idea?.description ? <Paragraph text={idea.description} tone="foreground" /> : null}
      {tradeoffs.length > 0 ? <Labeled label={t('brainstormResults.tradeoffs')} text={tradeoffs.join(', ')} /> : null}
      {whyTop ? <Labeled label={t('export.whyTop')} text={whyTop} /> : null}
    </>
  );
}

/** Collapsed, an idea says its side and strength under its title. */
function ideaItem(t: (key: string) => string, key: string, idea: Partial<Idea> | undefined, whyTop?: string): NumberedItem {
  const { side, strength } = ideaLabels(idea);
  return {
    key,
    title: idea?.title || t('brainstormResults.untitled'),
    summary: `${t(`brainstormResults.${side}`)} · ${t(`mobile.brainstorm.strengths.${strength}`)}`,
    body: <IdeaBody idea={idea} whyTop={whyTop} />,
  };
}

function NumberedList({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.listRow}>
          <Text weight="bold" style={[styles.listNumber, { color: colors.primary }]}>
            {`${index + 1}.`}
          </Text>
          <Text style={styles.listText} selectable>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Every part of the website's BrainstormResults in the document style: the
 * top five, the argument map or the buckets as numbered ideas that collapse,
 * then the next steps and warnings. A brainstorm that needs more information
 * shows only its questions, as on the website.
 */
export function BrainstormDocument({ output, input, sources }: { output: BrainstormOutput; input: Partial<BrainstormInput>; sources: DiscoveredSource[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (output.needsMoreInfo && output.clarifyingQuestions?.length) {
    return (
      <DocSection title={t('brainstormResults.clarification')} description={t('brainstormResults.clarificationDesc')} testID="brainstorm-questions">
        <NumberedList items={output.clarifyingQuestions} />
      </DocSection>
    );
  }

  const topFive = Array.isArray(output.topFive) ? output.topFive : [];
  const mindmap = Array.isArray(output.mindmap) ? output.mindmap : [];
  const buckets = Array.isArray(output.buckets) ? output.buckets : [];
  const nextSteps = Array.isArray(output.nextSteps) ? output.nextSteps : [];
  const warnings = Array.isArray(output.warningsAndTradeoffs) ? output.warningsAndTradeoffs : [];
  const sideLabel = { both: t('brainstormForm.sideBoth'), pro: t('brainstormForm.sidePro'), con: t('brainstormForm.sideCon') }[input.side ?? 'both'] ?? t('brainstormForm.sideBoth');
  const formatLabel = { topfive: t('brainstormForm.outputTop5'), mindmap: t('brainstormForm.outputMindmap'), buckets: t('brainstormForm.outputBuckets') }[input.outputMode ?? 'topfive'];

  return (
    <>
      <FramingCard
        blocks={[
          { label: t('brainstormForm.side'), text: sideLabel },
          { label: t('brainstormForm.outputFormat'), text: formatLabel ?? '' },
          { label: t('brainstormForm.existing'), text: input.context ?? '' },
        ].filter((block) => block.text.trim())}
      />

      {topFive.length === 0 && mindmap.length === 0 && buckets.length === 0 ? (
        <DocSection title={t('brainstormResults.noIdeasTitle')} testID="brainstorm-empty">
          <Text tone="secondary" style={styles.body}>
            {t('brainstormResults.noIdeasDesc')}
          </Text>
        </DocSection>
      ) : null}

      {topFive.length > 0 ? (
        <>
          <SectionHeading title={t('brainstormResults.top5')} description={t('brainstormResults.top5Desc')} />
          <NumberedItems items={topFive.map((item, index) => ideaItem(t, `${index}`, item.idea, item.whyTop))} testID="brainstorm-ideas" />
        </>
      ) : null}

      {mindmap.length > 0 ? <SectionHeading title={t('brainstormResults.argMap')} description={t('brainstormResults.argMapDesc')} /> : null}
      {mindmap.map((category, index) => {
        const items = Array.isArray(category.items) ? category.items : [];
        return (
          <View key={index} style={styles.group}>
            <SectionHeading title={category.category} description={t('mobile.brainstorm.ideaCount', { count: items.length })} />
            <NumberedItems items={items.map((idea, ideaIndex) => ideaItem(t, `${ideaIndex}`, idea))} testID={index === 0 ? 'brainstorm-ideas' : undefined} />
          </View>
        );
      })}

      {buckets.map((bucket, index) => {
        const ideas = Array.isArray(bucket.ideas) ? bucket.ideas : [];
        return (
          <View key={index} style={styles.group}>
            <SectionHeading title={bucket.name} description={bucket.keyInsight} />
            <NumberedItems items={ideas.map((idea, ideaIndex) => ideaItem(t, `${ideaIndex}`, idea))} testID={index === 0 && mindmap.length === 0 ? 'brainstorm-ideas' : undefined} />
          </View>
        );
      })}

      {nextSteps.length > 0 ? (
        <DocSection title={t('brainstormResults.nextSteps')}>
          <NumberedList items={nextSteps} />
        </DocSection>
      ) : null}

      {warnings.length > 0 ? (
        <DocSection title={t('brainstormResults.warnings')}>
          <Bullets items={warnings} marker="⚠" color={colors.warning} />
        </DocSection>
      ) : null}

      <ResearchedSources sources={sources} />
    </>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  group: { gap: 8 },
  body: { fontSize: 15.5, lineHeight: 22 },
  list: { gap: 8 },
  listRow: { flexDirection: 'row', gap: 8 },
  listNumber: { fontSize: 15.5, lineHeight: 22, minWidth: 18 },
  listText: { flex: 1, fontSize: 15.5, lineHeight: 22 },
});
