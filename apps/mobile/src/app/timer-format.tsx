import { CUSTOM_LIMITS, customToRoundFormat, parseCustomFormat, roundFormatToCustom, type CustomFormat, type CustomSegment } from '@debatelab/core/free-tools/custom-format';
import { initialRoundState } from '@debatelab/core/free-tools/round-timer';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { MainActionButton, SecondaryButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { FormGroup, SwitchRow } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { SegmentedControl } from '@/components/segmented-control';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { haptics } from '@/lib/haptics';
import { formatFor, formatName } from '@/lib/timer';
import { getTimer, saveFormat, updateSession } from '@/lib/timer-store';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const clampSeconds = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));
const minutesText = (seconds: number) => String(Math.round((seconds / 60) * 100) / 100);

/**
 * Minutes as typed, as the website's MinutesInput: the field keeps its own
 * text while it is edited, so it can be cleared and retyped, and reports
 * whole seconds within bounds. 4 or 2.5 minutes are both fine.
 */
function MinutesField({ label, seconds, min, max, onChange, testID }: {
  label: string; seconds: number; min: number; max: number; onChange: (seconds: number) => void; testID?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field
      label={label}
      value={text ?? minutesText(seconds)}
      keyboardType="decimal-pad"
      onFocus={() => setText(minutesText(seconds))}
      onBlur={() => setText(null)}
      onChangeText={(value) => {
        setText(value);
        const minutes = Number(value.replace(',', '.'));
        if (value.trim() !== '' && Number.isFinite(minutes)) onChange(clampSeconds(minutes * 60, min, max));
      }}
      testID={testID}
    />
  );
}

function SmallIconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.segmentTrack }, (pressed || disabled) && styles.dimmed]}>
      <Icon name={icon} color={colors.foreground} size={18} />
    </Pressable>
  );
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The website's custom format editor as a sheet: name the format, set prep
 * time, and add, rename, time, reorder and remove speeches. "Use this format"
 * saves it on the device and starts a fresh round with it. A new format
 * starts from the one on the timer, as on the website.
 */
