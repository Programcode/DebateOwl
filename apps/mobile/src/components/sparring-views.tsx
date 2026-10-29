import type { SparringScorecard, SparringSpeech } from '@debatelab/core/ai/schemas/sparring';
import { formatRoundTime } from '@debatelab/core/sparring/formats';
import type { SparringSession } from '@debatelab/core/sparring/session';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { PrimaryButton, SecondaryButton } from './buttons';
import { PopIn } from './celebration';
import { Bullets, DocSection, DocumentScreen, Paragraph } from './document';
import { DocumentHeader } from './document-header';
import { Text } from './text';
import { DeliveryFacts } from './voice';

import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { confirmDestructive } from '@/lib/confirm';
import { sharePdf, shareText } from '@/lib/export';
import { shareSparringDocx } from '@/lib/export-docx';
import { sparringExportFileName, sparringExportHtml } from '@/lib/export-html';
import { deleteSparringRound } from '@/lib/sparring';
import { radius } from '@/theme/colors';
import { SPRING, staggerDelay, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

const CATEGORY_MAX = 25;

/** The ballot's headline, as the website's scorecard words it. */
export function winnerText(t: TFunction, winner: SparringScorecard['winner']): string {
  return winner === 'user' ? t('sparring.scorecard.userWon') : winner === 'ai' ? t('sparring.scorecard.opponentWon') : t('sparring.scorecard.tie');
}

/** The scorecard as plain text for the share sheet. */
function scorecardText(t: TFunction, session: SparringSession, scorecard: SparringScorecard): string {
  return [
    winnerText(t, scorecard.winner),
    session.motion,
    `${t('sparring.scorecard.yourScore')}: ${scorecard.userScore}/100 · ${t('sparring.scorecard.opponentScore')}: ${scorecard.aiScore}/100`,
    scorecard.categories.map((category) => `${t(`sparring.category.${category.name}`)}: ${t('mobile.sparring.versus', { user: category.userScore, opponent: category.aiScore })}`).join('\n'),
    `${t('sparring.scorecard.verdict')}\n${scorecard.verdict}`,
    `${t('sparring.scorecard.overallFeedback')}\n${scorecard.overallFeedback}`,
  ].join('\n\n');
}

/**
 * A judged round as a document, for a round just finished and a saved one
 * reopened: share, delete with confirmation, Replay for the transcript, and
 * another round. `onDeleted` runs only if the screen is still open for the
 * same account.
 */
export function SparringScorecardScreen({
  session,
  from,
  notice,
  onRestart,
  onDeleted,
  holdEntrance,
}: {
  session: SparringSession & { scorecard: SparringScorecard };
  from: string | undefined;
  notice?: string;
  onRestart: () => void;
  onDeleted: () => void;
  /** The cards and bars wait while a celebration covers them, and arrive as it goes. */
  holdEntrance?: boolean;
}) {
  const { t } = useTranslation();
  const { session: auth } = useAuth();
  const userId = auth?.user.id ?? null;
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [failed, setFailed] = useState('');
  const live = useRef(true);
  const owner = useRef(userId);
  useEffect(() => {
    owner.current = userId;
  }, [userId]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const remove = async () => {
    const forUser = userId;
    if (!forUser) return;
    const confirmed = await confirmDestructive({
      title: t('historyPage.deleteSparringTitle'),
      message: t('historyPage.deleteSparringDesc'),
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed || !live.current || owner.current !== forUser) return;
    try {
      await deleteSparringRound(forUser, session.id);
      if (live.current && owner.current === forUser) onDeleted();
    } catch (cause) {
      console.warn('Could not delete the round:', cause instanceof Error ? cause.message : cause);
      if (live.current) setFailed(t('historyPage.sparringDeleteFailed'));
    }
  };

  const exportWord = async () => {
    try {
      await shareSparringDocx(session, t, t('common.docx'));
    } catch (cause) {
      console.warn('Could not export the round:', cause instanceof Error ? cause.message : cause);
      if (live.current) setFailed(t('mobile.sparring.exportFailed'));
    }
  };

  const exportPdf = async () => {
    try {
      await sharePdf(sparringExportHtml(session, t), sparringExportFileName(session), winnerText(t, session.scorecard.winner));
    } catch (cause) {
      console.warn('Could not export the round:', cause instanceof Error ? cause.message : cause);
      if (live.current) setFailed(t('mobile.sparring.exportFailed'));
    }
  };

  return (
    <DocumentScreen
      testID="sparring-complete"
      outline
      header={
        <DocumentHeader
          backLabel={backLabel(t, from, 'practice')}
          onShare={() => void shareText(winnerText(t, session.scorecard.winner), scorecardText(t, session, session.scorecard)).catch(() => {})}
          actions={[
            // The website's Word and PDF exports of the scorecard and transcript.
            { key: 'word', label: t('common.docx'), symbol: 'doc.text', icon: 'file', onPress: () => void exportWord() },
            { key: 'pdf', label: t('mobile.sparring.exportPdf'), symbol: 'arrow.down.doc', icon: 'download', onPress: () => void exportPdf() },
            { key: 'delete', label: t('common.delete'), symbol: 'trash', icon: 'trash', destructive: true, onPress: () => void remove() },
          ]}
        />
      }
      notice={failed || notice}
      // The mock gives the next round the wider button.
      actionWidths={[1, 1.4]}
      actions={
        <>
          <SecondaryButton label={t('mobile.sparring.replay')} icon="history" onPress={() => setTranscriptOpen((open) => !open)} floating testID="sparring-replay" />
          <PrimaryButton label={t('sparring.scorecard.restart')} onPress={onRestart} floating testID="sparring-restart" />
        </>
      }>
      <SparringScorecardView session={session} scorecard={session.scorecard} transcriptOpen={transcriptOpen} holdEntrance={holdEntrance} />
    </DocumentScreen>
  );
}

/**
 * The round review from mock 06: both totals, the four categories as bars
 * instead of the website's radar chart, and the judge's verdict. Below them
 * come the website's category notes, key moments, what to work on next and
 * the overall feedback, and the transcript when Replay opens it. The totals and
 * cards pop in one after another and the bars fill on a spring, once
 * `holdEntrance` is off.
 */
export function SparringScorecardView({
  session,
  scorecard,
  transcriptOpen,
  holdEntrance = false,
}: {
  session: SparringSession;
  scorecard: SparringScorecard;
  transcriptOpen: boolean;
  holdEntrance?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Speeches the student spoke aloud carry measured facts; typed rounds have none.
  const spokenSpeeches = session.speeches.filter((speech) => speech.speaker === 'user' && speech.delivery);
  const spokenRound = spokenSpeeches.length > 0;
  return (
    <View style={styles.scorecard} testID="sparring-scorecard">
      <View style={styles.heading}>
        <Text tone="faint" style={styles.eyebrow}>
          {t('sparring.scorecard.eyebrow')}
        </Text>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {winnerText(t, scorecard.winner)}
        </Text>
        <Text tone="faint" style={styles.motion} numberOfLines={3}>
          {session.motion}
        </Text>
      </View>

      <PopIn index={0} hold={holdEntrance}>
        <View style={styles.totals}>
          <View
            style={[styles.total, styles.totalOwn, { backgroundColor: colors.primaryFill, borderBottomColor: colors.primaryLedge }]}
            accessible
            accessibilityLabel={`${t('sparring.scorecard.yourScore')}: ${scorecard.userScore}`}>
            <Text style={[styles.totalLabel, styles.onGradient]}>{t('sparring.scorecard.yourScore')}</Text>
            <Text weight="bold" style={[styles.totalValue, styles.onGradient]} testID="sparring-user-score">
              {scorecard.userScore}
            </Text>
          </View>
          <View style={[styles.total, { backgroundColor: colors.card, borderColor: colors.border }, styles.totalBorder]} accessible accessibilityLabel={`${t('sparring.scorecard.opponentScore')}: ${scorecard.aiScore}`}>
            <Text tone="faint" style={styles.totalLabel}>
              {t('sparring.scorecard.opponentScore')}
            </Text>
            <Text weight="bold" tone="secondary" style={styles.totalValue}>
              {scorecard.aiScore}
            </Text>
          </View>
        </View>
      </PopIn>

      <PopIn index={1} hold={holdEntrance}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="sparring-categories">
          <View style={styles.cardHead}>
            <Text accessibilityRole="header" weight="bold" style={styles.cardTitle}>
              {t('sparring.scorecard.categoryBalance')}
            </Text>
            <Text tone="faint" style={styles.cardDescription}>
              {t('sparring.scorecard.categoryDescription')}
            </Text>
          </View>
          {scorecard.categories.map((category, index) => (
            <View
              key={category.name}
              style={styles.category}
              accessible
              accessibilityLabel={`${t(`sparring.category.${category.name}`)}. ${t('sparring.scorecard.accessibleCategoryScore', { user: category.userScore, opponent: category.aiScore })}`}>
              <View style={styles.categoryLine}>
                <Text weight="semibold" style={styles.categoryName}>
                  {t(`sparring.category.${category.name}`)}
                </Text>
                <Text tone="faint" style={styles.categoryScores}>
                  {t('mobile.sparring.versus', { user: category.userScore, opponent: category.aiScore })}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.line }]}>
                <CategoryFill share={category.userScore / CATEGORY_MAX} index={index} hold={holdEntrance} color={colors.primaryFill} />
                {/* The opponent's score is the tick on the same bar. */}
                <View style={[styles.tick, { left: `${(category.aiScore / CATEGORY_MAX) * 100}%`, backgroundColor: colors.secondary }]} />
              </View>
            </View>
          ))}
        </View>
      </PopIn>

      <PopIn index={2} hold={holdEntrance}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="sparring-verdict">
          <Text accessibilityRole="header" weight="bold" style={styles.cardTitle}>
            {t('sparring.scorecard.verdict')}
          </Text>
          <Text tone="secondary" style={styles.verdict} selectable>
            {scorecard.verdict}
          </Text>
        </View>
      </PopIn>

      <DocSection
        title={t('sparring.scorecard.categoryNotes')}
        description={spokenRound ? t('voiceRound.scorecard.categoryNotesDescription') : t('sparring.scorecard.categoryNotesDescription')}>
        {scorecard.categories.map((category) => (
          <View key={category.name} style={styles.note}>
            <Text weight="semibold" style={styles.noteTitle}>
              {t(`sparring.category.${category.name}`)}
              {category.name === 'Delivery' ? (
                <Text tone="faint" style={styles.noteHint}>{`  ${spokenRound ? t('voiceRound.scorecard.measuredOnly') : t('sparring.scorecard.writtenOnly')}`}</Text>
              ) : null}
            </Text>
            <Text tone="secondary" style={styles.noteText} selectable>
              {category.feedback}
            </Text>
          </View>
        ))}
      </DocSection>

      {spokenRound ? (
        <DocSection title={t('voiceRound.delivery.title')} description={t('mobile.voice.deliveryDescription')} testID="spoken-delivery">
          {spokenSpeeches.map((speech) => (
            <View key={speech.id} style={styles.note}>
              <Text weight="semibold" style={styles.noteTitle}>
                {t(`sparring.turns.${speech.turnId}`)}
              </Text>
              <DeliveryFacts delivery={speech.delivery!} timeLimitSeconds={speech.timeLimitSeconds} />
            </View>
          ))}
        </DocSection>
      ) : null}

      <DocSection title={t('sparring.scorecard.keyMoments')}>
        {scorecard.keyMoments.length > 0 ? <Bullets items={scorecard.keyMoments} /> : <Text tone="faint">{t('sparring.scorecard.noKeyMoments')}</Text>}
      </DocSection>
      <DocSection title={t('sparring.scorecard.workOnNext')}>
        {scorecard.improvementAreas.length > 0 ? (
          <Bullets items={scorecard.improvementAreas} color={colors.warning} />
        ) : (
          <Text tone="faint">{t('sparring.scorecard.noImprovementAreas')}</Text>
        )}
      </DocSection>
      <DocSection title={t('sparring.scorecard.overallFeedback')}>
        <Paragraph text={scorecard.overallFeedback} />
      </DocSection>

      {transcriptOpen ? (
        <DocSection
          title={t('sparring.scorecard.fullTranscript')}
          description={t('sparring.scorecard.transcriptDescription', { count: session.speeches.length, format: t(`sparring.format.${session.format}`) })}
          testID="sparring-transcript">
          <SparringTranscript speeches={session.speeches} />
        </DocSection>
      ) : null}
    </View>
  );
}

/**
 * A category's bar, grown from empty on a spring after the cards arrive, one bar after another.
 * The spring's overshoot never runs past the end of the track. Under Reduce Motion it is full at once.
 */
function CategoryFill({ share, index, hold, color }: { share: number; index: number; hold: boolean; color: string }) {
  const reduce = useReduceMotion();
  const grow = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      grow.set(1);
      return;
    }
    if (!hold) grow.set(withDelay(120 + staggerDelay(index) * 2, withSpring(1, SPRING.settle)));
  }, [grow, hold, index, reduce]);
  const style = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, share * grow.value)) * 100}%` }));
  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

/** Every speech of a round, who gave it, and the time it took, as the website's transcript. */
export function SparringTranscript({ speeches }: { speeches: SparringSpeech[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (speeches.length === 0) {
    return (
      <Text tone="faint" style={styles.noteText}>
        {t('sparring.round.transcriptEmpty')}
      </Text>
    );
  }
  return (
    <View style={styles.speeches}>
      {speeches.map((speech, index) => (
        <View key={speech.id} style={[styles.speech, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]} testID="sparring-speech">
          <View style={styles.speechHead}>
            <Text weight="semibold" style={[styles.speaker, speech.speaker === 'user' && { color: colors.primary }]} numberOfLines={1}>
              {`${speech.speaker === 'user' ? t('sparring.user') : t('sparring.opponent')} · ${t(`sparring.turns.${speech.turnId}`, { defaultValue: speech.role })}`}
            </Text>
            <Text tone="faint" style={styles.used}>
              {speech.speaker === 'ai'
                ? t('sparring.round.estimatedTimeUsed', { time: formatRoundTime(speech.timeUsedSeconds) })
                : t('sparring.round.timeUsed', { time: formatRoundTime(speech.timeUsedSeconds) })}
            </Text>
          </View>
          <Paragraph text={speech.content} tone="foreground" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scorecard: { gap: 12 },
  heading: { gap: 2, marginBottom: 2 },
  eyebrow: { fontSize: 15 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  motion: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  totals: { flexDirection: 'row', gap: 10 },
  total: { flex: 1, borderRadius: radius.card + 2, paddingHorizontal: 15, paddingVertical: 13, overflow: 'hidden', gap: 2 },
  totalOwn: { borderWidth: 0, borderBottomWidth: 4 },
  totalBorder: { borderWidth: 2 },
  totalLabel: { fontSize: 14.5 },
  onGradient: { color: '#FFFFFF' },
  totalValue: { fontSize: 38, lineHeight: 44, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  card: { borderWidth: 2, borderRadius: radius.card + 1, paddingHorizontal: 16, paddingVertical: 15, gap: 10 },
  cardHead: { gap: 2, marginBottom: 2 },
  cardTitle: { fontSize: 16.5 },
  cardDescription: { fontSize: 14, lineHeight: 19 },
  category: { gap: 6 },
  categoryLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  categoryName: { fontSize: 15.5, flexShrink: 1 },
  categoryScores: { fontSize: 15, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  tick: { position: 'absolute', top: -3, width: 2.5, height: 14, borderRadius: 1, marginLeft: -1 },
  verdict: { fontSize: 15.5, lineHeight: 22.5 },
  note: { gap: 3 },
  noteTitle: { fontSize: 15.5 },
  noteHint: { fontSize: 13.5 },
  noteText: { fontSize: 15, lineHeight: 21.5 },
  speeches: { gap: 0 },
  speech: { gap: 6, paddingVertical: 10 },
  speechHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  speaker: { fontSize: 15, flexShrink: 1 },
  used: { fontSize: 13.5, fontVariant: ['tabular-nums'] },
});
