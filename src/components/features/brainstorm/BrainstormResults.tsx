// src/components/features/brainstorm/BrainstormResults.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, ArrowRight, AlertTriangle, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionCard } from '@/components/ui/section-card';
import type { BrainstormOutput, Idea } from '@/lib/ai/schemas/brainstorm';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ExportToolbar } from '@/components/features/ExportToolbar';
import { ResultHeader } from '@/components/features/tools/ResultHeader';
import { CopyResultButton, SaveResultAction } from '@/components/features/tools/result-actions';
import { brainstormText } from '@/components/features/tools/result-text';
import { ResearchedSources } from '@/components/features/tools/ResearchedSources';
import { GoogleDriveAuthModal } from '@/components/features/export/GoogleDriveAuthModal';
import { SourceQualityList } from '@/components/features/shared/SourceQualityList';
import type { DiscoveredSource } from '@/lib/ai/client';
import { openExternalUrl } from '@/lib/native';

interface BrainstormResultsProps {
  result: BrainstormOutput;
  discoveredSources?: DiscoveredSource[];
  onDiscuss?: () => void;
  onSave?: () => void;
  /** The result is already in History; shows “Saved” instead of Save. */
  saved?: boolean;
  saving?: boolean;
}

const strengthColors = {
  strong: 'border-primary bg-primary/5',
  moderate: 'border-amber-500 bg-amber-500/5',
  weak: 'border-muted bg-muted/5',
};

