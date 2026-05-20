import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Shield, Swords, AlertTriangle, MessageSquare, FileDown, FileText, Save, GitBranch, FileUp, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/ui/markdown';
import type { GenerateOutput, Contention } from '@/lib/ai/schemas/generate';
import { StaggeredContainer } from '@/components/ui/animated-section';
import { exportCaseToDocx, exportCaseToGoogleDocs } from '@/lib/export-utils';
import { exportCaseToPdf } from '@/lib/pdf-export-utils';
import { toast } from 'sonner';
import { formatEuropeanDateTime } from '@/lib/date-format';

interface GenerateResultsProps {
  result: GenerateOutput;
  onRegenerateSection?: (section: string) => void;
  onDiscuss?: () => void;
  onSave?: () => void;
  onImportFlowchart?: () => void;
}

function ArgumentCard({ contention, index }: { contention: Contention; index: number }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 motion-list-item card-hover-glow">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">
          <span className="text-primary mr-2">#{index + 1}</span>
          {contention.claim}
        </h4>
        {contention.needsSource && (
          <Badge variant="outline" className="shrink-0 border-amber-500 text-amber-600">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {t('generateResults.needsSource')}
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">{t('generateResults.reasoning')} </span>
          <Markdown className="inline">{contention.reasoning}</Markdown>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">{t('generateResults.evidence')} </span>
          <Markdown className="inline">{contention.evidence}</Markdown>
        </div>
        {contention.sourceQuery && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-medium">{t('generateResults.searchSuggestion')} </span>
            <code className="text-primary">{contention.sourceQuery}</code>
          </div>
        )}
        <div>
          <span className="font-medium text-muted-foreground">{t('generateResults.impact')} </span>
          <Markdown className="inline">{contention.impact}</Markdown>
        </div>
      </div>
    </div>
  );
}

