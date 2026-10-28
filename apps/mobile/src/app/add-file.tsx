import type { SourceFileImportResult, SourceFileNotice } from '@debatelab/core/source-file-import';
import { GENERAL_FOLDER } from '@debatelab/core/library';
import type { TFunction } from 'i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton, SecondaryButton, TextButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FolderSelect } from '@/components/folder-select';
import { Icon } from '@/components/icon';
import { Owl } from '@/components/owl';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { haptics } from '@/lib/haptics';
import { pickSourceFile } from '@/lib/pick-source-file';
import { pickedFile, useSourceFileReader, type SourceFileOutcome } from '@/lib/source-file';
import { addSource, DuplicateSourceError, fetchSources } from '@/lib/sources';
import { useLibraryFolders } from '@/lib/use-library-folders';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Failure = Extract<SourceFileOutcome, { ok: false }>;

/** The website's English messages, translated: the error codes from the shared reader name them. */
function failureText(t: TFunction, failure: Failure): { title: string; message: string } {
  const title = failure.code === 'unsupported' ? t('libraryPage.unsupportedFile') : t('libraryPage.importFailed');
  switch (failure.code) {
    case 'too-large':
      return { title, message: t('mobile.library.file.tooLarge') };
    case 'unsupported':
      return { title, message: t('mobile.library.file.unsupported') };
    case 'empty':
      return { title, message: t('mobile.library.file.empty') };
    default:
      return {
        title,
        message: failure.fileType === 'pdf'
          ? t('mobile.library.file.parsePdf')
          : failure.fileType === 'docx'
            ? t('mobile.library.file.parseDocx')
            : t('libraryPage.fileReadFailed'),
      };
  }
}

function noticeText(t: TFunction, notice: SourceFileNotice): string {
  switch (notice.code) {
    case 'truncated':
      return t('mobile.library.file.truncated');
    case 'short':
      return t('mobile.library.file.short');
    case 'invalid-json':
      return t('mobile.library.file.invalidJson');
    case 'pdf-pages':
      return t('mobile.library.file.pdfPages', { count: notice.pages, pages: notice.pages, imported: notice.imported });
    // mammoth's own notes about the document, in English, as on the website.
    default:
      return notice.message;
  }
}

/**
 * Import a file: the Library's plus menu picks it, and this sheet reads it
 * with the website's reader into an editable draft, as the website's Import
 * file does, then saves it to the Current Debate.
 */
