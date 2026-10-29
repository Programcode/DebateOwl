import { BUILT_IN_FORMATS, formatDuration } from '@debatelab/core/free-tools/formats';
import { countWords, MAX_WPM, MIN_WPM, PACES, slotFits, spokenSeconds } from '@debatelab/core/free-tools/speech-time';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text-input';
import { DocumentScreen, DocumentTitle, SectionHeading } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { backLabel } from '@/lib/back-label';
import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type PaceId = (typeof PACES)[number]['id'] | 'custom';

/**
 * The website's speech time calculator (src/components/free-tools/
 * SpeechTimeCalculator.tsx), from the same core logic: the words in a
 * speech, how long it runs at a slow, average, fast or your own pace, and
 * which speech slots of the seven formats it fits. Nothing leaves the device.
 */
export default function SpeechTimeScreen() {
  const { t } = useTranslation();
  const tools = (key: string, options?: Record<string, unknown>) => t(key, { ns: 'tools', ...options });
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [customText, setCustomText] = useState('140');
  const [fitPace, setFitPace] = useState<PaceId>('average');

  const words = countWords(text);
  const custom = Number(customText);
  const wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, Number.isFinite(custom) && custom > 0 ? custom : MIN_WPM));
  const paces: { id: PaceId; wpm: number }[] = [...PACES.map((pace) => ({ id: pace.id as PaceId, wpm: pace.wpm as number })), { id: 'custom', wpm }];
  const fitWpm = paces.find((pace) => pace.id === fitPace)?.wpm ?? 130;
  const fits = words > 0 ? slotFits(words, fitWpm, BUILT_IN_FORMATS) : [];

  return (
    <DocumentScreen testID="speech-time" header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}>
      <DocumentTitle title={tools('calc.region')} meta={t('mobile.practice.speechTimeIntro')} />
      <Field
        label={tools('calc.paste')}
        value={text}
        onChangeText={setText}
        placeholder={tools('calc.placeholder')}
        multiline
        style={styles.speech}
        testID="speech-time-text"
      />
      <Text tone="faint" style={styles.note}>
        {t('mobile.practice.calcPrivacy')}
      </Text>

      <View style={[styles.count, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} accessible accessibilityLabel={`${words} ${tools('calc.words', { count: words })}`}>
        <Text weight="bold" style={[styles.countValue, { color: colors.tileText }]} testID="word-count">
          {words}
        </Text>
        <Text style={[styles.countLabel, { color: colors.tileText }]}>{tools('calc.words', { count: words })}</Text>
      </View>

      <SectionHeading title={tools('calc.durations')} />
      <View style={styles.paces}>
        {paces.map((pace) => (
          <View key={pace.id} style={[styles.pace, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`pace-${pace.id}`}>
            <Text tone="secondary" style={styles.paceLabel}>
              {tools(`calc.pace.${pace.id}`)}
            </Text>
            <Text weight="bold" style={styles.paceTime}>
              {formatDuration(spokenSeconds(words, pace.wpm))}
            </Text>
            {pace.id === 'custom' ? (
              <View style={styles.customRow}>
                <AppTextInput
                  value={customText}
                  onChangeText={(value) => setCustomText(value.replace(/[^0-9]/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  accessibilityLabel={tools('calc.customWpm')}
                  style={[styles.customInput, { color: colors.foreground, borderColor: colors.inputBorder, backgroundColor: colors.input }]}
                  testID="custom-wpm"
                />
                <Text tone="faint" style={styles.paceMeta}>
                  {tools('calc.wpm')}
                </Text>
              </View>
            ) : (
              <Text tone="faint" style={styles.paceMeta}>
                {`${pace.wpm} ${tools('calc.wpm')}`}
              </Text>
            )}
          </View>
        ))}
      </View>
      <Text tone="faint" style={styles.note}>
        {tools('calc.approximate')}
      </Text>

      <SectionHeading title={tools('calc.fitsTitle')} />
      <SegmentedControl<PaceId>
        value={fitPace}
        onChange={setFitPace}
        options={paces.map((pace) => ({ value: pace.id, label: tools(`calc.pace.${pace.id}`) }))}
      />
      {fits.length === 0 ? (
        <Text tone="secondary" style={styles.body}>
          {tools('calc.fitsEmpty')}
        </Text>
      ) : (
        <View style={[styles.fits, { backgroundColor: colors.card, borderColor: colors.border }]} testID="slot-fits">
          {fits.map((fit, index) => (
            <View key={`${fit.formatId}-${fit.slotSeconds}`} style={[styles.fit, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <View style={styles.fitText}>
                <Text weight="semibold" style={styles.fitSlot}>
                  {`${fit.formatShortName} ${formatDuration(fit.slotSeconds)}`}
                </Text>
                <Text tone="faint" style={styles.fitRoles} numberOfLines={2}>
                  {fit.roles}
                </Text>
              </View>
              <View style={styles.fitResult}>
                {fit.fits ? <Icon name="check" color={colors.success} size={16} /> : null}
                <Text weight={fit.fits ? 'bold' : 'semibold'} style={[styles.fitValue, { color: fit.fits ? colors.success : colors.destructive }]}>
                  {fit.fits ? tools('calc.spare', { time: formatDuration(fit.spareSeconds) }) : tools('calc.over', { time: formatDuration(-fit.spareSeconds) })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  speech: { minHeight: 180, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top', fontFamily: fontFamily.regular },
  note: { fontSize: 13.5, lineHeight: 19, marginTop: -6 },
  body: { fontSize: 15, lineHeight: 21 },
  count: { borderWidth: 2, borderRadius: radius.card, paddingVertical: 14, alignItems: 'center' },
  countValue: { fontSize: 40, lineHeight: 46, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 15 },
  paces: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pace: { flexGrow: 1, flexBasis: '45%', borderWidth: 2, borderRadius: radius.card, padding: 14, gap: 2 },
  paceLabel: { fontSize: 14 },
  paceTime: { fontSize: 26, lineHeight: 32, fontVariant: ['tabular-nums'] },
  paceMeta: { fontSize: 13 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customInput: { width: 58, height: 32, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, fontSize: 15, fontFamily: fontFamily.regular },
  fits: { borderWidth: 2, borderRadius: radius.card, overflow: 'hidden' },
  fit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  fitText: { flex: 1, gap: 1 },
  fitSlot: { fontSize: 15.5 },
  fitRoles: { fontSize: 13 },
  fitResult: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fitValue: { fontSize: 14.5, fontVariant: ['tabular-nums'] },
});