export function GenerateResults({ result, onRegenerateSection, onDiscuss, onSave, onImportFlowchart }: GenerateResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const exportResult = await exportCaseToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        toast.success(t('generateResults.exportedGdocs'), {
          action: {
            label: t('generateResults.open'),
            onClick: () => window.open(exportResult.documentUrl, '_blank'),
          },
        });
        window.open(exportResult.documentUrl, '_blank');
      } else if (exportResult.requiresReauth) {
        toast.error(exportResult.error || t('generateResults.authRequired'), {
          description: t('generateResults.authRequiredDesc'),
        });
      } else {
        toast.error(exportResult.error || t('generateResults.exportFailed'));
      }
    } catch {
      toast.error(t('generateResults.exportError'));
    } finally {
      setIsExportingGDocs(false);
    }
  };

  // Guard against incomplete result data
  if (!result?.caseStructure || !result?.contentions || !result?.predictedOpponentCase || !result?.counters) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <h3 className="text-lg font-semibold text-destructive mb-2">{t('generateResults.incomplete')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('generateResults.incompleteDesc')}
        </p>
      </div>
    );
  }

  return (
    <StaggeredContainer className="space-y-6">
      {/* Metadata */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={result.metadata?.side === 'pro' ? 'default' : 'secondary'}>
            {result.metadata?.side === 'pro' ? t('generateResults.proposition') : t('generateResults.opposition')}
          </Badge>
          <Badge variant="outline">{result.metadata?.format?.toUpperCase() || 'N/A'}</Badge>
          <span className="text-xs text-muted-foreground">
            {t('generateResults.generated')} {result.metadata?.generatedAt ? formatEuropeanDateTime(result.metadata.generatedAt) : 'N/A'}
          </span>
        </div>
        <div className="flex gap-2" data-tour="export-section">
          {onSave && (
            <Button variant="outline" size="sm" onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              {t('generateResults.save')}
            </Button>
          )}
          {onDiscuss && (
            <Button variant="outline" size="sm" onClick={onDiscuss}>
              <MessageSquare className="h-4 w-4 mr-2" />
              {t('generateResults.discuss')}
            </Button>
          )}
          {onImportFlowchart && (
            <Button variant="outline" size="sm" onClick={onImportFlowchart}>
              <GitBranch className="h-4 w-4 mr-2" />
              {t('generateResults.flowcharts')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => exportCaseToDocx(result)}>
            <FileDown className="h-4 w-4 mr-2" />
            {t('generateResults.word')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCaseToPdf(result)}>
            <FileText className="h-4 w-4 mr-2" />
            {t('generateResults.pdf')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoogleDocsExport}
            disabled={isExportingGDocs}
          >
            {isExportingGDocs ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4 mr-2" />
            )}
            {t('generateResults.googleDocs')}
          </Button>
        </div>
      </div>

      {/* Exordio (Introductor only) */}
      {result.exordio && (result.exordio.hook || result.exordio.transition) && (
        <SectionCard
          title={t('generateResults.exordio')}
          description={t('generateResults.exordioDesc')}
          icon={<Sparkles className="h-5 w-5" />}
          onRegenerate={() => onRegenerateSection?.('exordio')}
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.hook')}</h4>
              <p className="text-foreground italic">{result.exordio.hook}</p>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.transition')}</h4>
              <p className="text-foreground">{result.exordio.transition}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Case Structure */}
      <SectionCard
        title={t('generateResults.caseStructure')}
        description={t('generateResults.caseStructureDesc')}
        icon={<Target className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('structure')}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.thesis')}</h4>
            <Markdown>{result.caseStructure.thesis}</Markdown>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.framework')}</h4>
            <Markdown>{result.caseStructure.framework}</Markdown>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('generateResults.burdenOfProof')}</h4>
            <Markdown>{result.caseStructure.burdenOfProof}</Markdown>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('generateResults.keyDefinitions')}</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
              {result.caseStructure.keyDefinitions?.map((def, i) => (
                <li key={i}>{def}</li>
              )) || <li className="text-muted-foreground">{t('generateResults.noDefinitions')}</li>}
            </ul>
          </div>
        </div>
      </SectionCard>

      {/* Contentions */}
      <SectionCard
        title={t('generateResults.arguments')}
        description={`${result.contentions?.length || 0} ${t('generateResults.structuredArguments')}`}
        icon={<Shield className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('contentions')}
      >
        <div className="space-y-4">
          {result.contentions?.map((contention, index) => (
            <ArgumentCard key={contention.id} contention={contention} index={index} />
          ))}
        </div>
      </SectionCard>

      {/* Predicted Opponent Case */}
      <SectionCard
        title={t('generateResults.predictedOpponent')}
        description={t('generateResults.predictedOpponentDesc')}
        icon={<Swords className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('opponent')}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('generateResults.likelyArguments')}</h4>
            <ul className="space-y-2">
              {result.predictedOpponentCase?.likelyArguments?.map((arg, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-destructive mt-1">•</span>
                  <span className="text-foreground">{arg}</span>
                </li>
              ))}
            </ul>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('generateResults.strategicWeaknesses')}</h4>
            <ul className="space-y-2">
              {result.predictedOpponentCase?.strategicWeaknesses?.map((weakness, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-500 mt-1">•</span>
                  <span className="text-foreground">{weakness}</span>
                </li>
              ))}
            </ul>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('generateResults.keyClashes')}</h4>
            <div className="flex flex-wrap gap-2">
              {result.predictedOpponentCase?.keyClashes?.map((clash, i) => (
                <Badge key={i} variant="outline">{clash}</Badge>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Prepared Counters */}
      <SectionCard
        title={t('generateResults.preparedCounters')}
        description={t('generateResults.preparedCountersDesc')}
        onRegenerate={() => onRegenerateSection?.('counters')}
      >
        <div className="space-y-4">
          {result.counters?.map((counter, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">{t('generateResults.target')}</Badge>
                <span className="text-sm font-medium text-foreground">{counter?.targetArgument}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t('generateResults.counter')} </span>
                <span className="text-sm text-foreground">{counter?.counterpoint}</span>
              </div>
              <div className="bg-muted/50 rounded-md p-2">
                <span className="text-xs font-medium text-muted-foreground">{t('generateResults.rebuttal')} </span>
                <span className="text-sm text-foreground">{counter?.rebuttal}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </StaggeredContainer>
  );
}
