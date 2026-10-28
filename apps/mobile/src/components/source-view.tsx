import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MainActionButton, SecondaryButton, TextButton } from './buttons';
import { Card, IconTile } from './card';
import { Field } from './field';
import { FolderSelect } from './folder-select';
import { FormGroup, SelectRow, SwitchRow } from './form-rows';
import { Icon } from './icon';
import { folderLabel, SOURCE_ICONS, sourceMeta } from './source-display';
import { Text } from './text';
import { useToast } from './toast';

import { useAuth } from '@/lib/auth';
import { formatRelativeDate } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useSourceActions } from '@/lib/source-actions';
import { fetchSource, updateSource, type Source, type SourcePatch, type SourceType } from '@/lib/sources';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useLibraryFolders } from '@/lib/use-library-folders';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

function webUrl(origin: string | null): string | null {
  return origin && /^https?:\/\//i.test(origin) ? origin : null;
}

const TYPES: SourceType[] = ['text', 'url', 'file'];
const TYPE_LABELS: Record<SourceType, string> = { text: 'libraryPage.textSource', url: 'libraryPage.urlSource', file: 'libraryPage.fileSource' };

type Draft = Pick<Source, 'title' | 'content' | 'type'> & { origin: string };

/**
 * A source, as the website's source sheet shows it: its quality and use, the
 * switch that decides whether the AI uses it, its folder and its text, with
 * Copy, Share and Delete (with Undo). Edit opens the website's fields for
 * title, type, origin and text; Save sends only what was changed.
 * The source sheet shows it with a Done button; the iPad Library shows it
 * beside the list. Mount it with a key per source, so a new selection never shows the last one.
 */
