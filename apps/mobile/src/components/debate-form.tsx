import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { MainActionButton } from './buttons';
import { Card } from './card';
import { Field } from './field';
import { FormGroup, SelectRow } from './form-rows';
import { Icon } from './icon';
import { Text } from './text';

import {
  DEBATE_FORMATS,
  DEBATE_ROLES,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_JUDGE_LENGTH,
  MAX_MOTION_LENGTH,
  ROLE_LABEL_KEYS,
  type Debate,
  type DebateSettings,
} from '@/lib/debates';
import { runRequest } from '@/lib/run-request';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/use-theme';

export interface DebateFormValues {
  motion: string;
  settings: DebateSettings;
  instructions: string;
}

/**
 * The website's DebateForm: motion, format, your role and instructions, with
 * its limits and counters. The app adds the judge, which the website stores
 * and its prompts read as "Judge expectations" but its form does not show.
 * Settings the form does not show are kept.
 */
export function DebateForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<Pick<Debate, 'motion' | 'settings' | 'instructions'>>;
  submitLabel: string;
  onSubmit: (values: DebateFormValues) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [motion, setMotion] = useState(initial?.motion ?? '');
  const [format, setFormat] = useState(initial?.settings?.format ?? 'custom');
  const [role, setRole] = useState(initial?.settings?.role ?? 'general');
  const [judge, setJudge] = useState(initial?.settings?.judge ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [saving, setSaving] = useState(false);
  // One tap is one save: a second tap before the button re-renders busy is ignored.
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const count = (value: string, max: number) => `${value.length.toLocaleString(i18n.language)}/${max.toLocaleString(i18n.language)}`;

  const submit = async () => {
    // The button stays disabled until there is a motion, as on the website.
    if (!motion.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    return await runRequest(async () => {
      const settings: DebateSettings = { ...initial?.settings, format, role };
      if (judge.trim()) settings.judge = judge.trim();
      else delete settings.judge;
      await onSubmit({ motion: motion.trim(), settings, instructions: instructions.trim() });
      haptics.success();
    }, async (cause) => {
      console.warn('Could not save the debate:', cause instanceof Error ? cause.message : cause);
      haptics.warning();
      setError(t('debate.saveFailed'));
    }, () => {
      savingRef.current = false;
      setSaving(false);
    });
  };

  return (
    <>
      <View style={styles.group}>
        <Field
          label={t('debate.motion')}
          placeholder={t('debate.motionPlaceholder')}
          value={motion}
          onChangeText={setMotion}
          maxLength={MAX_MOTION_LENGTH}
          multiline
          autoFocus={!initial?.motion}
          editable={!saving}
          style={styles.motion}
        />
        <Text tone="faint" style={styles.counter}>
          {count(motion, MAX_MOTION_LENGTH)}
        </Text>
      </View>

      <View style={styles.group}>
        <Text weight="medium" tone="secondary" style={styles.label}>
          {t('debate.format')}
        </Text>
        <Card style={styles.list}>
          {DEBATE_FORMATS.map((value, index) => {
            const selected = value === format;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: saving }}
                disabled={saving}
                onPress={() => {
                  haptics.select();
                  setFormat(value);
                }}
                style={({ pressed }) => [styles.option, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
                <Text weight={selected ? 'semibold' : 'regular'} style={styles.optionLabel}>
                  {t(`debate.formats.${value}`)}
                </Text>
                {selected ? <Icon name="check" color={colors.primary} size={21} /> : null}
              </Pressable>
            );
          })}
        </Card>
      </View>

      <FormGroup>
        <SelectRow
          first
          label={t('debate.role')}
          value={role}
          disabled={saving}
          testID="debate-role"
          options={[
            ...DEBATE_ROLES.map((value) => ({ value: value as string, label: t(ROLE_LABEL_KEYS[value]) })),
            // A role set elsewhere that this list does not know is kept.
            ...((DEBATE_ROLES as readonly string[]).includes(role) ? [] : [{ value: role, label: role }]),
          ]}
          onChange={setRole}
        />
      </FormGroup>

      <Field
        label={t('mobile.debate.judge')}
        placeholder={t('mobile.debate.judgePlaceholder')}
        hint={t('mobile.debate.judgeHint')}
        value={judge}
        onChangeText={setJudge}
        maxLength={MAX_JUDGE_LENGTH}
        editable={!saving}
      />

      <View style={styles.group}>
        <Field
          label={t('debate.instructions')}
          placeholder={t('debate.instructionsPlaceholder')}
          value={instructions}
          onChangeText={setInstructions}
          maxLength={MAX_INSTRUCTIONS_LENGTH}
          multiline
          editable={!saving}
          style={styles.instructions}
        />
        <Text tone="faint" style={styles.counter}>
          {count(instructions, MAX_INSTRUCTIONS_LENGTH)}
        </Text>
      </View>

      {error ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}

      <MainActionButton label={submitLabel} busy={saving} disabled={!motion.trim()} onPress={() => void submit()} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 21 },
  motion: { minHeight: 96, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  instructions: { minHeight: 110, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  counter: { fontSize: 12.5, textAlign: 'right', marginRight: 4, marginTop: -2, fontVariant: ['tabular-nums'] },
  group: { gap: 7 },
  label: { fontSize: 14, marginLeft: 4 },
  list: { padding: 0, gap: 0 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, gap: 12 },
  optionLabel: { flex: 1, fontSize: 16 },
  pressed: { opacity: 0.6 },
});
