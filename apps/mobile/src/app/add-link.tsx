import type { SourceImportOutput } from '@debatelab/core/ai/schemas/source-import';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton, PrimaryButton, TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { addSource, fetchSources, importSourceFromUrl, isDuplicateOrigin } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

/**
 * Paste a link: the import-source Edge Function reads the page into an
 * editable draft, and saving adds it to the Current Debate, as the website's
 * Import from URL does.
 */
export default function AddLinkSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { current } = useDebates();
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<SourceImportOutput | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<'import' | 'save' | null>(null);
  const [error, setError] = useState('');

  const runImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t('libraryPage.importUrlRequired'));
      return;
    }
    setBusy('import');
    setError('');
    try {
      const imported = await importSourceFromUrl(trimmed);
      setDraft(imported);
      setTitle(imported.title);
    } catch (cause) {
      console.warn('Could not import the source:', cause instanceof Error ? cause.message : cause);
      setError(`${t('libraryPage.importFailed')}. ${t('libraryPage.importFailedDesc')}`);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const userId = session?.user.id;
    if (!draft || !userId || !current || !title.trim()) return;
    setBusy('save');
    setError('');
    try {
      if (isDuplicateOrigin(await fetchSources(userId, current.id), draft.url)) {
        setError(`${t('libraryPage.duplicateSource')}. ${t('libraryPage.duplicateSourceDesc')}`);
        setBusy(null);
        return;
      }
      await addSource(userId, { title: title.trim(), content: draft.content.trim(), type: 'url', origin: draft.url, debateId: current.id });
      router.back();
    } catch (cause) {
      console.warn('Could not save the source:', cause instanceof Error ? cause.message : cause);
      setError(t('mobile.library.saveFailed'));
      setBusy(null);
    }
  };

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="add-link-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="bold" style={styles.title}>
          {t('mobile.library.pasteLink')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={busy === 'save'} />
      </View>

      {!current ? (
        <Text tone="secondary" style={styles.body}>
          {t('debate.libraryNeedsDebate')}
        </Text>
      ) : (
        <>
          <Field
            label={t('libraryPage.importUrlLabel')}
            placeholder={t('libraryPage.importUrlPlaceholder')}
            hint={t('libraryPage.importUrlHelp')}
            value={url}
            onChangeText={(next) => {
              setUrl(next);
              setDraft(null);
            }}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => void runImport()}
            editable={busy === null}
          />
          {!draft ? (
            <PrimaryButton label={t('libraryPage.importUrl')} busy={busy === 'import'} disabled={!url.trim()} onPress={() => void runImport()} />
          ) : (
            <>
              <Text weight="medium" tone="secondary" style={styles.label}>
                {t('libraryPage.importPreview')}
              </Text>
              <Card>
                <Field label={t('libraryPage.titleLabel')} value={title} onChangeText={setTitle} editable={busy === null} />
                <Text tone="faint" style={styles.meta}>
                  {`${draft.domain} · ${draft.wordCount} ${t('libraryPage.words')}`}
                </Text>
                {draft.excerpt ? (
                  <Text tone="secondary" style={styles.body} numberOfLines={5}>
                    {draft.excerpt}
                  </Text>
                ) : null}
              </Card>
              <MainActionButton label={t('libraryPage.saveImported')} busy={busy === 'save'} disabled={!title.trim()} onPress={() => void save()} />
            </>
          )}
        </>
      )}

      {error ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 14, marginLeft: 4, marginBottom: -8 },
  meta: { fontSize: 14 },
});
