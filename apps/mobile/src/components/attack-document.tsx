import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { AttackOutput, Weakness } from '@debatelab/core/ai/schemas/attack';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ResearchedSources } from './case-document';
import { Bullets, Callout, Divider, DocSection, Labeled, NumberedItems, Paragraph, Quote, SectionHeading, SubHeading, Tag } from './document';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

const SEVERITIES = ['critical', 'major', 'minor'] as const;

/** Every part of the website's AttackResults, in the same document style as a case. */
export function AttackDocument({ output, sources }: { output: AttackOutput; sources: DiscoveredSource[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const severityColor = { critical: colors.destructive, major: colors.warning, minor: colors.primary };
  const weaknesses = Array.isArray(output.weaknesses) ? output.weaknesses : [];
  const fallacies = Array.isArray(output.fallaciesDetected) ? output.fallaciesDetected : [];
  const crossEx = Array.isArray(output.crossExQuestions) ? output.crossExQuestions : [];
  const overall = output.overallAssessment ?? { summary: '', score: 0, strengthAreas: [] };
  const strengths = Array.isArray(overall.strengthAreas) ? overall.strengthAreas : [];
  const score = Math.max(0, Math.min(100, overall.score));
  const scoreColor = score >= 70 ? colors.primary : score >= 50 ? colors.warning : colors.destructive;
  const severityOf = (weakness: Weakness) => (SEVERITIES.includes(weakness.severity) ? weakness.severity : 'minor');

  const items = weaknesses.map((weakness, index) => {
    const severity = severityOf(weakness);
    const severityLabel = t(`attackResults.${severity}`);
    const typeLabel = t(`attackResults.types.${weakness.type}`, { defaultValue: weakness.type });
    return {
      // Model ids can repeat, so the expansion state is keyed by position.
      key: `${index}`,
      title: weakness.description,
      summary: `${severityLabel} · ${typeLabel}`,
      body: (
        <>
          <View style={styles.tags}>
            <Tag label={severityLabel.toLocaleUpperCase()} color={severityColor[severity]} />
            <Tag label={typeLabel} />
          </View>
          {weakness.affectedQuote ? <Quote text={`"${weakness.affectedQuote}"`} italic /> : null}
          <SubHeading>{t('attackResults.whyWeak')}</SubHeading>
          <Paragraph text={weakness.whyWeak} tone="foreground" />
          <Labeled label={t('attackResults.opponentAttack')} text={`"${weakness.howOpponentAttacks}"`} italic />
          <Callout title={t('attackResults.improvedVersion')}>
            <Paragraph text={weakness.improvedVersion} tone="foreground" />
          </Callout>
        </>
      ),
    };
  });

  return (
    <>
      <View style={[styles.score, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} testID="attack-score">
        <View style={styles.scoreRow}>
          <Text weight="semibold" style={[styles.scoreLabel, { color: colors.chipSelectedForeground }]}>
            {t('attackResults.caseStrength')}
          </Text>
          <Text weight="bold" style={[styles.scoreValue, { color: scoreColor }]}>
            {`${overall.score}/100`}
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('attackResults.caseStrength')}
          accessibilityValue={{ min: 0, max: 100, now: score }}
          style={[styles.track, { backgroundColor: colors.card }]}>
          <View style={[styles.fill, { width: `${score}%`, backgroundColor: scoreColor }]} />
        </View>
        {overall.summary ? (
          <Text style={[styles.summary, { color: colors.tileText }]} selectable>
            {overall.summary}
          </Text>
        ) : null}
        <View style={styles.counts}>
          {SEVERITIES.map((severity) => (
            <View key={severity} style={styles.count}>
              <View style={[styles.dot, { backgroundColor: severityColor[severity] }]} />
              <Text style={[styles.countText, { color: colors.tileText }]}>
                {`${weaknesses.filter((weakness) => severityOf(weakness) === severity).length} ${t(`attackResults.${severity}`)}`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {strengths.length > 0 ? (
        <DocSection title={t('attackResults.strengths')}>
          <Bullets items={strengths} marker="✓" />
        </DocSection>
      ) : null}

      <SectionHeading title={t('attackResults.weaknesses')} description={t('attackResults.weaknessesCount', { count: weaknesses.length })} />
      <NumberedItems items={items} testID="attack-weaknesses" />

      {fallacies.length > 0 ? (
        <DocSection title={t('attackResults.fallacies')} description={t('attackResults.fallaciesDesc')}>
          {fallacies.map((fallacy, index) => (
            <View key={index} style={styles.entry}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.tags}>
                <Tag label={fallacy.name} color={colors.destructive} />
                <Text tone="faint" style={styles.location}>
                  {`${t('attackResults.in')} ${fallacy.location}`}
                </Text>
              </View>
              <Paragraph text={fallacy.explanation} tone="foreground" />
            </View>
          ))}
        </DocSection>
      ) : null}

      <DocSection title={t('attackResults.crossEx')} description={t('attackResults.crossExDesc')}>
        {crossEx.map((question, index) => (
          <View key={index} style={styles.entry}>
            {index > 0 ? <Divider /> : null}
            <Text weight="semibold" style={styles.question} selectable>
              {`"${question.question}"`}
            </Text>
            <Labeled label={t('attackResults.purpose')} text={question.purpose} />
            <Labeled label={t('attackResults.expectedTrap')} text={question.expectedTrap} />
          </View>
        ))}
      </DocSection>

      {output.weighingAnalysis ? (
        <DocSection title={t('attackResults.weighing')} description={t('attackResults.weighingDesc')}>
          <SubHeading>{t('attackResults.currentWeighing')}</SubHeading>
          <Text style={styles.body} selectable>
            {output.weighingAnalysis.currentWeighing}
          </Text>
          <Divider />
          <SubHeading>{t('attackResults.missingComparisons')}</SubHeading>
          <Bullets items={output.weighingAnalysis.missingComparisons ?? []} color={colors.destructive} />
          <Divider />
          <SubHeading>{t('attackResults.improvements')}</SubHeading>
          <Bullets items={output.weighingAnalysis.improvementSuggestions ?? []} marker="→" />
        </DocSection>
      ) : null}

      <ResearchedSources sources={sources} />
    </>
  );
}

const styles = StyleSheet.create({
  score: { borderWidth: 2, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 15 },
  scoreValue: { fontSize: 22 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  summary: { fontSize: 16, lineHeight: 23 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  countText: { fontSize: 14.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  entry: { gap: 8 },
  location: { fontSize: 13.5 },
  question: { fontSize: 15.5, lineHeight: 22 },
  body: { fontSize: 15.5, lineHeight: 22 },
});