const sideColors = {
  pro: 'bg-primary text-primary-foreground',
  con: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

function IdeaCard({ idea }: { idea: Idea }) {
  const { t } = useTranslation();
  // Defensive defaults for potentially undefined properties
  const strength = idea.strength || 'moderate';
  const side = idea.side || 'neutral';
  const tradeoffs = Array.isArray(idea.tradeoffs) ? idea.tradeoffs : [];

  return (
    <div className={cn('rounded-lg border p-4 space-y-3 motion-list-item', strengthColors[strength] || strengthColors.moderate)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-foreground">{idea.title || t('brainstormResults.untitled')}</h3>
        <div className="flex gap-1 shrink-0">
          <Badge className={cn('text-xs', sideColors[side] || sideColors.neutral)}>
            {side === 'pro' ? t('brainstormResults.pro') : side === 'con' ? t('brainstormResults.con') : t('brainstormResults.neutral')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {strength}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-foreground">{idea.description || ''}</p>
      {tradeoffs.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">{t('brainstormResults.tradeoffs')} </span>
          <span className="text-xs text-foreground">{tradeoffs.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

export function BrainstormResults({ result, discoveredSources, onDiscuss, onSave, saved = false, saving = false }: BrainstormResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);
  const [showDriveAuth, setShowDriveAuth] = useState(false);

  const handleDocxExport = async () => {
    try {
      const { exportBrainstormToDocx } = await import('@/lib/export-utils');
      const success = await exportBrainstormToDocx(result);
      if (success) {
        toast.success(t('brainstormResults.exportedDocx'));
      } else {
        toast.error(t('brainstormResults.exportFailedDocx'));
      }
    } catch {
      toast.error(t('brainstormResults.exportError'));
    }
  };

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const { exportBrainstormToGoogleDocs } = await import('@/lib/export-utils');
      const exportResult = await exportBrainstormToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        const openDocument = (): void => void openExternalUrl(exportResult.documentUrl!, { newWindow: true })
          .catch(() => toast.error(t('brainstormResults.exportError')));
        toast.success(t('brainstormResults.exportedGdocs'), {
          action: {
            label: t('brainstormResults.open'),
            onClick: openDocument,
          },
        });
        openDocument();
      } else if (exportResult.requiresReauth) {
        setShowDriveAuth(true);
      } else {
        toast.error(exportResult.error || t('brainstormResults.exportFailedGdocs'));
      }
    } catch {
      toast.error(t('brainstormResults.exportError'));
    } finally {
      setIsExportingGDocs(false);
    }
  };

  const handlePdfExport = async () => {
    try {
      const { exportBrainstormToPdf } = await import('@/lib/pdf-export-utils');
      await exportBrainstormToPdf(result);
    } catch {
      toast.error(t('brainstormResults.exportError'));
    }
  };

  // Show clarifying questions if needed
  if (result.needsMoreInfo && result.clarifyingQuestions?.length) {
    return (
      <SectionCard
        title={t('brainstormResults.clarification')}
        description={t('brainstormResults.clarificationDesc')}
        icon={<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
      >
        <ul className="space-y-3">
          {result.clarifyingQuestions.map((question, i) => (
            <li key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                {i + 1}
              </span>
              <p className="text-foreground">{question}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <GoogleDriveAuthModal open={showDriveAuth} onOpenChange={setShowDriveAuth} />
      <ResultHeader
        title={t('brainstormResults.resultTitle', 'Angles')}
        actions={(
          <ExportToolbar
            onPdf={handlePdfExport}
            onDocx={handleDocxExport}
            onGoogleDocs={handleGoogleDocsExport}
            isExportingGDocs={isExportingGDocs}
            onDiscuss={onDiscuss}
            discussLabel={t('brainstormResults.discuss')}
            extraExports={<CopyResultButton getText={() => brainstormText(result, t)} />}
            secondaryActions={onSave || saved ? <SaveResultAction saved={saved} onSave={onSave} disabled={saving} /> : undefined}
          />
        )}
      />
      <ResearchedSources sources={discoveredSources} />

      {!result.topFive?.length && !result.mindmap?.length && !result.buckets?.length && (
        <EmptyState
          icon={Lightbulb}
          title={t('brainstormResults.noIdeasTitle', 'No ideas returned')}
          description={t('brainstormResults.noIdeasDesc', 'Try a more specific motion or switch the output format, then brainstorm again.')}
        />
      )}

      {/* Top Five */}
      {result.topFive && Array.isArray(result.topFive) && result.topFive.length > 0 && (
        <SectionCard
          title={t('brainstormResults.top5')}
          description={t('brainstormResults.top5Desc')}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        >
          <div className="space-y-4">
            {result.topFive.map((item) => (
              <div key={item.rank} className="flex gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  #{item.rank}
                </div>
                <div className="flex-1">
                  {item.idea && <IdeaCard idea={item.idea} />}
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-muted-foreground">{item.whyTop}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Mind Map */}
      {result.mindmap && Array.isArray(result.mindmap) && result.mindmap.length > 0 && (
        <SectionCard
          title={t('brainstormResults.argMap')}
          description={t('brainstormResults.argMapDesc')}
        >
          <div className="space-y-6">
            {result.mindmap.map((category, i) => (
              <div key={i}>
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  {category.category}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {category.items && Array.isArray(category.items) && category.items.map((idea) => (
                    <IdeaCard key={idea.id} idea={idea} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Buckets */}
      {result.buckets && Array.isArray(result.buckets) && result.buckets.length > 0 && (
        <div className="grid gap-6 md:grid-cols-3">
          {result.buckets.map((bucket, i) => (
            <SectionCard
              key={i}
              title={bucket.name}
              description={bucket.keyInsight}
            >
              <div className="space-y-3">
                {bucket.ideas && Array.isArray(bucket.ideas) && bucket.ideas.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} />
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Next Steps */}
      {result.nextSteps && result.nextSteps.length > 0 && (
        <SectionCard
          title={t('brainstormResults.nextSteps')}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          <ul className="space-y-2">
            {result.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-xs font-medium shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground">{step}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Warnings */}
      {result.warningsAndTradeoffs && result.warningsAndTradeoffs.length > 0 && (
        <SectionCard
          title={t('brainstormResults.warnings')}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        >
          <ul className="space-y-2">
            {result.warningsAndTradeoffs.map((warning, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-600 dark:text-amber-400 mt-1">⚠</span>
                <span className="text-foreground">{warning}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