export default function AddFileSheet() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const { current } = useDebates();
  const { file: fileId } = useLocalSearchParams<{ file?: string }>();
  const { folders } = useLibraryFolders(current?.id ?? null);
  const { reader, read } = useSourceFileReader();
  const [draft, setDraft] = useState<SourceFileImportResult | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folder, setFolder] = useState(GENERAL_FOLDER);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState('');
  const started = useRef(false);

  const readAsset = async (asset: Parameters<typeof read>[0]) => {
    setReading(true);
    setFailure(null);
    setDraft(null);
    const outcome = await read(asset);
    setReading(false);
    if (!outcome.ok) {
      haptics.warning();
      setFailure(failureText(t, outcome));
      return;
    }
    setDraft(outcome.result);
    setTitle(outcome.result.title);
    setContent(outcome.result.content);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const asset = pickedFile(fileId);
    if (asset) void readAsset(asset);
    // Reads the file it was opened with, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const chooseAnother = async () => {
    const asset = await pickSourceFile();
    if (asset) await readAsset(asset);
  };

  const ready = Boolean(draft && title.trim() && content.trim());

  const save = async () => {
    const userId = session?.user.id;
    if (!draft || !ready || !userId || !current || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      // The website matches a file by its name within the debate.
      const name = draft.origin.trim().toLowerCase();
      const saved = await fetchSources(userId, current.id);
      if (saved.some((source) => source.origin?.trim().toLowerCase() === name)) throw new DuplicateSourceError();
      await addSource(userId, { title: title.trim(), content: content.trim(), type: 'file', origin: draft.origin, folder, debateId: current.id });
      toast({ tone: 'success', title: t('libraryPage.sourceSaved', { title: title.trim() }) });
      router.back();
    } catch (cause) {
      haptics.warning();
      setSaveError(cause instanceof DuplicateSourceError
        ? `${t('libraryPage.duplicateSource')}. ${t('libraryPage.duplicateSourceDesc')}`
        : t('mobile.library.saveFailed'));
      setSaving(false);
    }
  };

  const fileKind = draft ? draft.fileType.toUpperCase() : '';
  const words = draft ? t('libraryPage.wordCount', { count: draft.wordCount, formatted: draft.wordCount.toLocaleString(i18n.language) }) : '';

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="add-file-sheet">
      {reader}
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('libraryPage.importFileLabel')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={saving} />
      </View>

      {!current ? (
        <Text tone="secondary" style={styles.body}>
          {t('debate.libraryNeedsDebate')}
        </Text>
      ) : reading ? (
        <View style={styles.reading} accessibilityRole="progressbar" accessibilityLabel={t('libraryPage.readingFile')}>
          <Owl pose="reading" size={96} />
          <Text weight="semibold" tone="secondary" style={styles.body}>
            {t('libraryPage.readingFile')}
          </Text>
        </View>
      ) : failure ? (
        <Card style={styles.failure}>
          <Owl pose="surprised" size={80} />
          <View style={styles.failureText}>
            <Text accessibilityRole="alert" weight="bold" tone="heading" style={styles.failureTitle}>
              {failure.title}
            </Text>
            <Text tone="secondary" style={styles.body}>
              {failure.message}
            </Text>
          </View>
          <SecondaryButton icon="upload" label={t('libraryPage.chooseFile')} onPress={() => void chooseAnother()} />
        </Card>
      ) : !draft ? (
        <View style={styles.reading}>
          <Owl pose="point" size={96} />
          <SecondaryButton icon="upload" label={t('libraryPage.chooseFile')} onPress={() => void chooseAnother()} />
        </View>
      ) : (
        <>
          <View style={styles.meta}>
            <Icon name="file" color={colors.primary} size={18} />
            <Text weight="medium" tone="secondary" style={styles.metaText} numberOfLines={2}>
              {[draft.origin, fileKind, words].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {draft.notices.length > 0 ? (
            <View
              accessibilityRole="alert"
              style={[styles.notices, { backgroundColor: colors.accent + '1F', borderColor: colors.accent + '80' }]}
              testID="file-notices">
              {draft.notices.map((notice, index) => (
                <View key={`${notice.code}-${index}`} style={styles.notice}>
                  <Icon name="alert" color={colors.warning} size={17} />
                  <Text style={[styles.noticeText, { color: colors.warning }]}>{noticeText(t, notice)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <FolderSelect folders={folders} value={folder} onChange={setFolder} disabled={saving} />
          <Field label={t('libraryPage.titleLabel')} value={title} onChangeText={setTitle} editable={!saving} invalid={!title.trim()} />
          <Field
            label={t('libraryPage.contentLabel')}
            value={content}
            onChangeText={setContent}
            multiline
            editable={!saving}
            invalid={!content.trim()}
            style={styles.contentField}
          />
          {saveError ? (
            <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
              {saveError}
            </Text>
          ) : null}
          <MainActionButton label={t('libraryPage.saveImported')} busy={saving} disabled={!ready} onPress={() => void save()} />
        </>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  reading: { alignItems: 'center', gap: 14, paddingVertical: 28 },
  failure: { alignItems: 'center', paddingVertical: 22 },
  failureText: { alignItems: 'center', gap: 4 },
  failureTitle: { fontSize: 17, lineHeight: 22, textAlign: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 },
  metaText: { flex: 1, fontSize: 14, lineHeight: 19 },
  notices: { borderWidth: 2, borderRadius: radius.field, padding: 12, gap: 8 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 19 },
  contentField: { minHeight: 220, maxHeight: 420, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
});
