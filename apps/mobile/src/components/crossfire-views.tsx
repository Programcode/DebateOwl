import type { CrossfireDebrief, CrossfireTurn } from '@debatelab/core/crossfire/schemas';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PopIn } from './celebration';
import { Callout, DocSection, Paragraph, Tag } from './document';
import { Icon } from './icon';
import { Text } from './text';

import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** One option card of a radio group, as the website's mode and style cards: a label, a line under it and a check. */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text weight="medium" tone="secondary" style={styles.groupLabel}>
        {label}
      </Text>
      <View style={[styles.cards, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              testID={`${testIDPrefix}-${option.value}`}
              style={({ pressed }) => [styles.card, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && styles.pressed]}>
              <View style={styles.cardText}>
                <Text weight={selected ? 'semibold' : 'regular'} style={styles.cardLabel}>
                  {option.label}
                </Text>
                <Text tone="faint" style={styles.cardDescription}>
                  {option.description}
                </Text>
              </View>
              {selected ? <Icon name="check" color={colors.primary} size={20} /> : <View style={styles.checkSpace} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The labels of a turn's live coaching signal, as the website's badges. */
function SignalTags({ turn }: { turn: CrossfireTurn }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const signal = turn.kind === 'answer' ? turn.signal : undefined;
  if (!signal) return null;
  return (
    <View style={styles.tags} accessibilityLabel={t('crossfire.liveSignals')} testID="crossfire-signal">
      <View accessible accessibilityLabel={t('crossfire.signalConfidence', { label: t(`crossfire.signalQuality.${signal.answerQuality}`), percent: Math.round(signal.answerQualityConfidence * 100) })}>
        <Tag label={t(`crossfire.signalQuality.${signal.answerQuality}`)} />
      </View>
      <View accessible accessibilityLabel={t('crossfire.signalConfidence', { label: t(`crossfire.signalConcession.${signal.concession}`), percent: Math.round(signal.concessionConfidence * 100) })}>
        <Tag label={t(`crossfire.signalConcession.${signal.concession}`)} />
      </View>
      {signal.followUpOpportunity > 0.7 ? (
        <View accessible accessibilityLabel={t('crossfire.signalProbability', { label: t('crossfire.signalFollowUp'), percent: Math.round(signal.followUpOpportunity * 100) })}>
          <Tag label={t('crossfire.signalFollowUp')} color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}

/** The exchange so far: the student's turns on the right, the opponent's on the left, each with its id. */
export function CrossfireTranscript({ turns }: { turns: CrossfireTurn[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (turns.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Text tone="faint" style={styles.emptyText}>
          {t('crossfire.emptyDesc')}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.turns} accessibilityLabel={t('crossfire.transcript')} testID="crossfire-transcript">
      {turns.map((turn) => {
        const mine = turn.speaker === 'user';
        return (
          <View
            key={turn.id}
            style={[
              styles.turn,
              mine
                ? [styles.mine, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]
                : [styles.theirs, { backgroundColor: colors.card, borderColor: colors.border }],
            ]}
            testID="crossfire-turn">
            <View style={styles.turnHead}>
              <Text weight="bold" style={styles.turnId}>
                {turn.id}
              </Text>
              <Text tone="faint" style={styles.turnKind}>
                {turn.kind === 'question' ? t('crossfire.question') : t('crossfire.answer')}
              </Text>
            </View>
            <Text style={[styles.turnText, mine && { color: colors.tileText }]} selectable>
              {turn.text}
            </Text>
            <SignalTags turn={turn} />
          </View>
        );
      })}
    </View>
  );
}

/** The transcript turns a debrief point rests on. */
function TurnRefs({ turnIds }: { turnIds: string[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.refs} accessible accessibilityLabel={`${t('crossfire.transcriptReferences')}: ${turnIds.join(', ')}`}>
      {turnIds.map((id, index) => (
        <View key={`${id}-${index}`} style={[styles.ref, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]}>
          <Text weight="semibold" style={[styles.refText, { color: colors.chipSelectedForeground }]}>
            {id}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Findings({ title, items }: { title: string; items: { turnIds: string[]; claim: string }[] }) {
  const { t } = useTranslation();
  return (
    <DocSection title={title}>
      {items.length === 0 ? (
        <Text tone="faint" style={styles.none}>
          {t('crossfire.noGroundedFinding')}
        </Text>
      ) : (
        items.map((item, index) => (
          <View key={index} style={styles.finding}>
            <Paragraph text={item.claim} tone="foreground" />
            <TurnRefs turnIds={item.turnIds} />
          </View>
        ))
      )}
    </DocSection>
  );
}

/**
 * The debrief as a document (mock 03's style), in the website's order. Its parts pop in one
 * after another, once `holdEntrance` (a celebration over them) is off.
 */
export function CrossfireDebriefDocument({ debrief, holdEntrance = false }: { debrief: CrossfireDebrief; holdEntrance?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.debrief} testID="crossfire-debrief">
      <PopIn index={0} hold={holdEntrance}>
        <Findings title={t('crossfire.concessionsSecured')} items={debrief.concessionsSecured} />
      </PopIn>
      <PopIn index={1} hold={holdEntrance}>
        <Findings title={t('crossfire.controlledQuestions')} items={debrief.controlledQuestions} />
      </PopIn>
      <PopIn index={2} hold={holdEntrance}>
        <Findings title={t('crossfire.weakOrRepetitiveQuestions')} items={debrief.weakOrRepetitiveQuestions} />
      </PopIn>
      <PopIn index={3} hold={holdEntrance}>
        <Findings title={t('crossfire.evasiveOrIncompleteAnswers')} items={debrief.evasiveOrIncompleteAnswers} />
      </PopIn>
      <PopIn index={4} hold={holdEntrance}>
        <Findings title={t('crossfire.missedFollowUps')} items={debrief.missedFollowUps} />
      </PopIn>
      <PopIn index={5} hold={holdEntrance}>
        <DocSection title={t('crossfire.betterFollowUpQuestions')}>
          {debrief.betterFollowUpQuestions.length === 0 ? (
            <Text tone="faint" style={styles.none}>
              {t('crossfire.noGroundedFinding')}
            </Text>
          ) : (
            debrief.betterFollowUpQuestions.map((item, index) => (
              <View key={index} style={styles.finding}>
                <Text weight="semibold" style={styles.question} selectable>
                  {item.question}
                </Text>
                <Paragraph text={item.reason} />
                <TurnRefs turnIds={item.turnIds} />
              </View>
            ))
          )}
        </DocSection>
      </PopIn>
      <PopIn index={6} hold={holdEntrance}>
        <View style={styles.strongest}>
          <Callout title={t('crossfire.strongestExchange')}>
            {debrief.strongestExchange ? (
              <View style={styles.finding}>
                <Paragraph text={debrief.strongestExchange.claim} tone="foreground" />
                <TurnRefs turnIds={debrief.strongestExchange.turnIds} />
              </View>
            ) : (
              <Text tone="faint" style={styles.none}>
                {t('crossfire.noGroundedFinding')}
              </Text>
            )}
          </Callout>
        </View>
      </PopIn>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  cards: { borderWidth: 2, borderRadius: radius.field, overflow: 'hidden' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11, minHeight: 56 },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { fontSize: 16.5 },
  cardDescription: { fontSize: 14, lineHeight: 19 },
  checkSpace: { width: 20 },
  pressed: { opacity: 0.7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.card, padding: 22 },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  turns: { gap: 10 },
  turn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, gap: 5, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  turnHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  turnId: { fontSize: 13 },
  turnKind: { fontSize: 13 },
  turnText: { fontSize: 16, lineHeight: 23 },
  refs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ref: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  refText: { fontSize: 12.5, lineHeight: 17 },
  none: { fontSize: 15, lineHeight: 21 },
  finding: { gap: 8 },
  question: { fontSize: 15.5, lineHeight: 22 },
  debrief: { gap: 4 },
  strongest: { marginTop: 12 },
});
