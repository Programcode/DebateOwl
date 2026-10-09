import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionMenu } from '@/components/action-menu';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CaseDocument } from '@/components/case-document';
import { openCitation } from '@/components/citation-target';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader, type HeaderAction } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { backLabel } from '@/lib/back-label';
import { formatWhen } from '@/lib/dates';
import { copyText, sharePdf, shareText } from '@/lib/export';
import { caseExportFileName, caseExportHtml } from '@/lib/export-html';
import { caseToText, discussCaseMessage } from '@/lib/result-text';
import { isCompleteCase } from '@/lib/results';
import { arrivalNoticeText, useResultDocument } from '@/lib/use-result-document';

/** A generated case read as a document, as in mock 03. */
export default function CaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, from, notice: arrival, failed } = useLocalSearchParams<{ id: string; from?: string; notice?: string; failed?: string }>();
  const doc = useResultDocument('case', id);
  const [exportOpen, setExportOpen] = useState(false);
  const { setNotice } = doc;

  // Problems from saving a fresh result are told once, on arrival.
  useEffect(() => {
    const text = arrivalNoticeText(t, arrival, failed);
    if (text) setNotice(text);
  }, [arrival, failed, setNotice, t]);

  const result = doc.state.status === 'ready' ? doc.state.result : null;
  const output = result && isCompleteCase(result.output) ? result.output : null;
  const back = backLabel(t, from, 'prepare');

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

  const key = doc.state.status === 'ready' ? doc.state.key : id;
  const title = result.title || output.metadata?.motion || t('export.debateCase');
  const side = output.metadata?.side === 'pro' ? t('generateResults.proposition') : t('generateResults.opposition');
  const generatedAt = Date.parse(output.metadata?.generatedAt ?? '') || result.createdAt;

  const run = (work: () => Promise<void>) => {
    work().catch((cause: unknown) => {
      console.warn('Export failed:', cause instanceof Error ? cause.message : cause);
      setNotice(t('mobile.results.exportFailed'));
    });
  };

  const actions: HeaderAction[] = [
    { key: 'discuss', label: t('common.discuss'), symbol: 'bubble.left.and.bubble.right', icon: 'chat', onPress: () => router.push({ pathname: '/ask', params: { prompt: discussCaseMessage(output) } }) },
    ...(result.savedId ? [] : [{ key: 'save', label: t('common.save'), symbol: 'square.and.arrow.down' as const, icon: 'download' as const, onPress: () => void doc.save() }]),
    ...(doc.autoSaved.length > 0
      ? [{ key: 'undo-sources', label: t('autoSavedSources.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void doc.undoAutoSaved() }]
      : []),
    ...(result.savedId ? [{ key: 'delete', label: t('common.delete'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: () => void doc.remove() }] : []),
  ];

  return (
    <DocumentScreen
      testID="case-document"
      notice={doc.notice}
      header={<DocumentHeader backLabel={back} onShare={() => run(() => shareText(title, caseToText(output)))} actions={actions} />}
      actions={
        <>
          <SecondaryButton
            floating
            icon="shield"
            label={t('mobile.results.attackThisCase')}
            onPress={() => router.push({ pathname: '/attack', params: { caseKey: key } })}
            testID="attack-this-case"
          />
          <PrimaryButton floating icon="download" label={t('common.export')} onPress={() => setExportOpen(true)} disabled={doc.busy} testID="export-button" />
        </>
      }>
      <DocumentTitle title={title} meta={t('mobile.results.generatedMeta', { side, when: formatWhen(generatedAt) })} />
      <CaseDocument output={output} library={doc.library} sources={result.sources} onCite={(target) => openCitation(router, target)} />
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
          if (choice === 'pdf') run(() => sharePdf(caseExportHtml(output, t), caseExportFileName(output), title));
          if (choice === 'copy') run(async () => {
            await copyText(caseToText(output));
            setNotice(t('generateResults.copiedToClipboard'));
          });
        }}
      />
    </DocumentScreen>
  );
}