export function SourceView({ id, onDone, onRemoved }: { id: string; onDone?: () => void; onRemoved?: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [source, setSource] = useState<Source | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const copies = useCopyHolder();
  const actions = useSourceActions();
  const { folders } = useLibraryFolders(source?.debateId ?? null);

  // The same read as the source sheet. Leaving the screen drops the saved copy it is showing.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      setFailed(false);
      fetchSource(userId, id, copies.mark())
        .then((next) => {
          if (!active) return;
          setSource(next);
          setFailed(false);
        })
        .catch((cause: unknown) => {
          console.warn('Could not load the source:', cause instanceof Error ? cause.message : cause);
          if (active) setFailed(true);
        });
      return () => {
        active = false;
        copies.release();
      };
    }, [userId, id, copies]),
  );

  const url = webUrl(source?.origin ?? null);

  const toggle = async (isActive: boolean) => {
    if (!source) return;
    setSource({ ...source, isActive });
    if (!(await actions.setActive([source], isActive))) setSource((current) => current && { ...current, isActive: source.isActive });
  };
  const move = async (folder: string) => {
    if (!source) return;
    setSource({ ...source, folder });
    if (!(await actions.move(source, folder))) setSource((current) => current && { ...current, folder: source.folder });
  };
  const remove = async () => {
    if (!source) return;
    if (await actions.remove(source)) (onRemoved ?? onDone)?.();
  };

  const edit = () => {
    if (!source) return;
    setSaved(false);
    setSaveError('');
    setDraft({ title: source.title, content: source.content, type: source.type, origin: source.origin ?? '' });
  };
  const save = async () => {
    if (!source || !draft || !userId || !source.debateId || saving) return;
    if (!draft.title.trim() || !draft.content.trim()) return;
    // Only what was edited is written, so a switch flipped meanwhile is kept.
    const patch: SourcePatch = {};
    if (draft.title.trim() !== source.title) patch.title = draft.title;
    if (draft.content.trim() !== source.content) patch.content = draft.content;
    if (draft.type !== source.type) patch.type = draft.type;
    if (draft.origin.trim() !== (source.origin ?? '')) patch.origin = draft.origin;
    setSaving(true);
    setSaveError('');
    try {
      await updateSource(userId, source.debateId, source.id, patch);
      setSource({ ...source, title: draft.title.trim(), content: draft.content.trim(), type: draft.type, origin: draft.origin.trim() || null });
      setDraft(null);
      setSaved(true);
      haptics.success();
      // A sheet sits above the toast, so the sheet says it here; the iPad pane gets the toast too.
      if (!onDone) toast({ tone: 'success', title: t('libraryPage.sourceUpdated'), message: t('libraryPage.sourceUpdatedDesc') });
    } catch (cause) {
      console.warn('Could not save the source:', cause instanceof Error ? cause.message : cause);
      haptics.warning();
      setSaveError(t('libraryPage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const semantic = source?.metadata?.semantic;
  const words = source ? source.content.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {source ? (
            <View style={styles.kind}>
              <IconTile name={SOURCE_ICONS[source.type]} size={30} />
              <Text tone="faint" style={styles.meta} numberOfLines={1}>
                {sourceMeta(t, source)}
              </Text>
            </View>
          ) : null}
        </View>
        {draft ? (
          <TextButton label={t('common.cancel')} onPress={() => setDraft(null)} disabled={saving} />
        ) : source ? (
          <TextButton label={t('mobile.library.edit')} onPress={edit} />
        ) : null}
        {onDone && !draft ? <TextButton label={t('mobile.common.done')} onPress={onDone} /> : null}
      </View>

      {failed ? (
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.loadFailed')}
        </Text>
      ) : source === undefined ? (
        <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />
      ) : source === null ? (
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.sourceMissing')}
        </Text>
      ) : draft ? (
        <>
          <Field label={t('libraryPage.titleLabel')} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} editable={!saving} invalid={!draft.title.trim()} />
          {!draft.title.trim() ? <Text style={[styles.error, { color: colors.destructive }]}>{t('libraryPage.titleRequired')}</Text> : null}
          <FormGroup>
            <SelectRow
              first
              label={t('libraryPage.typeLabel')}
              value={draft.type}
              options={TYPES.map((value) => ({ value, label: t(TYPE_LABELS[value]) }))}
              onChange={(type) => setDraft({ ...draft, type })}
            />
          </FormGroup>
          <Field
            label={t('libraryPage.originLabel')}
            placeholder={t('libraryPage.originPlaceholder')}
            value={draft.origin}
            onChangeText={(origin) => setDraft({ ...draft, origin })}
            autoCapitalize="none"
            editable={!saving}
          />
          <Field
            label={t('libraryPage.contentLabel')}
            value={draft.content}
            onChangeText={(content) => setDraft({ ...draft, content })}
            multiline
            editable={!saving}
            invalid={!draft.content.trim()}
            style={styles.contentField}
          />
          {!draft.content.trim() ? <Text style={[styles.error, { color: colors.destructive }]}>{t('libraryPage.contentRequired')}</Text> : null}
          {saveError ? (
            <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
              {saveError}
            </Text>
          ) : null}
          <MainActionButton label={t('common.save')} busy={saving} disabled={!draft.title.trim() || !draft.content.trim()} onPress={() => void save()} />
        </>
      ) : (
        <>
          <Text accessibilityRole="header" weight="display" style={styles.title} selectable>
            {source.title || t('libraryPage.untitledSource')}
          </Text>
          <Text tone="faint" style={styles.meta}>
            {[folderLabel(t, source.folder), formatRelativeDate(source.createdAt), t('libraryPage.wordCount', { count: words, formatted: words.toLocaleString(i18n.language) })].join(' · ')}
          </Text>
          {saved ? (
            <View accessibilityRole="alert" style={[styles.saved, { backgroundColor: colors.successTint, borderColor: colors.successFill }]}>
              <View style={[styles.check, { backgroundColor: colors.successFill }]}>
                <Icon name="check" color="#FFFFFF" size={13} />
              </View>
              <Text weight="semibold" style={[styles.savedText, { color: colors.success }]}>
                {t('libraryPage.sourceUpdatedDesc')}
              </Text>
            </View>
          ) : null}
          {url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityHint={t('mobile.library.openPage')}
              onPress={() => void WebBrowser.openBrowserAsync(url)}
              style={({ pressed }) => [styles.origin, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
              <Icon name="globe" color={colors.primary} size={19} />
              <Text weight="medium" style={[styles.originText, { color: colors.primary }]} numberOfLines={1}>
                {url.replace(/^https?:\/\/(www\.)?/i, '')}
              </Text>
              <Icon name="externalLink" color={colors.primary} size={17} />
            </Pressable>
          ) : source.origin ? (
            <Text tone="faint" style={styles.meta}>
              {source.origin}
            </Text>
          ) : null}
          {semantic ? (
            <View style={[styles.quality, { backgroundColor: colors.segmentTrack, borderColor: colors.border }]} testID="source-quality">
              <Text weight="bold" style={styles.qualityTitle}>
                {semantic.lastUsedInCase ? t('sourceQuality.usedInCase') : t('sourceQuality.semanticAssessment')}
              </Text>
              <Text tone="secondary" style={styles.qualityText}>
                {t('sourceQuality.usageExplanation', {
                  count: semantic.caseUseCount,
                  importance: t(`sourceQuality.levels.${semantic.importance}`),
                  strength: t(`sourceQuality.levels.${semantic.strength}`),
                })}
              </Text>
            </View>
          ) : null}
          <FormGroup>
            <SwitchRow
              first
              label={t('libraryPage.useForGrounding')}
              description={t('libraryPage.useForGroundingDesc')}
              value={source.isActive}
              onChange={(value) => void toggle(value)}
            />
          </FormGroup>
          <FolderSelect folders={folders} value={source.folder} onChange={(folder) => void move(folder)} />
          <View style={styles.actions}>
            <View style={styles.action}>
              <SecondaryButton icon="copy" label={t('common.copy')} onPress={() => void actions.copy(source)} />
            </View>
            <View style={styles.action}>
              <SecondaryButton icon="share" label={t('mobile.library.share')} onPress={() => actions.share(source)} />
            </View>
          </View>
          <Card>
            <Text style={styles.text} selectable>
              {source.content}
            </Text>
          </Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => void remove()}
            testID="source-delete"
            style={({ pressed }) => [styles.delete, { borderColor: colors.border }, pressed && styles.pressed]}>
            <Icon name="trash" color={colors.destructive} size={19} />
            <Text weight="semibold" style={[styles.deleteText, { color: colors.destructive }]}>
              {t('common.delete')}
            </Text>
          </Pressable>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  meta: { fontSize: 14, flexShrink: 1 },
  loading: { marginTop: 32 },
  body: { fontSize: 15, lineHeight: 21 },
  error: { fontSize: 14, marginTop: -8, marginLeft: 4 },
  title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.4 },
  origin: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 2, borderRadius: 12, paddingHorizontal: 13, minHeight: 46 },
  originText: { flex: 1, fontSize: 15 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 16, lineHeight: 24 },
  quality: { borderWidth: 2, borderRadius: radius.field, paddingVertical: 10, paddingHorizontal: 13, gap: 3 },
  qualityTitle: { fontSize: 15 },
  qualityText: { fontSize: 14, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 2, borderRadius: radius.field, paddingVertical: 9, paddingHorizontal: 12 },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  savedText: { flex: 1, fontSize: 14.5 },
  contentField: { minHeight: 260, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: radius.field, minHeight: 48 },
  deleteText: { fontSize: 16 },
});
