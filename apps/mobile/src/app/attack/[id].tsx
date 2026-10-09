import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionMenu } from '@/components/action-menu';
import { AttackDocument } from '@/components/attack-document';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader, type HeaderAction } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { backLabel } from '@/lib/back-label';
import { formatWhen } from '@/lib/dates';
import { copyText, sharePdf, shareText } from '@/lib/export';
import { attackExportFileName, attackExportHtml } from '@/lib/export-html';
import { attackToText, discussAttackMessage } from '@/lib/result-text';
import { isCompleteAttack } from '@/lib/results';
import { useResultDocument } from '@/lib/use-result-document';

/**
 * An attack analysis in the same document style as a case. Its pinned next
 * step is the website's: Discuss, which takes the critique to Ask.
 */
export default function AttackResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, from, notice: arrival, failed } = useLocalSearchParams<{ id: string; from?: string; notice?: string; failed?: string }>();
  const doc = useResultDocument('attack', id);
  const [exportOpen, setExportOpen] = useState(false);
  const { setNotice } = doc;

  useEffect(() => {
    if (arrival === 'recordFailed') setNotice(t('debate.recordFailed'));
    if (arrival === 'sourcesFailed') setNotice(t('mobile.results.sourcesFailed', { count: Number(failed) || 1 }));
  }, [arrival, failed, setNotice, t]);

  const result = doc.state.status === 'ready' ? doc.state.result : null;
  const output = result && isCompleteAttack(result.output) ? result.output : null;
  const back = backLabel(t, from, 'practice');

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

  // The saved title is the summary cut at 80 characters; the summary already opens the document.
  const title = t('export.caseAttack');
  const text = () => attackToText(output, t);
  const run = (work: () => Promise<void>) => {
    work().catch((cause: unknown) => {
      console.warn('Export failed:', cause instanceof Error ? cause.message : cause);
      setNotice(t('mobile.results.exportFailed'));
    });
  };
  const discuss = () => router.push({ pathname: '/ask', params: { prompt: discussAttackMessage(output) } });

  const actions: HeaderAction[] = [
    ...(doc.autoSaved.length > 0
      ? [{ key: 'undo-sources', label: t('autoSavedSources.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void doc.undoAutoSaved() }]
      : []),
    ...(result.savedId ? [{ key: 'delete', label: t('common.delete'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: () => void doc.remove() }] : []),
  ];

  return (
    <DocumentScreen
      testID="attack-document"
      notice={doc.notice}
      header={<DocumentHeader backLabel={back} onShare={() => run(() => shareText(title, text()))} actions={actions} />}
      actions={
        <>
          <SecondaryButton floating icon="chat" label={t('attackResults.discuss')} onPress={discuss} testID="discuss-button" />
          <PrimaryButton floating icon="download" label={t('common.export')} onPress={() => setExportOpen(true)} disabled={doc.busy} testID="export-button" />
        </>
      }>
      <DocumentTitle title={title} meta={t('mobile.debate.itemMeta', { kind: t('debate.kinds.attack'), when: formatWhen(result.createdAt) })} />
      <AttackDocument output={output} sources={result.sources} />
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
          if (choice === 'pdf') run(() => sharePdf(attackExportHtml(output, t), attackExportFileName(output), title));
          if (choice === 'copy') run(async () => {
            await copyText(text());
            setNotice(t('generateResults.copiedToClipboard'));
          });
        }}
      />
    </DocumentScreen>
  );
}
