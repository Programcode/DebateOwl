import { drawMotions, filterMotions, motionText, NO_FILTERS, type MotionFilters, type MotionWording } from '@debatelab/core/free-tools/motion-bank';
import { MOTION_DIFFICULTIES, MOTION_TOPICS, MOTION_TYPES, type PracticeMotion } from '@debatelab/core/free-tools/motion-types';
import { PRACTICE_MOTIONS } from '@debatelab/core/free-tools/practice-motions';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, SecondaryButton, TextButton } from '@/components/buttons';
import { Chip } from '@/components/chip';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { EmptyState } from '@/components/empty-state';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { backLabel } from '@/lib/back-label';
import { copyText, shareText } from '@/lib/export';
import { haptics } from '@/lib/haptics';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

/**
 * The website's motion generator (src/components/free-tools/MotionGenerator.tsx),
 * from the same motion bank: filter by topic, difficulty and type, pick the
 * wording, and draw one motion or three for a veto drill. A drawn motion can
 * be copied, shared, or made a new debate, as the website's "prep both sides"
 * link does.
 */
export default function MotionsScreen() {
  const { t } = useTranslation();
  const tools = (key: string, options?: Record<string, unknown>) => t(key, { ns: 'tools', ...options });
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { colors } = useTheme();
  const [filters, setFilters] = useState<MotionFilters>(NO_FILTERS);
  const [wording, setWording] = useState<MotionWording>('house');
  const [shown, setShown] = useState<PracticeMotion[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const pool = filterMotions(PRACTICE_MOTIONS, filters);
  const filtered = filters.topics.length + filters.difficulties.length + filters.types.length > 0;
  const draw = (count: number) => {
    haptics.success();
    setCopied(null);
    setShown((current) => drawMotions(pool, count, Math.random, current.map((motion) => motion.id)));
  };

  const chips = <K extends keyof MotionFilters>(key: K, values: readonly MotionFilters[K][number][], label: (value: MotionFilters[K][number]) => string) => (
    <View style={styles.chips}>
      {values.map((value) => (
        <Chip
          key={value}
          label={label(value)}
          selected={(filters[key] as string[]).includes(value)}
          onPress={() => setFilters((current) => ({ ...current, [key]: toggle(current[key] as string[], value) }))}
          testID={`motion-filter-${value}`}
        />
      ))}
    </View>
  );

  return (
    <DocumentScreen
      testID="motions"
      header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
      actionWidths={[1, 1.3]}
      actions={
        <>
          <SecondaryButton floating label={tools('motions.drawThree')} onPress={() => draw(3)} disabled={pool.length < 3} testID="motions-draw-three" />
          <PrimaryButton floating icon="sparkles" label={tools('motions.drawOne')} onPress={() => draw(1)} disabled={pool.length === 0} testID="motions-draw" />
        </>
      }>
      <DocumentTitle title={tools('motions.region')} meta={t('mobile.practice.motionsIntro')} />

      {shown.length === 0 ? (
        <EmptyState pose="point" title={tools('motions.region')} description={tools('motions.empty')} />
      ) : (
        <View style={styles.cards} accessibilityLiveRegion="polite">
          {shown.map((motion, index) => {
            const text = motionText(motion, wording);
            return (
              <View key={motion.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primaryFill }]} testID="motion-card">
                {shown.length > 1 ? (
                  <Text tone="faint" weight="semibold" style={styles.option}>
                    {tools('motions.optionN', { n: index + 1 })}
                  </Text>
                ) : null}
                <Text weight="display" style={styles.motion} selectable>
                  {text}
                </Text>
                {motion.infoSlide ? (
                  <Text tone="secondary" style={styles.info}>
                    <Text weight="semibold">{`${tools('motions.infoSlide')} `}</Text>
                    {motion.infoSlide}
                  </Text>
                ) : null}
                <Text tone="faint" style={styles.meta}>
                  {[tools(`motions.topics.${motion.topic}`), tools(`motions.difficulties.${motion.difficulty}`), tools(`motions.types.${motion.type}`)].join(', ')}
                </Text>
                <View style={styles.cardActions}>
                  <TextButton
                    label={copied === motion.id ? tools('motions.copied') : tools('motions.copy')}
                    onPress={() => {
                      void copyText(text).then(() => {
                        haptics.success();
                        setCopied(motion.id);
                      });
                    }}
                  />
                  <TextButton label={t('mobile.library.share')} onPress={() => void shareText(text, text).catch(() => {})} />
                </View>
                <TextButton label={tools('motions.prepCta')} onPress={() => router.push({ pathname: '/new-debate', params: { motion: text } })} />
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.group}>
        <Text weight="medium" tone="secondary" style={styles.groupLabel}>
          {tools('motions.wording')}
        </Text>
        <SegmentedControl<MotionWording>
          value={wording}
          onChange={setWording}
          options={[{ value: 'house', label: tools('motions.wordingHouse') }, { value: 'resolved', label: tools('motions.wordingResolved') }]}
        />
      </View>
      <View style={styles.group}>
        <Text weight="medium" tone="secondary" style={styles.groupLabel}>
          {tools('motions.topic')}
        </Text>
        {chips('topics', MOTION_TOPICS, (topic) => tools(`motions.topics.${topic}`))}
      </View>
      <View style={styles.group}>
        <Text weight="medium" tone="secondary" style={styles.groupLabel}>
          {tools('motions.difficulty')}
        </Text>
        {chips('difficulties', MOTION_DIFFICULTIES, (level) => tools(`motions.difficulties.${level}`))}
      </View>
      <View style={styles.group}>
        <Text weight="medium" tone="secondary" style={styles.groupLabel}>
          {tools('motions.type')}
        </Text>
        {chips('types', MOTION_TYPES, (type) => tools(`motions.types.${type}`))}
      </View>
      <View style={styles.poolRow}>
        <Text tone="secondary" style={styles.pool} accessibilityLiveRegion="polite" testID="motions-pool">
          {tools('motions.poolSize', { count: pool.length })}
        </Text>
        {filtered ? <TextButton label={tools('motions.clearFilters')} onPress={() => setFilters(NO_FILTERS)} /> : null}
      </View>
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  cards: { gap: 12 },
  card: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 8 },
  option: { fontSize: 13.5 },
  motion: { fontSize: 21, lineHeight: 28 },
  info: { fontSize: 14.5, lineHeight: 20 },
  meta: { fontSize: 13.5 },
  cardActions: { flexDirection: 'row', gap: 18 },
  group: { gap: 8 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  poolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pool: { fontSize: 14.5 },
});
