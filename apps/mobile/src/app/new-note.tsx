import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { addSource } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

/** Write a note: a text source in the Current Debate, like the website's manual entry. */
export default function NewNoteSheet() {
  const { t } = useTranslation();
  const router = useRouter();
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
    <SheetScrollView testID="new-note-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
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
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  noteBody: { minHeight: 180, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
});
