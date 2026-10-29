import type { BrainstormInput } from '@debatelab/core/ai/schemas/brainstorm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionMenu } from '@/components/action-menu';
import { BrainstormDocument } from '@/components/brainstorm-document';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader, type HeaderAction } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { backLabel } from '@/lib/back-label';
import { formatWhen } from '@/lib/dates';
import { copyText, sharePdf, shareText } from '@/lib/export';
import { shareBrainstormDocx } from '@/lib/export-docx';
import { BRAINSTORM_EXPORT_FILE_NAME, brainstormExportHtml } from '@/lib/export-html';
import { brainstormToText, discussBrainstormMessage } from '@/lib/result-text';
import { readBrainstorm } from '@/lib/results';
import { arrivalNoticeText, useResultDocument } from '@/lib/use-result-document';
import { useShareLink } from '@/lib/use-share-link';

/**
 * A brainstorm read as a document. Its pinned next steps are the website's:
 * Discuss, which takes the ideas to Ask, and Export.
 */
export default function BrainstormResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; from?: string; notice?: string; failed?: string }>();
  const doc = useResultDocument('brainstorm', params.id);
  const [exportOpen, setExportOpen] = useState(false);
  const { setNotice } = doc;
  const shareLink = useShareLink(setNotice);
  const { notice: arrival, failed } = params;

  // Problems from saving a fresh result are told once, on arrival.
  useEffect(() => {
    const text = arrivalNoticeText(t, arrival, failed);
    if (text) setNotice(text);
  }, [arrival, failed, setNotice, t]);

  const result = doc.state.status === 'ready' ? doc.state.result : null;
  // Saved rows are read through the schema, so an old or broken one shows the notice below instead of crashing.
  const raw = result?.output;
  const output = useMemo(() => (raw === undefined ? null : readBrainstorm(raw)), [raw]);
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

  const title = result.title || t('export.brainstormResults');
  const questionsOnly = Boolean(output.needsMoreInfo && output.clarifyingQuestions?.length);
  const run = (work: () => Promise<void>) => {
    work().catch((cause: unknown) => {
      console.warn('Export failed:', cause instanceof Error ? cause.message : cause);
      setNotice(t('mobile.results.exportFailed'));
    });
  };

  const savedId = result.savedId;
  const actions: HeaderAction[] = [
    ...(doc.autoSaved.length > 0
      ? [{ key: 'undo-sources', label: t('autoSavedSources.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void doc.undoAutoSaved() }]
      : []),
    // As Export, not for a brainstorm that only asks questions.
    ...(savedId && !questionsOnly ? [{ key: 'share-link', label: t('mobile.share.shareLink'), symbol: 'link' as const, icon: 'link' as const, onPress: () => void shareLink('brainstorm', savedId, title, output) }] : []),
    ...(result.savedId ? [{ key: 'delete', label: t('common.delete'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: () => void doc.remove() }] : []),
  ];

  return (
    <DocumentScreen
      testID="brainstorm-document"
      outline
      notice={doc.notice}
      noticeTone={doc.noticeTone}
      header={<DocumentHeader backLabel={back} onShare={questionsOnly ? undefined : () => run(() => shareText(title, brainstormToText(output, t)))} actions={actions} />}
      // The website shows only the questions when the model needs more, with no export or discussion.
      actions={questionsOnly ? undefined : (
        <>
          <SecondaryButton
            floating
            icon="chat"
            label={t('common.discuss')}
            onPress={() => router.push({ pathname: '/ask', params: { prompt: discussBrainstormMessage(output, t) } })}
            testID="discuss-button"
          />
          <PrimaryButton floating icon="download" label={t('common.export')} onPress={() => setExportOpen(true)} disabled={doc.busy} testID="export-button" />
        </>
      )}>
      <DocumentTitle title={title} meta={t('mobile.debate.itemMeta', { kind: t('debate.kinds.brainstorm'), when: formatWhen(result.createdAt) })} />
      <BrainstormDocument output={output} input={result.input as Partial<BrainstormInput>} sources={result.sources} />
      <ActionMenu
        visible={exportOpen}
        title={t('common.export')}
        testID="export-menu"
        items={[
          { key: 'pdf', label: t('common.pdf'), icon: 'file' },
          { key: 'copy', label: t('mobile.results.copyText'), icon: 'copy' },
          // The website's Word export, built by the same code (packages/core/src/export/docx.ts).
          { key: 'docx', label: t('common.docx'), icon: 'file' },
        ]}
        cancelLabel={t('common.cancel')}
        onClose={() => setExportOpen(false)}
        onSelect={(choice) => {
          if (choice === 'pdf') run(() => sharePdf(brainstormExportHtml(output, t), BRAINSTORM_EXPORT_FILE_NAME, title));
          if (choice === 'docx') run(() => shareBrainstormDocx(output, t, title));
          if (choice === 'copy') run(async () => {
            await copyText(brainstormToText(output, t));
            setNotice(t('generateResults.copiedToClipboard'));
          });
        }}
      />
    </DocumentScreen>
  );
}
