import type { NativeStackNavigationProp } from 'expo-router';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { PrimaryButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { openResult, updateOpenResult } from '@/lib/open-results';
import { saveCase } from '@/lib/results';
import { useTheme } from '@/theme/use-theme';

/**
 * The website's Save case dialog: a title, then the case saved outside any
 * debate (saveCurrentCase). The title starts as the motion, or the thesis.
 */
export default function SaveCaseSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const toast = useToast();
  const saved = useRef(false);
  useEffect(() => navigation.addListener('transitionEnd', (event) => {
    if (event.data.closing && saved.current) {
      saved.current = false;
      toast({ tone: 'success', title: t('generate.saved') });
    }
  }), [navigation, toast, t]);
  const { colors } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useAuth();
  const held = key ? openResult(key, 'case') : undefined;
  const motion = typeof held?.input.motion === 'string' ? held.input.motion : '';
  const [title, setTitle] = useState(() => motion || held?.output.caseStructure.thesis.slice(0, 50) || held?.title || '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    const userId = session?.user.id;
    const name = title.trim();
    // The case on screen when Save is pressed is the one saved, even if a regeneration lands meanwhile.
    const current = key ? openResult(key, 'case') : undefined;
    if (!userId || !name || !current || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const savedId = await saveCase(userId, name, current.output);
      updateOpenResult(key, { savedId, title: name });
      saved.current = true;
      router.back();
      // Web has no native sheet transition. Native waits for transitionEnd above.
      if (Platform.OS === 'web') {
        requestAnimationFrame(() => {
          saved.current = false;
          toast({ tone: 'success', title: t('generate.saved') });
        });
      }
    } catch (cause) {
      console.warn('Could not save the case:', cause instanceof Error ? cause.message : cause);
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <SheetScrollView testID="save-case-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('generate.saveCase')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={saving} />
      </View>
      <Text tone="secondary" style={styles.body}>
        {t('generate.savePrompt')}
      </Text>
      <Field
        label={t('generate.caseTitle')}
        value={title}
        onChangeText={setTitle}
        maxLength={300}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        editable={!saving}
        testID="save-case-title"
      />
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
          {`${t('ask.saveFailed')}. ${t('generate.saveFailedDesc')}`}
        </Text>
      ) : null}
      <PrimaryButton label={t('common.save')} icon="download" busy={saving} disabled={!title.trim() || !held} onPress={() => void save()} testID="save-case-confirm" />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
});
