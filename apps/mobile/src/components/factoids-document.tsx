import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { Factoid, FactoidsInput, FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import { SafeWebUrlSchema } from '@debatelab/core/ai/schemas/url';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextButton } from './buttons';
import { ResearchedSources } from './case-document';
import { hostOf, shorten, type CitationTarget } from './citation-target';
import { Bullets, Callout, DocSection, FramingCard, Labeled, NumberedItems, Quote, SectionHeading, Tag } from './document';
import { Icon } from './icon';
import { Text } from './text';

import type { Source } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

/** A citation's address, if it is a real web address: saved rows can be old, so it is checked again. */
function safeCitationUrl(factoid: Partial<Factoid>): string | undefined {
  const parsed = SafeWebUrlSchema.safeParse(factoid.citation?.url);
  return parsed.success ? parsed.data : undefined;
}

/** A factoid's source as a chip: the debate's own copy in the Library when it has one, otherwise the web page. */
function citationChip(factoid: Partial<Factoid>, n: number, library: Source[]): CitationTarget | null {
  const url = safeCitationUrl(factoid);
  if (!url) return null;
  const saved = library.find((source) => source.origin === url);
  return { n, label: shorten(factoid.citation?.publisher || factoid.citation?.title || hostOf(url)), url, sourceId: saved?.id };
}

/**
 * Every part of the website's FactoidsResults in the document style: the
 * verification status, its notes, each verified factoid as a numbered item
 * with its key figure, context, limitations and source, then the searches
 * that would find more.
 */
