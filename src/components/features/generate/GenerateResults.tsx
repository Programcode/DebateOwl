import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Swords, AlertTriangle, MessageSquare, GitBranch, Sparkles, Undo2, Flame, Trophy, Quote, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/ui/markdown';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { readCase, sourceLabel, type CaseArgument } from '@debatelab/core/ai/case-view';
import { toast } from 'sonner';
import { formatDecimal, formatEuropeanDateTime } from '@/lib/date-format';
import { ExportToolbar } from '@/components/features/ExportToolbar';
import { ResultHeader } from '@/components/features/tools/ResultHeader';
import { CopyResultButton, SaveResultAction } from '@/components/features/tools/result-actions';
import { caseText } from '@/components/features/tools/result-text';
import { ResearchedSources } from '@/components/features/tools/ResearchedSources';
import { GoogleDriveAuthModal } from '@/components/features/export/GoogleDriveAuthModal';
import { SourceQualityList } from '@/components/features/shared/SourceQualityList';
import type { DiscoveredSource } from '@/lib/ai/client';
import { openExternalUrl } from '@/lib/native';

interface GenerateResultsProps {
  result: GenerateOutput;
  discoveredSources?: DiscoveredSource[];
  onRegenerateSection?: (section: string) => void;
  /** The section being regenerated; the rest of the results stay on screen. */
  regeneratingSection?: string | null;
  onDiscuss?: () => void;
  onSave?: () => void;
  /** The case is already in History; shows “Saved” instead of Save. */
  saved?: boolean;
  onUndo?: () => void;
  onImportFlowchart?: () => void;
  onPracticeCrossfire?: () => void;
}

