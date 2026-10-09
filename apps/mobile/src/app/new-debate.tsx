import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useDebates, type DebateSide } from '@/lib/debate-context';
import { DEBATE_FORMATS, MAX_MOTION_LENGTH, type DebateFormat } from '@/lib/debates';
import { useTheme } from '@/theme/use-theme';

/** Start a debate: motion, side and format, like the website's Start new debate dialog. It becomes current. */
export default function NewDebateSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { create } = useDebates();
  const [motion, setMotion] = useState('');
  const [side, setSide] = useState<DebateSide>('pro');
  const [format, setFormat] = useState<DebateFormat>('custom');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    // The button stays disabled until there is a motion, as on the website.
    if (!motion.trim()) return;
    setSaving(true);
    setError('');
    try {
      // The website's form saves the role too; it has no role picker here yet, so it keeps the default.
      await create({ motion, settings: { format, role: 'general' }, side });
      // Closes this sheet and the switcher under it, if it was opened from there.
      router.dismissAll();
    } catch (cause) {
      console.warn('Could not create the debate:', cause instanceof Error ? cause.message : cause);
      setError(t('debate.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        testID="new-debate-sheet">
        <View style={styles.header}>
          <Text accessibilityRole="header" weight="bold" style={styles.title}>
            {t('debate.startNew')}
          </Text>
          <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={saving} />
        </View>
        <Text tone="secondary" style={styles.body}>
          {t('debate.startNewDesc')}
        </Text>

        <Field
          label={t('debate.motion')}
          placeholder={t('debate.motionPlaceholder')}
          value={motion}
          onChangeText={setMotion}
          maxLength={MAX_MOTION_LENGTH}
          multiline
          autoFocus
          editable={!saving}
          style={styles.motion}
        />

        <View style={styles.group}>
          <Text weight="medium" tone="secondary" style={styles.label}>
            {t('mobile.newDebate.side')}
          </Text>
          <SegmentedControl<DebateSide>
            options={[
              { value: 'pro', label: t('debate.side.pro') },
              { value: 'con', label: t('debate.side.con') },
            ]}
            value={side}
            onChange={setSide}
            disabled={saving}
          />
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
                  onPress={() => setFormat(value)}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                    pressed && styles.pressed,
                  ]}>
                  <Text weight={selected ? 'semibold' : 'regular'} style={styles.optionLabel}>
                    {t(`debate.formats.${value}`)}
                  </Text>
                  {selected ? <Icon name="check" color={colors.primary} size={21} /> : null}
                </Pressable>
              );
            })}
          </Card>
        </View>

        {error ? (
          <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
            {error}
          </Text>
        ) : null}

        <MainActionButton
          label={t('debate.startDebate')}
          busy={saving}
          disabled={!motion.trim()}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 18, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  motion: { minHeight: 96, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  group: { gap: 7 },
  label: { fontSize: 14, marginLeft: 4 },
  list: { padding: 0, gap: 0 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, gap: 12 },
  optionLabel: { flex: 1, fontSize: 16 },
  pressed: { opacity: 0.6 },
});
