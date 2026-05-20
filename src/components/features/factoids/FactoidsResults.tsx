// src/components/features/factoids/FactoidsResults.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, AlertTriangle, CheckCircle, Clock, Search, Lightbulb, MessageSquare, Bookmark, FileText, FileDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Progress } from '@/components/ui/progress';
import type { FactoidsOutput, Factoid } from '@/lib/ai/schemas/factoids';
import { StaggeredContainer } from '@/components/ui/animated-section';
import { cn } from '@/lib/utils';
import { validateUrl } from '@/lib/validation/url';
import { exportFactoidsToPdf } from '@/lib/pdf-export-utils';
import { exportFactoidsToDocx, exportFactoidsToGoogleDocs } from '@/lib/export-utils';
import { toast } from 'sonner';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';
import { AutoSavedSourcesUndo } from '@/components/features/AutoSavedSourcesUndo';


interface FactoidsResultsProps {
  result: FactoidsOutput;
  onVerify?: () => void;
  isVerifying?: boolean;
  onDiscuss?: () => void;
  onSaveSource?: (title: string, content: string, url?: string) => void;
  onUseSuggestion?: (query: string) => void;
}

const verificationConfig = {
  verified: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Verified' },
  unverified: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Unverified' },
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pending' },
};

function FactoidCard({ factoid, onSave }: { factoid: Factoid, onSave?: FactoidsResultsProps['onSaveSource'] }) {
  const { t } = useTranslation();
  // Defensive check for old data format in localStorage
  const verified = factoid.citation?.verified ?? 'pending';
  const config = verificationConfig[verified] ?? verificationConfig.pending;
  const VerifyIcon = config.icon;
  // Use secure URL validation instead of simple string checks
  const safeUrl = validateUrl(factoid.citation?.url);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4 motion-list-item card-hover-glow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2"
            >
              <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors underline-offset-4 group-hover:underline text-left">
                {factoid.shortClaim}
              </h4>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ) : (
            <h4 className="font-semibold text-foreground">{factoid.shortClaim}</h4>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge className={cn('text-xs', config.bg, config.color)}>
              <VerifyIcon className="mr-1 h-3 w-3" />
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t('factoidsResults.relevance')} {factoid.relevanceScore}%
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Progress value={factoid.relevanceScore} className="w-16 h-2" />
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => onSave(factoid.shortClaim, `${factoid.context}\n\nKey Figure: ${factoid.keyFigure}\nLimitations: ${factoid.limitations}`, factoid.citation?.url)}
              title={t('factoidsResults.saveToLibrary')}
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Key Figure */}
      <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-left">
        <span className="text-sm font-medium text-primary">{t('factoidsResults.keyFigure')} </span>
        <span className="text-lg font-bold text-foreground">{factoid.keyFigure}</span>
      </div>

      {/* Context & Limitations */}
      <div className="space-y-2 text-sm text-left">
        <div>
          <span className="font-medium text-muted-foreground">{t('factoidsResults.context')} </span>
          <span className="text-foreground">{factoid.context}</span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">{t('factoidsResults.limitations')} </span>
          <span className="text-foreground">{factoid.limitations}</span>
        </div>
      </div>

      {/* Citation Block */}
      <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm text-left">
        <div className="font-medium text-foreground">{factoid.citation?.title || t('factoidsResults.unknownSource')}</div>
        <div className="text-muted-foreground">
          {factoid.citation?.publisher || t('factoidsResults.unknown')}
          {factoid.citation?.date && ` • ${factoid.citation.date}`}
        </div>
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t('factoidsResults.viewSource')} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-amber-500 text-xs">{t('factoidsResults.urlNeedsVerification')}</span>
        )}
      </div>

      {/* How to Use */}
      <div className="flex items-start gap-2 text-sm">
        <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-muted-foreground">{t('factoidsResults.howToUse')} </span>
          <span className="text-foreground">{factoid.howToUse}</span>
        </div>
      </div>
    </div>
  );
}