function ArgumentCard({ argument, index, unverified }: { argument: CaseArgument; index: number; unverified: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 motion-list-item">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-foreground">
          <span className="text-primary mr-2">#{index + 1}</span>
          {argument.title ?? argument.point}
        </h3>
        {argument.needsSource && (
          <Badge variant="outline" className="shrink-0 border-amber-500 text-amber-600">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {t('generateResults.needsSource')}
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        {argument.title && argument.point && (
          <div>
            <span className="font-medium text-muted-foreground">{t('generateResults.point')} </span>
            <Markdown inline>{argument.point}</Markdown>
          </div>
        )}
        {argument.explanation && (
          <div>
            <span className="font-medium text-muted-foreground">{t('generateResults.explanation')} </span>
            <Markdown inline>{argument.explanation}</Markdown>
          </div>
        )}
        {argument.evidence && (
          <div>
            <span className="font-medium text-muted-foreground">{t('generateResults.evidence')} </span>
            {unverified && !argument.needsSource && (
              <Badge variant="outline" className="mr-1 border-amber-500/40 bg-amber-500/10 py-0 align-middle text-amber-800 dark:text-amber-300">
                {t('generateResults.unverified', 'Unverified')}
              </Badge>
            )}
            <Markdown inline>{argument.evidence}</Markdown>
          </div>
        )}
        {argument.sourceQuery && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-medium">{t('generateResults.searchSuggestion')} </span>
            <code className="text-primary">{argument.sourceQuery}</code>
          </div>
        )}
        {argument.whyItMatters && (
          <div>
            <span className="font-medium text-muted-foreground">{t('generateResults.whyItMatters')} </span>
            <Markdown inline>{argument.whyItMatters}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

/** A labelled bullet list for an older case's section; nothing when it is empty. */
function LegacyList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}

function formatDuration(ms: number | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!ms || ms < 0) return null;
  if (ms < 1000) return t('generateResults.durationMs', { value: ms });
  const value = formatDecimal(ms / 1000, ms < 10000 ? 1 : 0);
  return t('generateResults.durationS', { value });
}

export function GenerateResults({ result, discoveredSources, onRegenerateSection, regeneratingSection = null, onDiscuss, onSave, saved = false, onUndo, onImportFlowchart, onPracticeCrossfire }: GenerateResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);
  const [showDriveAuth, setShowDriveAuth] = useState(false);
  // Read-only views (a shared link) pass no handler, so the cards show no regenerate button.
  const regenerate = (section: string) => (onRegenerateSection ? () => onRegenerateSection(section) : undefined);
  const regenerateState = (section: string) => ({
    isLoading: regeneratingSection === section,
    regenerateDisabled: regeneratingSection !== null,
  });

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const { exportCaseToGoogleDocs } = await import('@/lib/export-utils');
      const exportResult = await exportCaseToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        const openDocument = (): void => void openExternalUrl(exportResult.documentUrl!, { newWindow: true })
          .catch(() => toast.error(t('generateResults.exportError')));
        toast.success(t('generateResults.exportedGdocs'), {
          action: {
            label: t('generateResults.open'),
            onClick: openDocument,
          },
        });
        openDocument();
      } else if (exportResult.requiresReauth) {
        setShowDriveAuth(true);
      } else {
        toast.error(exportResult.error || t('generateResults.exportFailed'));
      }
    } catch {
      toast.error(t('generateResults.exportError'));
    } finally {
      setIsExportingGDocs(false);
    }
  };

  const handlePdfExport = async () => {
    try {
      const { exportCaseToPdf } = await import('@/lib/pdf-export-utils');
      await exportCaseToPdf(result);
    } catch {
      toast.error(t('generateResults.exportError'));
    }
  };

  const handleDocxExport = async () => {
    try {
      const { exportCaseToDocx } = await import('@/lib/export-utils');
      await exportCaseToDocx(result);
    } catch {
      toast.error(t('generateResults.exportError'));
    }
  };

  // Guard against incomplete result data
  if (!result?.caseStructure || !Array.isArray(result?.contentions) || !Array.isArray(result?.counters)) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <h2 className="text-lg font-semibold text-destructive mb-2">{t('generateResults.incomplete')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('generateResults.incompleteDesc')}
        </p>
      </div>
    );
  }

  const view = readCase(result);
  const { opening, legacy } = view;
  const durationText = formatDuration(result.metadata?.durationMs, t);
  // Without web research, evidence is the model's own claim and is labelled that way.
  const researched = Boolean(discoveredSources?.length);
  const modelName = result.metadata?.model || result.metadata?.provider;
  const modelText = modelName ? t('generateResults.modelLabel', { value: modelName }) : null;

  return (
    <div className="space-y-6">
      <GoogleDriveAuthModal open={showDriveAuth} onOpenChange={setShowDriveAuth} />
      <ResultHeader
        title={t('generateResults.resultTitle', 'Your case')}
        meta={<>
          <Badge variant={result.metadata?.side === 'pro' ? 'default' : 'secondary'}>
            {result.metadata?.side === 'pro' ? t('generateResults.proposition') : t('generateResults.opposition')}
          </Badge>
          {result.metadata?.generatedAt && <><span>•</span><span>{formatEuropeanDateTime(result.metadata.generatedAt)}</span></>}
          {modelText && <><span>•</span><span>{modelText}</span></>}
          {durationText && <><span>•</span><span>{durationText}</span></>}
        </>}
        caveat={researched ? undefined : t('generateResults.unresearchedCaveat', 'AI-generated, and no web research backs this evidence. Check facts and sources before using them in a round.')}
        actions={(
        <div data-tour="export-section" className="w-full">
          <ExportToolbar
            onPdf={handlePdfExport}
            onDocx={handleDocxExport}
            onGoogleDocs={handleGoogleDocsExport}
            isExportingGDocs={isExportingGDocs}
            extraExports={<CopyResultButton getText={() => caseText(result)} />}
            evenRows
            secondaryActions={(onSave || saved || onDiscuss || onImportFlowchart || onUndo || onPracticeCrossfire) ? (
              // What happens to this case first (keep it, undo a change), then where to take it next.
              <>
                <SaveResultAction saved={saved} onSave={onSave} />
                {onUndo && (
                  <Button variant="outline" size="sm" onClick={onUndo} disabled={regeneratingSection !== null}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    {t('generateResults.undo', 'Undo')}
                  </Button>
                )}
                {onDiscuss && (
                  <Button variant="outline" size="sm" onClick={onDiscuss}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t('generateResults.discuss')}
                  </Button>
                )}
                {onImportFlowchart && (
                  <Button variant="outline" size="sm" onClick={onImportFlowchart}>
                    <GitBranch className="mr-2 h-4 w-4" />
                    {t('generateResults.flowcharts')}
                  </Button>
                )}
                {onPracticeCrossfire && (
                  <Button variant="outline" size="sm" onClick={onPracticeCrossfire}>
                    <Flame className="mr-2 h-4 w-4" />
                    {t('crossfire.openFromResult', 'Open in Crossfire')}
                  </Button>
                )}
              </>
            ) : undefined}
          />
        </div>
        )}
      />
      <ResearchedSources sources={discoveredSources} />

      {/* Opening: the hook, an unclear term when the Introductor needs one, and the roadmap. */}
      {(opening.hook || opening.definition || opening.roadmap || legacy.framework || legacy.burdenOfProof || legacy.definitions.length > 0) && (
        <SectionCard
          title={t('generateResults.opening')}
          description={t('generateResults.openingDesc')}
          icon={<Sparkles className="h-5 w-5" />}
          onRegenerate={regenerate('opening')}
          {...regenerateState('opening')}
        >
          <div className="space-y-4">
            {opening.hook && <Markdown className="italic">{opening.hook}</Markdown>}
            {opening.definition && (
              <div className="text-sm">
                <span className="font-medium text-muted-foreground">{t('generateResults.definition')} </span>
                <Markdown inline>{opening.definition}</Markdown>
              </div>
            )}
            {opening.roadmap && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.roadmap')}</h3>
                <Markdown>{opening.roadmap}</Markdown>
              </div>
            )}
            {/* Older cases kept these as their own sections; they show under plain names. */}
            {legacy.framework && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.legacyJudgeBy')}</h3>
                <Markdown>{legacy.framework}</Markdown>
              </div>
            )}
            {legacy.burdenOfProof && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.legacyMustShow')}</h3>
                <Markdown>{legacy.burdenOfProof}</Markdown>
              </div>
            )}
            <LegacyList title={t('generateResults.legacyDefinitions')} items={legacy.definitions} />
          </div>
        </SectionCard>
      )}

      {view.arguments.length > 0 && (
        <SectionCard
          title={t('generateResults.arguments')}
          description={t('generateResults.argumentCount', { count: view.arguments.length })}
          icon={<Shield className="h-5 w-5" />}
          onRegenerate={regenerate('contentions')}
          {...regenerateState('contentions')}
        >
          <div className="space-y-4">
            {view.arguments.map((argument, index) => (
              <ArgumentCard key={argument.id} argument={argument} index={index} unverified={!researched} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* R2: the team's earlier arguments, backed up, instead of new ones. */}
      {view.reinforce.length > 0 && (
        <SectionCard
          title={t('generateResults.reinforce')}
          description={t('generateResults.reinforceDesc')}
          icon={<Shield className="h-5 w-5" />}
          onRegenerate={regenerate('reinforce')}
          {...regenerateState('reinforce')}
        >
          <div className="space-y-4">
            {view.reinforce.map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2 motion-list-item">
                {item.argument && <h3 className="font-semibold text-foreground">{item.argument}</h3>}
                <Markdown className="text-sm">{item.text}</Markdown>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Conclusor: the reasons we win take the place of new arguments. */}
      {view.whyWeWin.length > 0 && (
        <SectionCard
          title={t('generateResults.whyWeWin')}
          description={t('generateResults.whyWeWinDesc')}
          icon={<Trophy className="h-5 w-5" />}
          onRegenerate={regenerate('whyWeWin')}
          {...regenerateState('whyWeWin')}
        >
          <ol className="space-y-3">
            {view.whyWeWin.map((reason, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="font-semibold text-primary">{i + 1}.</span>
                <Markdown inline>{reason}</Markdown>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {(view.ifTheySay.length > 0 || legacy.likelyArguments.length > 0 || legacy.weaknesses.length > 0 || legacy.clashes.length > 0) && (
        <SectionCard
          title={t('generateResults.ifTheySay')}
          description={t('generateResults.ifTheySayDesc')}
          icon={<Swords className="h-5 w-5" />}
          onRegenerate={regenerate('counters')}
          {...regenerateState('counters')}
        >
          <div className="space-y-4">
            {view.ifTheySay.map((answer, i) => (
              <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                {answer.theySay && (
                  <div className="flex items-start gap-2">
                    <Badge variant="destructive" className="shrink-0 text-xs">{t('generateResults.theySay')}</Badge>
                    <span className="text-sm font-medium text-foreground">{answer.theySay}</span>
                  </div>
                )}
                {answer.weAnswer && (
                  <div className="text-sm">
                    <span className="font-medium text-muted-foreground">{t('generateResults.weAnswer')} </span>
                    <Markdown inline>{answer.weAnswer}</Markdown>
                  </div>
                )}
                {answer.inRound && (
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('generateResults.legacySayItLike')} </span>
                    <span className="text-sm text-foreground">{answer.inRound}</span>
                  </div>
                )}
                {answer.source && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{t('generateResults.source')}</span> {answer.source}
                  </p>
                )}
              </div>
            ))}
            <LegacyList title={t('generateResults.legacyAlsoSay')} items={legacy.likelyArguments} />
            <LegacyList title={t('generateResults.legacyWeakSpots')} items={legacy.weaknesses} />
            <LegacyList title={t('generateResults.legacyDecidingPoints')} items={legacy.clashes} />
          </div>
        </SectionCard>
      )}

      {view.closingLine && (
        <SectionCard
          title={t('generateResults.closingLine')}
          description={t('generateResults.closingLineDesc')}
          icon={<Quote className="h-5 w-5" />}
          onRegenerate={regenerate('closing')}
          {...regenerateState('closing')}
        >
          <Markdown className="font-medium">{view.closingLine}</Markdown>
        </SectionCard>
      )}

      {view.sources.length > 0 && (
        <SectionCard
          title={t('generateResults.sources')}
          description={t('generateResults.sourcesDesc')}
          icon={<BookOpen className="h-5 w-5" />}
        >
          <ul className="space-y-2 text-sm">
            {view.sources.map((source, i) => (
              <li key={i} className="min-w-0 break-words">
                <span className="font-medium text-foreground">{sourceLabel(source)}</span>
                {source.claim && <span className="text-foreground">{source.org ? ' – ' : ''}{source.claim}</span>}
                {source.url && (
                  <>
                    {' – '}
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">
                      {source.url}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