export function FactoidsDocument({
  output,
  input,
  library,
  sources,
  onCite,
  onSave,
  onSearch,
  saving,
}: {
  output: FactoidsOutput;
  input: Partial<FactoidsInput>;
  library: Source[];
  /** Researched sources, known only for factoids found in this session. */
  sources: DiscoveredSource[];
  onCite: (target: CitationTarget) => void;
  /** Absent on a shared copy: the reader has no Library to keep it in. */
  onSave?: (factoid: Factoid) => void;
  /** Absent on a shared copy: the suggestions are shown as text. */
  onSearch?: (query: string) => void;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const factoids = Array.isArray(output.factoids) ? output.factoids : [];
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];
  const suggestions = Array.isArray(output.searchSuggestions) ? output.searchSuggestions : [];
  const shown = factoids.filter((factoid) => factoid.citation?.verified === 'verified');
  const share = Math.round((shown.length / Math.max(factoids.length, 1)) * 100);
  const sourceType = { any: t('factoidsForm.sourceAny'), academic: t('factoidsForm.sourceAcademic'), government: t('factoidsForm.sourceGovernment'), news: t('factoidsForm.sourceNews') }[input.sourceType ?? 'any'];

  const items = shown.map((factoid, index) => {
    const chip = citationChip(factoid, index + 1, library);
    const citation = [factoid.citation?.title || t('factoidsResults.unknownSource'), [factoid.citation?.publisher || t('factoidsResults.unknown'), factoid.citation?.date].filter(Boolean).join(' • ')].join('\n');
    return {
      key: `${index}`,
      title: factoid.shortClaim,
      summary: [factoid.keyFigure, factoid.citation?.publisher].filter(Boolean).join(' · '),
      body: (
        <>
          <View style={styles.tags}>
            <Tag label={t('factoidsResults.verified')} color={colors.primary} />
            <Text tone="faint" style={styles.relevance}>
              {`${t('factoidsResults.relevance')} ${factoid.relevanceScore}%`}
            </Text>
          </View>
          <Callout title={t('factoidsResults.keyFigure').replace(/:$/, '')}>
            <Text weight="bold" style={styles.figure} selectable>
              {factoid.keyFigure}
            </Text>
          </Callout>
          <Labeled label={t('factoidsResults.context')} text={factoid.context} />
          <Labeled label={t('factoidsResults.limitations')} text={factoid.limitations} />
          <Quote text={citation} chips={chip ? [chip] : []} onCite={onCite} />
          {chip ? null : (
            <Text style={[styles.unverifiedUrl, { color: colors.warning }]}>{t('factoidsResults.urlNeedsVerification')}</Text>
          )}
          <Labeled label={t('factoidsResults.howToUse')} text={factoid.howToUse} />
          {onSave ? (
            <View style={styles.saveRow}>
              <TextButton
                label={t('factoidsResults.saveToLibrary')}
                accessibilityLabel={t('factoidsResults.saveClaimToLibrary', { claim: factoid.shortClaim })}
                onPress={() => onSave(factoid)}
                disabled={saving}
              />
            </View>
          ) : null}
        </>
      ),
    };
  });

  return (
    <>
      <FramingCard
        blocks={[
          { label: t('factoidsForm.direction'), text: input.direction === 'against' ? t('factoidsForm.directionAgainst') : t('factoidsForm.directionFor') },
          { label: t('factoidsForm.sourceType'), text: sourceType ?? '' },
          { label: t('factoidsForm.region').replace(/\s*\(.*\)$/, ''), text: input.region?.trim() ?? '' },
          { label: t('factoidsForm.timeframe').replace(/\s*\(.*\)$/, ''), text: input.timeframe?.trim() ?? '' },
        ].filter((block) => block.text.trim())}
      />

      <DocSection title={t('factoidsResults.verificationStatus')} description={`${shown.length} ${t('factoidsResults.verified')}`} testID="factoids-status">
        <View style={styles.statusRow}>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('factoidsResults.verificationStatus')}
            accessibilityValue={{ min: 0, max: 100, now: share }}
            style={[styles.track, { backgroundColor: colors.line }]}>
            <View style={[styles.fill, { width: `${share}%`, backgroundColor: colors.primaryFill }]} />
          </View>
          <Text weight="semibold" style={styles.percent}>{`${share}%`}</Text>
        </View>
      </DocSection>

      {warnings.length > 0 ? (
        <DocSection title={t('factoidsResults.importantNotes')}>
          <Bullets items={warnings} color={colors.warning} />
        </DocSection>
      ) : null}

      <SectionHeading title={t('factoidsResults.foundCount', { count: shown.length })} description={t('factoidsResults.factoidsDesc')} />
      {items.length > 0 ? (
        <NumberedItems items={items} testID="factoids-items" />
      ) : (
        <DocSection title={t('factoidsResults.factoids')}>
          <Text tone="secondary" style={styles.body}>
            {t('factoidsResults.noVerified')}
          </Text>
        </DocSection>
      )}

      {suggestions.length > 0 ? (
        <DocSection title={t('factoidsResults.findMore')} description={t('factoidsResults.findMoreDesc')} testID="factoids-suggestions">
          {suggestions.map((query, index) => !onSearch ? (
            <View key={index} style={[styles.suggestion, { backgroundColor: colors.background }]}>
              <Text style={styles.suggestionText} selectable>
                {query}
              </Text>
            </View>
          ) : (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${t('factoidsResults.useSuggestion')}: ${query}`}
              onPress={() => onSearch(query)}
              style={({ pressed }) => [styles.suggestion, { backgroundColor: colors.background }, pressed && styles.pressed]}>
              <Text style={styles.suggestionText} selectable>
                {query}
              </Text>
              <Icon name="search" color={colors.primary} size={18} />
            </Pressable>
          ))}
        </DocSection>
      ) : null}

      <ResearchedSources sources={sources} />
    </>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  relevance: { fontSize: 13.5 },
  figure: { fontSize: 18, lineHeight: 24 },
  unverifiedUrl: { fontSize: 13.5 },
  saveRow: { flexDirection: 'row' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  percent: { fontSize: 15 },
  body: { fontSize: 15.5, lineHeight: 22 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  suggestionText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  pressed: { opacity: 0.7 },
});
