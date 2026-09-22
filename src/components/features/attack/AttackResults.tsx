// src/components/features/attack/AttackResults.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, Scale, Lightbulb, MessageSquare, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionCard } from '@/components/ui/section-card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/ui/markdown';
import type { AttackOutput, Weakness } from '@/lib/ai/schemas/attack';
import { StaggeredContainer } from '@/components/ui/animated-section';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ExportToolbar } from '@/components/features/ExportToolbar';
import { GoogleDriveAuthModal } from '@/components/features/export/GoogleDriveAuthModal';
import { SourceQualityList } from '@/components/features/shared/SourceQualityList';
import type { DiscoveredSource } from '@/lib/ai/client';
import { openExternalUrl } from '@/lib/native';
import { Button } from '@/components/ui/button';


interface AttackResultsProps {
  result: AttackOutput;
  discoveredSources?: DiscoveredSource[];
  onDiscuss?: () => void;
  onPracticeCrossfire?: () => void;
}

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' },
  major: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  minor: { icon: Info, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
};

function WeaknessCard({ weakness }: { weakness: Weakness }) {
  const { t } = useTranslation();
  // Defensive fallback for unrecognized/legacy severity values.
  const config = severityConfig[weakness.severity] ?? severityConfig.minor;
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border p-4 space-y-3 motion-list-item card-hover-glow', config.border, config.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className={cn('h-5 w-5 mt-0.5', config.color)} />
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-xs uppercase', config.color)}>
                {t(`attackResults.severity.${weakness.severity}`, weakness.severity)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {t(`attackResults.types.${weakness.type}`, weakness.type)}
              </Badge>
            </div>
            <h4 className="mt-1 font-medium text-foreground">{weakness.description}</h4>
          </div>
        </div>
      </div>

      {weakness.affectedQuote && (
        <div className="rounded-md bg-muted/50 p-2 text-sm italic text-muted-foreground border-l-2 border-border">
          "{weakness.affectedQuote}"
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">{t('attackResults.whyWeak')} </span>
          <Markdown className="inline">{weakness.whyWeak}</Markdown>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">{t('attackResults.opponentAttack')} </span>
          <span className="text-foreground italic">"{weakness.howOpponentAttacks}"</span>
        </div>
      </div>

      <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">{t('attackResults.improvedVersion')}</span>
        </div>
        <p className="text-sm text-foreground"><Markdown>{weakness.improvedVersion}</Markdown></p>
      </div>
    </div>
  );
}

export function AttackResults({ result, discoveredSources, onDiscuss, onPracticeCrossfire }: AttackResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);
  const [showDriveAuth, setShowDriveAuth] = useState(false);

  // Guard against malformed/legacy persisted results so navigating back to
  // this page renders an empty state instead of crashing the route.
  const weaknesses = Array.isArray(result?.weaknesses) ? result.weaknesses : [];
  const fallaciesDetected = Array.isArray(result?.fallaciesDetected) ? result.fallaciesDetected : [];
  const crossExQuestions = Array.isArray(result?.crossExQuestions) ? result.crossExQuestions : [];
  const overallAssessment = result?.overallAssessment ?? { summary: '', score: 0, strengthAreas: [] };
  const strengthAreas = Array.isArray(overallAssessment.strengthAreas) ? overallAssessment.strengthAreas : [];
  const weighingAnalysis = result?.weighingAnalysis;

  const criticalCount = weaknesses.filter(w => w.severity === 'critical').length;
  const majorCount = weaknesses.filter(w => w.severity === 'major').length;
  const minorCount = weaknesses.filter(w => w.severity === 'minor').length;

  const handlePdfExport = async () => {
    try {
      const { exportAttackToPdf } = await import('@/lib/pdf-export-utils');
      const success = await exportAttackToPdf(result);
      if (success) {
        toast.success(t('attackResults.exportedPdf'));
      } else {
        toast.error(t('attackResults.exportFailedPdf'));
      }
    } catch {
      toast.error(t('attackResults.exportError'));
    }
  };

  const handleDocxExport = async () => {
    try {
      const { exportAttackToDocx } = await import('@/lib/export-utils');
      const success = await exportAttackToDocx(result);
      if (success) {
        toast.success(t('attackResults.exportedDocx'));
      } else {
        toast.error(t('attackResults.exportFailedDocx'));
      }
    } catch {
      toast.error(t('attackResults.exportError'));
    }
  };

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const { exportAttackToGoogleDocs } = await import('@/lib/export-utils');
      const exportResult = await exportAttackToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        const openDocument = (): void => void openExternalUrl(exportResult.documentUrl!, { newWindow: true })
          .catch(() => toast.error(t('attackResults.exportError')));
        toast.success(t('attackResults.exportedGdocs'), {
          action: {
            label: t('attackResults.open'),
            onClick: openDocument,
          },
        });
        openDocument();
      } else if (exportResult.requiresReauth) {
        setShowDriveAuth(true);
      } else {
        toast.error(exportResult.error || t('attackResults.exportFailedGdocs'));
      }
    } catch {
      toast.error(t('attackResults.exportError'));
    } finally {
      setIsExportingGDocs(false);
    }
  };

  return (
    <StaggeredContainer className="space-y-6">
      <GoogleDriveAuthModal open={showDriveAuth} onOpenChange={setShowDriveAuth} />
      {/* Researched sources with quality provenance */}
      {discoveredSources && discoveredSources.length > 0 && (
        <div className="rounded-lg border bg-card/50 p-4">
          <h4 className="mb-2 text-sm font-medium">{t('sourceQuality.researchedSources')}</h4>
          <SourceQualityList sources={discoveredSources} />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('sourceQuality.fallbackNote')}
          </p>
        </div>
      )}
      {/* Overall Assessment */}
      <SectionCard
        title={t('attackResults.overall')}
        description={overallAssessment.summary}
      >
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{t('attackResults.caseStrength')}</span>
              <span className={cn(
                  'text-lg font-bold',
                  overallAssessment.score >= 70 ? 'text-primary' :
                    overallAssessment.score >= 50 ? 'text-amber-500' : 'text-destructive'
                )}>
                  {overallAssessment.score}/100
              </span>
            </div>
            <Progress
              value={overallAssessment.score}
              className="h-3"
            />
            <div className="mt-3">
              <ExportToolbar
                onPdf={handlePdfExport}
                onDocx={handleDocxExport}
                onGoogleDocs={handleGoogleDocsExport}
                isExportingGDocs={isExportingGDocs}
                onDiscuss={onDiscuss}
                discussLabel={t('attackResults.discuss')}
                secondaryActions={onPracticeCrossfire ? (
                  <Button variant="outline" size="sm" onClick={onPracticeCrossfire}>
                    <Flame className="mr-2 h-4 w-4" />
                    {t('crossfire.openFromResult', 'Open in Crossfire')}
                  </Button>
                ) : undefined}
              />
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full bg-destructive" />
              <span>{criticalCount} {t('attackResults.critical')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <span>{majorCount} {t('attackResults.major')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span>{minorCount} {t('attackResults.minor')}</span>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('attackResults.strengths')}</h4>
            <ul className="space-y-1">
              {strengthAreas.map((strength, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="text-primary leading-none">✓</span>
                  <span className="text-foreground">{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard >

      {/* Weaknesses */}
      < SectionCard
        title={t('attackResults.weaknesses')}
        description={t('attackResults.weaknessesCount', { count: weaknesses.length })}
        icon={< AlertCircle className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {weaknesses.map((weakness) => (
            <WeaknessCard key={weakness.id} weakness={weakness} />
          ))}
        </div>
      </SectionCard >

      {/* Fallacies */}
      {
        fallaciesDetected.length > 0 && (
          <SectionCard
            title={t('attackResults.fallacies')}
            description={t('attackResults.fallaciesDesc')}
          >
            <div className="space-y-3">
              {fallaciesDetected.map((fallacy, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive">{fallacy.name}</Badge>
                    <span className="text-xs text-muted-foreground">{t('attackResults.in')} {fallacy.location}</span>
                  </div>
                  <p className="text-sm text-foreground"><Markdown>{fallacy.explanation}</Markdown></p>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      }

      {/* Cross-Ex Questions */}
      <SectionCard
        title={t('attackResults.crossEx')}
        description={t('attackResults.crossExDesc')}
        icon={<MessageSquare className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {crossExQuestions.map((q, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <p className="font-medium text-foreground mb-2">"{q.question}"</p>
              <div className="grid gap-2 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">{t('attackResults.purpose')} </span>
                  <span className="text-foreground">{q.purpose}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">{t('attackResults.expectedTrap')} </span>
                  <span className="text-foreground">{q.expectedTrap}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Weighing Analysis */}
      {weighingAnalysis && (
        <SectionCard
          title={t('attackResults.weighing')}
          description={t('attackResults.weighingDesc')}
          icon={<Scale className="h-5 w-5" />}
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('attackResults.currentWeighing')}</h4>
              <p className="text-foreground">{weighingAnalysis.currentWeighing}</p>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('attackResults.missingComparisons')}</h4>
              <ul className="space-y-1">
                {(weighingAnalysis.missingComparisons ?? []).map((comparison, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-destructive mt-1">•</span>
                    <span className="text-foreground">{comparison}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('attackResults.improvements')}</h4>
              <ul className="space-y-1">
                {(weighingAnalysis.improvementSuggestions ?? []).map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-1">→</span>
                    <span className="text-foreground">{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
      )}
    </StaggeredContainer >
  );
}
