import type { Factoid, FactoidsInput } from '@debatelab/core/ai/schemas/factoids';
import { SafeWebUrlSchema } from '@debatelab/core/ai/schemas/url';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionMenu } from '@/components/action-menu';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { openCitation } from '@/components/citation-target';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader, type HeaderAction } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { FactoidsDocument } from '@/components/factoids-document';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { formatWhen } from '@/lib/dates';
import { useDebates } from '@/lib/debate-context';
import { copyText, sharePdf, shareText } from '@/lib/export';
import { FACTOIDS_EXPORT_FILE_NAME, factoidsExportHtml } from '@/lib/export-html';
import { discussFactoidsMessage, factoidsToText } from '@/lib/result-text';
import { readFactoids } from '@/lib/results';
import { addSource } from '@/lib/sources';
import { arrivalNoticeText, useResultDocument } from '@/lib/use-result-document';

/**
 * Factoids read as a document. Each factoid's source opens from its
 * citation chip, and can be kept in the Current Debate's Library, as the
 * website's bookmark button does. The pinned next steps are the website's:
 * Discuss and Export.
 */
export default function FactoidsResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; from?: string; notice?: string; failed?: string }>();
  const doc = useResultDocument('factoids', params.id);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { activeDebateId } = useDebates();
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const owner = useRef(userId);
  const { setNotice } = doc;
  const { notice: arrival, failed } = params;

  useEffect(() => {
    owner.current = userId;
  }, [userId]);
  useEffect(() => () => {
    live.current = false;
  }, []);

  useEffect(() => {
    const text = arrivalNoticeText(t, arrival, failed);
    if (text) setNotice(text);
  }, [arrival, failed, setNotice, t]);

  const result = doc.state.status === 'ready' ? doc.state.result : null;
  // Saved rows are read through the schema, so an old or broken one shows the notice below instead of crashing.
  const raw = result?.output;
  const output = useMemo(() => (raw === undefined ? null : readFactoids(raw)), [raw]);
  const back = backLabel(t, params.from, 'prepare');

  if (!result || !output) {
    return (
      <DocumentScreen header={<DocumentHeader backLabel={back} actions={[]} />}>
        <DocumentStatus
          status={doc.state.status === 'ready' ? 'incomplete' : doc.state.status}
          incomplete={{ title: t('generateResults.incomplete'), body: t('generateResults.incompleteDesc') }}
        />
      </DocumentScreen>
    );
  }

  const title = result.title || t('export.researchFactoids');
  const run = (work: () => Promise<void>) => {
    work().catch((cause: unknown) => {
      console.warn('Export failed:', cause instanceof Error ? cause.message : cause);
      setNotice(t('mobile.results.exportFailed'));
    });
  };

  /** The website's handleSaveToLibrary: into the Current Debate, read when the student taps. */
  const saveToLibrary = async (factoid: Factoid) => {
    if (!userId) return;
    const forUser = userId;
    const debateId = activeDebateId;
    if (!debateId) {
      setNotice(t('debate.sourceNeedsDebate'));
      return;
    }
    const url = SafeWebUrlSchema.safeParse(factoid.citation?.url);
    setSaving(true);
    try {
      await addSource(forUser, {
        title: factoid.shortClaim,
        content: `${factoid.context}\n\nKey Figure: ${factoid.keyFigure}\nLimitations: ${factoid.limitations}`,
        type: 'url',
        origin: url.success ? url.data : undefined,
        folder: 'Factoids',
        debateId,
      });
      if (live.current && owner.current === forUser) setNotice(`${t('factoids.savedToLibrary')}. ${t('factoids.savedToLibraryDesc')}`);
    } catch (cause) {
      console.warn('Could not save the factoid to the Library:', cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === forUser) setNotice(t('factoids.saveFailed'));
    } finally {
      if (live.current) setSaving(false);
    }
  };

  const actions: HeaderAction[] = [
    ...(doc.autoSaved.length > 0
      ? [{ key: 'undo-sources', label: t('autoSavedSources.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void doc.undoAutoSaved() }]
      : []),
    ...(result.savedId ? [{ key: 'delete', label: t('common.delete'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: () => void doc.remove() }] : []),
  ];

  return (
    <DocumentScreen
      testID="factoids-document"
      outline
      notice={doc.notice}
      header={<DocumentHeader backLabel={back} onShare={() => run(() => shareText(title, factoidsToText(output, t)))} actions={actions} />}
      actions={
        <>
          <SecondaryButton
            floating
            icon="chat"
            label={t('common.discuss')}
            onPress={() => router.push({ pathname: '/ask', params: { prompt: discussFactoidsMessage(output) } })}
            testID="discuss-button"
          />
          <PrimaryButton floating icon="download" label={t('common.export')} onPress={() => setExportOpen(true)} disabled={doc.busy} testID="export-button" />
        </>
      }>
      <DocumentTitle title={title} meta={t('mobile.debate.itemMeta', { kind: t('debate.kinds.factoids'), when: formatWhen(result.createdAt) })} />
      <FactoidsDocument
        output={output}
        input={result.input as Partial<FactoidsInput>}
        library={doc.library}
        sources={result.sources}
        saving={saving}
        onCite={(target) => openCitation(router, target)}
        onSave={(factoid) => void saveToLibrary(factoid)}
        onSearch={(query) => router.push({ pathname: '/factoids', params: { claim: query, from: params.from ?? 'prepare' } })}
      />
      <ActionMenu
        visible={exportOpen}
        title={t('common.export')}
        testID="export-menu"
        items={[
          { key: 'pdf', label: t('common.pdf'), icon: 'file' },
          { key: 'copy', label: t('mobile.results.copyText'), icon: 'copy' },
        ]}
        cancelLabel={t('common.cancel')}
        onClose={() => setExportOpen(false)}
        onSelect={(choice) => {
          if (choice === 'pdf') run(() => sharePdf(factoidsExportHtml(output, t), FACTOIDS_EXPORT_FILE_NAME, title));
          if (choice === 'copy') run(async () => {
            await copyText(factoidsToText(output, t));
            setNotice(t('generateResults.copiedToClipboard'));
          });
        }}
      />
    </DocumentScreen>
  );
}
