// src/components/features/attack/AttackResults.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, MessageSquare, Scale, Lightbulb, FileText, FileDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/ui/markdown';
import type { AttackOutput, Weakness } from '@/lib/ai/schemas/attack';
import { StaggeredContainer } from '@/components/ui/animated-section';
import { cn } from '@/lib/utils';
import { exportAttackToPdf } from '@/lib/pdf-export-utils';
import { exportAttackToDocx, exportAttackToGoogleDocs } from '@/lib/export-utils';
import { toast } from 'sonner';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';


interface AttackResultsProps {
  result: AttackOutput;
  onDiscuss?: () => void;
}

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' },
  major: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  minor: { icon: Info, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
};

function WeaknessCard({ weakness }: { weakness: Weakness }) {
  const { t } = useTranslation();
  const config = severityConfig[weakness.severity];
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
              <Badge variant="outline" className="text-xs">{weakness.type}</Badge>
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

export function AttackResults({ result, onDiscuss }: AttackResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);

  const criticalCount = result.weaknesses.filter(w => w.severity === 'critical').length;
  const majorCount = result.weaknesses.filter(w => w.severity === 'major').length;
  const minorCount = result.weaknesses.filter(w => w.severity === 'minor').length;

  const handleDocxExport = async () => {
    const success = await exportAttackToDocx(result);
    if (success) {
      toast.success(t('attackResults.exportedDocx'));
    } else {
      toast.error(t('attackResults.exportFailedDocx'));
    }
  };

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const exportResult = await exportAttackToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        toast.success(t('attackResults.exportedGdocs'), {
          action: {
            label: t('attackResults.open'),
            onClick: () => window.open(exportResult.documentUrl, '_blank'),
          },
        });
        window.open(exportResult.documentUrl, '_blank');
      } else if (exportResult.requiresReauth) {
        toast.error(exportResult.error || t('attackResults.authRequired'), {
          description: t('attackResults.authRequiredDesc'),
        });
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
      {/* Overall Assessment */}
      <SectionCard
        title={t('attackResults.overall')}
        description={result.overallAssessment.summary}
      >
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{t('attackResults.caseStrength')}</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-lg font-bold',
                  result.overallAssessment.score >= 70 ? 'text-primary' :
                    result.overallAssessment.score >= 50 ? 'text-amber-500' : 'text-destructive'
                )}>
                  {result.overallAssessment.score}/100
                </span>
                <Button variant="outline" size="sm" onClick={() => exportAttackToPdf(result)}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleDocxExport}>
                  <FileDown className="h-4 w-4 mr-2" />
                  DOCX
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
                    <GoogleDocsIcon className="h-4 w-4 mr-2" />
                  )}
                  Google Docs
                </Button>
                {onDiscuss && (
                  <Button variant="outline" size="sm" onClick={onDiscuss}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t('attackResults.discuss')}
                  </Button>
                )}
              </div>
            </div>
            <Progress
              value={result.overallAssessment.score}
              className="h-3"
            />
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
              {result.overallAssessment.strengthAreas.map((strength, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1">✓</span>
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
        description={`${result.weaknesses.length} ${t('attackResults.weaknessesCount')}`
        }
        icon={< AlertCircle className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {result.weaknesses.map((weakness) => (
            <WeaknessCard key={weakness.id} weakness={weakness} />
          ))}
        </div>
      </SectionCard >

      {/* Fallacies */}
      {
        result.fallaciesDetected.length > 0 && (
          <SectionCard
            title={t('attackResults.fallacies')}
            description={t('attackResults.fallaciesDesc')}
          >
            <div className="space-y-3">
              {result.fallaciesDetected.map((fallacy, i) => (
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
          {result.crossExQuestions.map((q, i) => (
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
      <SectionCard
        title={t('attackResults.weighing')}
        description={t('attackResults.weighingDesc')}
        icon={<Scale className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('attackResults.currentWeighing')}</h4>
            <p className="text-foreground">{result.weighingAnalysis.currentWeighing}</p>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('attackResults.missingComparisons')}</h4>
            <ul className="space-y-1">
              {result.weighingAnalysis.missingComparisons.map((comparison, i) => (
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
              {result.weighingAnalysis.improvementSuggestions.map((suggestion, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1">→</span>
                  <span className="text-foreground">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>
    </StaggeredContainer >
  );
}
