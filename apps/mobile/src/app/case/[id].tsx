import { readCase } from '@debatelab/core/ai/case-view';
import type { CaseSection } from '@debatelab/core/ai/generate-output';
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
import { RegeneratingStrip } from '@/components/regenerating-strip';
import { backLabel } from '@/lib/back-label';
import { useCaseEdits } from '@/lib/case-edits';
import { useDebates } from '@/lib/debate-context';
import { formatWhen } from '@/lib/dates';
import { copyText, sharePdf, shareText } from '@/lib/export';
import { shareCaseDocx } from '@/lib/export-docx';
import { caseExportFileName, caseExportHtml } from '@/lib/export-html';
import { caseToText, discussCaseMessage } from '@/lib/result-text';
import { buildFlowchartFromCase, crossfireFromCase } from '@/lib/result-links';
import { isCompleteCase } from '@/lib/results';
import { arrivalNoticeText, useResultDocument } from '@/lib/use-result-document';
import { useShareLink } from '@/lib/use-share-link';

/** A generated case read as a document, as in mock 03. */
export default function CaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, from, notice: arrival, failed } = useLocalSearchParams<{ id: string; from?: string; notice?: string; failed?: string }>();
  const doc = useResultDocument('case', id);
  const { activeDebateId } = useDebates();
  const [exportOpen, setExportOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const { setNotice } = doc;
  const edits = useCaseEdits(doc.state.status === 'ready' ? doc.state.key : null, setNotice);
  const shareLink = useShareLink(setNotice);

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

  const openCrossfire = () => {
    crossfireFromCase(typeof result.input.motion === 'string' ? result.input.motion : output.metadata?.motion ?? '', output);
    router.push({ pathname: '/crossfire', params: { from: 'case' } });
  };
  const buildFlowchart = () => {
    const outcome = buildFlowchartFromCase(output, result.debateId, activeDebateId, t);
    if (outcome === 'built') router.push({ pathname: '/flowchart', params: { from: 'case', built: '1' } });
    else setNotice(`${t('generate.flowchartImportFailed')}. ${t(outcome === 'noData' ? 'generate.flowchartNoData' : 'generate.flowchartOtherDebate')}`);
  };

  // The website's section cards that can be regenerated, in their order, each only when the case shows it.
  const view = readCase(output);
  const sections: { key: CaseSection; title: string }[] = [
    { key: 'opening' as const, title: t('generateResults.opening'), shown: Boolean(view.opening.hook || view.opening.definition || view.opening.roadmap || view.legacy.framework || view.legacy.burdenOfProof || view.legacy.definitions.length) },
    { key: 'contentions' as const, title: t('generateResults.arguments'), shown: view.arguments.length > 0 },
    { key: 'reinforce' as const, title: t('generateResults.reinforce'), shown: view.reinforce.length > 0 },
    { key: 'whyWeWin' as const, title: t('generateResults.whyWeWin'), shown: view.whyWeWin.length > 0 },
    { key: 'counters' as const, title: t('generateResults.ifTheySay'), shown: view.ifTheySay.length > 0 || view.legacy.likelyArguments.length > 0 || view.legacy.weaknesses.length > 0 || view.legacy.clashes.length > 0 },
    { key: 'closing' as const, title: t('generateResults.closingLine'), shown: Boolean(view.closingLine) },
  ].filter((section) => section.shown).map(({ key, title }) => ({ key, title }));
  const regeneratingTitle = sections.find((section) => section.key === edits.regenerating)?.title;
  const savedId = result.savedId;

  const actions: HeaderAction[] = [
    ...(edits.regenerating
      ? []
      : [{ key: 'regenerate', label: t('mobile.results.regenerateSection'), symbol: 'arrow.clockwise' as const, icon: 'reset' as const, onPress: () => setRegenerateOpen(true) }]),
    ...(edits.canUndo && !edits.regenerating
      ? [{ key: 'undo', label: t('generateResults.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void edits.undo() }]
      : []),
    { key: 'crossfire', label: t('crossfire.openFromResult'), symbol: 'person.2.wave.2', icon: 'swords', onPress: openCrossfire },
    { key: 'flowchart', label: t('mobile.results.buildFlowchart'), symbol: 'point.3.connected.trianglepath.dotted', icon: 'branch', onPress: buildFlowchart },
    { key: 'discuss', label: t('common.discuss'), symbol: 'bubble.left.and.bubble.right', icon: 'chat', onPress: () => router.push({ pathname: '/ask', params: { prompt: discussCaseMessage(output) } }) },
    ...(result.savedId ? [] : [{ key: 'save', label: t('common.save'), symbol: 'square.and.arrow.down' as const, icon: 'download' as const, onPress: () => void doc.save() }]),
    ...(doc.autoSaved.length > 0
      ? [{ key: 'undo-sources', label: t('autoSavedSources.undo'), symbol: 'arrow.uturn.backward' as const, icon: 'history' as const, onPress: () => void doc.undoAutoSaved() }]
      : []),
    // Only a saved case can be shared: the link is made from its row.
    ...(savedId ? [{ key: 'share-link', label: t('mobile.share.shareLink'), symbol: 'link' as const, icon: 'link' as const, onPress: () => void shareLink('case', savedId, title, output) }] : []),
    ...(result.savedId ? [{ key: 'delete', label: t('common.delete'), symbol: 'trash' as const, icon: 'trash' as const, destructive: true, onPress: () => void doc.remove() }] : []),
  ];

  return (
    <DocumentScreen
      testID="case-document"
      outline
      notice={doc.notice}
      noticeTone={doc.noticeTone}
      header={<DocumentHeader backLabel={back} onShare={() => run(() => shareText(title, caseToText(output)))} actions={actions} />}
      // "Attack this case" is the longer label, so it gets the wider button.
      actionWidths={[1.3, 1]}
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
      {regeneratingTitle ? <RegeneratingStrip title={regeneratingTitle} /> : null}
      <CaseDocument output={output} library={doc.library} sources={result.sources} onCite={(target) => openCitation(router, target)} />
      <ActionMenu
        visible={regenerateOpen}
        title={t('mobile.results.regenerateSection')}
        testID="regenerate-menu"
        items={sections.map((section) => ({ key: section.key, label: t('common.regenerate', { title: section.title }), icon: 'reset' as const }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setRegenerateOpen(false)}
        onSelect={(choice) => void edits.regenerate(choice as CaseSection)}
      />
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
          if (choice === 'pdf') run(() => sharePdf(caseExportHtml(output, t), caseExportFileName(output), title));
          if (choice === 'docx') run(() => shareCaseDocx(output, t, title));
          if (choice === 'copy') run(async () => {
            await copyText(caseToText(output));
            setNotice(t('generateResults.copiedToClipboard'));
          });
        }}
      />
    </DocumentScreen>
  );
}
