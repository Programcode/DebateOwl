import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { FolderSelect } from '@/components/folder-select';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { haptics } from '@/lib/haptics';
import { queueAddSource } from '@/lib/offline-queue';
import { forgetSharedNote, sharedNote } from '@/lib/share-intent';
import { useLibraryFolders } from '@/lib/use-library-folders';
import { useTheme } from '@/theme/use-theme';

/**
 * Write a note: a text source in the Current Debate, like the website's manual
 * entry. Offline it is kept on the phone and added once the connection is back.
 * Text shared from another app (share-intent.ts) opens it filled in.
 */
export default function NewNoteSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { current } = useDebates();
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const [title, setTitle] = useState(() => (shared ? sharedNote()?.title ?? '' : ''));
  const [content, setContent] = useState(() => (shared ? sharedNote()?.text ?? '' : ''));
  useEffect(() => {
    if (shared) forgetSharedNote();
  }, [shared]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const { folders } = useLibraryFolders(current?.id ?? null);
  const [folder, setFolder] = useState('General');

  const ready = Boolean(title.trim() && content.trim());

  const save = async () => {
    const userId = session?.user.id;
    if (!ready || !userId || !current) return;
    setSaving(true);
    setError('');
    try {
      const { status } = await queueAddSource(userId, { title: title.trim(), content: content.trim(), type: 'text', folder, debateId: current.id });
      toast(status === 'saved'
        ? { tone: 'success', title: t('libraryPage.sourceSaved', { title: title.trim() }) }
        : { tone: 'info', title: t('mobile.offlineQueue.noteQueuedTitle'), message: t('mobile.offlineQueue.noteQueuedDesc') });
      router.back();
    } catch (cause) {
      console.warn('Could not save the note:', cause instanceof Error ? cause.message : cause);
      haptics.warning();
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
          <FolderSelect folders={folders} value={folder} onChange={setFolder} disabled={saving} />
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