export function FactoidsResults({ result, onVerify, isVerifying, onDiscuss, onSaveSource, onUseSuggestion }: FactoidsResultsProps) {
  const { t } = useTranslation();
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);
  const displayFactoids = result.factoids.filter(f => f.citation?.verified === 'verified');
  const verifiedCount = displayFactoids.length;
  const totalCount = Math.max(displayFactoids.length, 1);

  const handleDocxExport = async () => {
    const success = await exportFactoidsToDocx(result);
    if (success) {
      toast.success(t('factoidsResults.exportedDocx'));
    } else {
      toast.error(t('factoidsResults.exportFailedDocx'));
    }
  };

  const handleGoogleDocsExport = async () => {
    setIsExportingGDocs(true);
    try {
      const exportResult = await exportFactoidsToGoogleDocs(result);
      if (exportResult.success && exportResult.documentUrl) {
        toast.success(t('factoidsResults.exportedGdocs'), {
          action: {
            label: t('factoidsResults.open'),
            onClick: () => window.open(exportResult.documentUrl, '_blank'),
          },
        });
      } else if (exportResult.requiresReauth) {
        toast.error(exportResult.error || t('factoidsResults.authRequired'), {
          description: t('factoidsResults.authRequiredDesc'),
        });
      } else {
        toast.error(exportResult.error || t('factoidsResults.exportFailedGdocs'));
      }
    } catch {
      toast.error(t('factoidsResults.exportError'));
    } finally {
      setIsExportingGDocs(false);
    }
  };

  return (
    <StaggeredContainer className="space-y-6">
      {onDiscuss && (
        <div className="flex justify-end gap-2">
          <AutoSavedSourcesUndo />
          <Button variant="outline" size="sm" onClick={() => exportFactoidsToPdf(result)}>
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
          <Button variant="outline" size="sm" onClick={onDiscuss}>
            <MessageSquare className="h-4 w-4 mr-2" />
            {t('factoidsResults.discuss')}
          </Button>
        </div>
      )}

      {/* Verification Status */}
      <SectionCard
        title={t('factoidsResults.verificationStatus')}
        description={`${verifiedCount} ${t('factoidsResults.verified')}`}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={(verifiedCount / totalCount) * 100} className="h-3" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {Math.round((verifiedCount / totalCount) * 100)}%
            </span>
          </div>
          {result.factoids.length !== displayFactoids.length && onVerify && (
            <Button
              onClick={onVerify}
              disabled={isVerifying}
              className="w-full"
            >
              {isVerifying ? t('factoidsResults.verifying') : t('factoidsResults.verifyAll')}
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-amber-600">{t('factoidsResults.importantNotes')}</span>
          </div>
          <ul className="space-y-1 text-sm">
            {result.warnings.map((warning, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span className="text-foreground">{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Factoids */}
      <SectionCard
        title={`${t('factoidsResults.found')} ${displayFactoids.length} ${t('factoidsResults.factoids')}`}
        description={t('factoidsResults.factoidsDesc')}
      >
        <div className="space-y-4">
          {displayFactoids.map((factoid) => (
            <FactoidCard key={factoid.id} factoid={factoid} onSave={onSaveSource} />
          ))}
          {displayFactoids.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              {t('factoidsResults.noVerified', 'No verified matching sources were found. Try a broader source type or timeframe.')}
            </p>
          )}
        </div>
      </SectionCard>

      {/* Search Suggestions */}
      <SectionCard
        title={t('factoidsResults.findMore')}
        description={t('factoidsResults.findMoreDesc')}
        icon={<Search className="h-5 w-5" />}
      >
        <div className="space-y-2">
          {result.searchSuggestions.map((query, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm text-foreground">
                {query}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUseSuggestion?.(query)}
                disabled={!onUseSuggestion}
                title={t('factoidsResults.useSuggestion', 'Search this')}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>
    </StaggeredContainer>
  );
}