export default function TimerFormatSheet() {
  const { t } = useTranslation();
  const tools = (key: string, options?: Record<string, unknown>) => t(key, { ns: 'tools', ...options });
  const router = useRouter();
  const { colors } = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [start] = useState(() => {
    const { choice } = getTimer().session;
    if (mode === 'edit' && choice.id === 'custom') return { draft: choice.custom, savedId: choice.savedId };
    const base = roundFormatToCustom(formatFor(choice));
    return { draft: { ...base, name: `${formatName(choice, formatFor(choice), t)} (${tools('custom.defaultName')})`.slice(0, CUSTOM_LIMITS.name) }, savedId: undefined };
  });
  const [draft, setDraft] = useState<CustomFormat>(start.draft);

  const setSegment = (index: number, change: Partial<CustomSegment>) =>
    setDraft((current) => ({ ...current, segments: current.segments.map((segment, i) => (i === index ? { ...segment, ...change } : segment)) }));
  const move = (index: number, delta: number) => {
    haptics.select();
    setDraft((current) => {
      const segments = [...current.segments];
      const [moved] = segments.splice(index, 1);
      segments.splice(index + delta, 0, moved);
      return { ...current, segments };
    });
  };
  const remove = (index: number) => {
    haptics.tap();
    setDraft((current) => ({ ...current, segments: current.segments.filter((_, i) => i !== index) }));
  };
  const add = () => {
    haptics.tap();
    setDraft((current) => ({
      ...current,
      segments: [...current.segments, { label: tools('custom.newSpeech', { n: current.segments.length + 1 }), seconds: 240, kind: 'speech', side: 'a', poi: false }],
    }));
  };

  // The same limits a shared link is held to on the website; the cleaned format is what is saved.
  const cleaned = parseCustomFormat({ ...draft, name: draft.name.trim() || tools('custom.defaultName') });

  const apply = () => {
    if (!cleaned) return;
    const id = start.savedId ?? newId();
    saveFormat({ id, format: cleaned });
    updateSession((current) => ({ ...current, choice: { id: 'custom', custom: cleaned, savedId: id }, round: initialRoundState(customToRoundFormat(cleaned)) }));
    haptics.success();
    router.back();
  };

  return (
    <SheetScrollView testID="timer-format-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {tools('custom.title')}
        </Text>
        <TextButton label={tools('custom.cancel')} onPress={() => router.back()} />
      </View>

      <Field
        label={tools('custom.name')}
        value={draft.name}
        maxLength={CUSTOM_LIMITS.name}
        onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
        testID="timer-format-name"
      />
      <MinutesField
        label={tools('custom.prepMinutes')}
        seconds={draft.prepSeconds}
        min={0}
        max={CUSTOM_LIMITS.maxPrepSeconds}
        onChange={(prepSeconds) => setDraft((current) => ({ ...current, prepSeconds }))}
        testID="timer-format-prep"
      />

      {draft.segments.map((segment, index) => (
        <View key={index} style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.card }]} testID={`timer-format-speech-${index}`}>
          <View style={styles.segmentHeader}>
            <Text weight="semibold" tone="secondary" style={styles.segmentNumber}>
              {`${index + 1}.`}
            </Text>
            <View style={styles.segmentActions}>
              <SmallIconButton icon="chevronUp" label={tools('custom.moveUp', { label: segment.label })} onPress={() => move(index, -1)} disabled={index === 0} />
              <SmallIconButton icon="chevronDown" label={tools('custom.moveDown', { label: segment.label })} onPress={() => move(index, 1)} disabled={index === draft.segments.length - 1} />
              <SmallIconButton icon="trash" label={tools('custom.remove', { label: segment.label })} onPress={() => remove(index)} disabled={draft.segments.length === 1} />
            </View>
          </View>
          <View style={styles.segmentFields}>
            <View style={styles.labelField}>
              <Field label={tools('custom.label')} value={segment.label} maxLength={CUSTOM_LIMITS.label} invalid={!segment.label.trim()} onChangeText={(label) => setSegment(index, { label })} />
            </View>
            <View style={styles.minutesField}>
              <MinutesField
                label={tools('custom.minutes')}
                seconds={segment.seconds}
                min={CUSTOM_LIMITS.minSeconds}
                max={CUSTOM_LIMITS.maxSeconds}
                onChange={(seconds) => setSegment(index, { seconds })}
              />
            </View>
          </View>
          <Text weight="medium" tone="secondary" style={styles.groupLabel}>
            {tools('custom.kind')}
          </Text>
          <SegmentedControl
            options={[{ value: 'speech', label: tools('custom.kindSpeech') }, { value: 'cross-examination', label: tools('custom.kindQuestions') }]}
            value={segment.kind}
            onChange={(kind) => setSegment(index, { kind, ...(kind === 'speech' ? {} : { poi: false }) })}
          />
          <Text weight="medium" tone="secondary" style={styles.groupLabel}>
            {tools('custom.side')}
          </Text>
          <SegmentedControl
            options={[{ value: 'a', label: tools('custom.sideA') }, { value: 'b', label: tools('custom.sideB') }, { value: 'both', label: tools('custom.sideBoth') }]}
            value={segment.side}
            onChange={(side) => setSegment(index, { side })}
          />
          {segment.kind === 'speech' ? (
            <FormGroup>
              <SwitchRow first label={tools('custom.poi')} value={segment.poi} onChange={(poi) => setSegment(index, { poi })} />
            </FormGroup>
          ) : null}
        </View>
      ))}

      <Text tone="faint" style={styles.hint}>
        {tools('custom.poiHint')}
      </Text>
      <SecondaryButton icon="plus" label={tools('custom.add')} onPress={add} disabled={draft.segments.length >= CUSTOM_LIMITS.segments} testID="timer-format-add" />
      <MainActionButton label={tools('custom.apply')} onPress={apply} disabled={!cleaned} />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, flexShrink: 1 },
  segment: { borderWidth: 2, borderRadius: radius.field, padding: 14, gap: 10 },
  segmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segmentNumber: { fontSize: 16 },
  segmentActions: { flexDirection: 'row', gap: 8 },
  segmentFields: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  labelField: { flex: 1 },
  minutesField: { width: 104 },
  groupLabel: { fontSize: 14, marginLeft: 4, marginBottom: -4 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  hint: { fontSize: 13.5, lineHeight: 19 },
});
