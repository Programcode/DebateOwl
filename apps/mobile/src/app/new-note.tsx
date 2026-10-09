import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { addSource } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

/** Write a note: a text source in the Current Debate, like the website's manual entry. */
export default function NewNoteSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { current } = useDebates();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = Boolean(title.trim() && content.trim());

  const save = async () => {
    const userId = session?.user.id;
    if (!ready || !userId || !current) return;
    setSaving(true);
    setError('');
    try {
      await addSource(userId, { title: title.trim(), content: content.trim(), type: 'text', debateId: current.id });
      router.back();
    } catch (cause) {
      console.warn('Could not save the note:', cause instanceof Error ? cause.message : cause);
      setError(t('mobile.library.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        testID="new-note-sheet">
        <View style={styles.header}>
          <Text accessibilityRole="header" weight="bold" style={styles.title}>
            {t('mobile.library.writeNote')}
          </Text>
          <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={saving} />
        </View>

        {!current ? (
          <Text tone="secondary" style={styles.body}>
            {t('debate.libraryNeedsDebate')}
          </Text>
        ) : (
          <>
            <Field
              label={t('libraryPage.titleLabel')}
              placeholder={t('libraryPage.titlePlaceholder')}
              value={title}
              onChangeText={setTitle}
              autoFocus
              editable={!saving}
            />
            <Field
              label={t('libraryPage.contentLabel')}
              placeholder={t('libraryPage.contentPlaceholder')}
              value={content}
              onChangeText={setContent}
              multiline
              editable={!saving}
              style={styles.noteBody}
            />
            {error ? (
              <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
                {error}
              </Text>
            ) : null}
            <MainActionButton label={t('common.save')} busy={saving} disabled={!ready} onPress={() => void save()} />
          </>
        )}
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
  noteBody: { minHeight: 180, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
});
