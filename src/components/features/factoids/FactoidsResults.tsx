// src/components/features/factoids/FactoidsResults.tsx
import { ExternalLink, AlertTriangle, CheckCircle, Clock, Search, Lightbulb, MessageSquare, Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Progress } from '@/components/ui/progress';
import type { FactoidsOutput, Factoid } from '@/lib/ai/schemas/factoids';
import { cn } from '@/lib/utils';

interface FactoidsResultsProps {
  result: FactoidsOutput;
  onVerify?: () => void;
  isVerifying?: boolean;
  onDiscuss?: () => void;
  onSaveSource?: (title: string, content: string, url?: string) => void;
}

const verificationConfig = {
  verified: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Verified' },
  unverified: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Unverified' },
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pending' },
};

function FactoidCard({ factoid, onSave }: { factoid: Factoid, onSave?: FactoidsResultsProps['onSaveSource'] }) {
  const config = verificationConfig[factoid.citation.verified];
  const VerifyIcon = config.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {factoid.citation.url ? (
            <a 
              href={factoid.citation.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center gap-2"
            >
              <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors underline-offset-4 group-hover:underline">
                {factoid.shortClaim}
              </h4>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
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
              Relevance: {factoid.relevanceScore}%
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
              onClick={() => onSave(factoid.shortClaim, `${factoid.context}\n\nKey Figure: ${factoid.keyFigure}\nLimitations: ${factoid.limitations}`, factoid.citation.url)}
              title="Save to Library"
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Key Figure */}
      <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
        <span className="text-sm font-medium text-primary">Key Figure: </span>
        <span className="text-lg font-bold text-foreground">{factoid.keyFigure}</span>
      </div>

      {/* Context & Limitations */}
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">Context: </span>
          <span className="text-foreground">{factoid.context}</span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Limitations: </span>
          <span className="text-foreground">{factoid.limitations}</span>
        </div>
      </div>

      {/* Citation Block */}
      <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
        <div className="font-medium text-foreground">{factoid.citation.title}</div>
        <div className="text-muted-foreground">
          {factoid.citation.publisher}
          {factoid.citation.date && ` • ${factoid.citation.date}`}
        </div>
        {factoid.citation.url ? (
          <a
            href={factoid.citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View Source <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-amber-500 text-xs">URL requires verification</span>
        )}
      </div>

      {/* How to Use */}
      <div className="flex items-start gap-2 text-sm">
        <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-muted-foreground">How to use: </span>
          <span className="text-foreground">{factoid.howToUse}</span>
        </div>
      </div>
    </div>
  );
}

export function FactoidsResults({ result, onVerify, isVerifying, onDiscuss, onSaveSource }: FactoidsResultsProps) {
  const verifiedCount = result.factoids.filter(f => f.citation.verified === 'verified').length;
  const unverifiedCount = result.factoids.filter(f => f.citation.verified === 'unverified').length;

  return (
    <div className="space-y-6">
      {onDiscuss && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onDiscuss}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Discuss Evidence
          </Button>
        </div>
      )}

      {/* Verification Status */}
      <SectionCard
        title="Verification Status"
        description={`${verifiedCount} verified, ${unverifiedCount} need verification`}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={(verifiedCount / result.factoids.length) * 100} className="h-3" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {Math.round((verifiedCount / result.factoids.length) * 100)}%
            </span>
          </div>
          {unverifiedCount > 0 && onVerify && (
            <Button
              onClick={onVerify}
              disabled={isVerifying}
              className="w-full"
            >
              {isVerifying ? 'Verifying Sources...' : 'Verify All Sources'}
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-amber-600">Important Notes</span>
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
        title={`Found ${result.factoids.length} Factoids`}
        description="Evidence points with citations"
      >
        <div className="space-y-4">
          {result.factoids.map((factoid) => (
            <FactoidCard key={factoid.id} factoid={factoid} onSave={onSaveSource} />
          ))}
        </div>
      </SectionCard>

      {/* Search Suggestions */}
      <SectionCard
        title="Find More Evidence"
        description="Suggested search queries"
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
                onClick={() => window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
