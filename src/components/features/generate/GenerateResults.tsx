// src/components/features/generate/GenerateResults.tsx
import { Target, Shield, Swords, AlertTriangle, MessageSquare, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Separator } from '@/components/ui/separator';
import type { GenerateOutput, Contention } from '@/lib/ai/schemas/generate';
import { exportCaseToDocx } from '@/lib/export-utils';

interface GenerateResultsProps {
  result: GenerateOutput;
  onRegenerateSection?: (section: string) => void;
  onDiscuss?: () => void;
}

function ContentionCard({ contention, index }: { contention: Contention; index: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">
          <span className="text-primary mr-2">#{index + 1}</span>
          {contention.claim}
        </h4>
        {contention.needsSource && (
          <Badge variant="outline" className="shrink-0 border-amber-500 text-amber-600">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Needs Source
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">Reasoning: </span>
          <span className="text-foreground">{contention.reasoning}</span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Evidence: </span>
          <span className="text-foreground">{contention.evidence}</span>
        </div>
        {contention.sourceQuery && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-medium">Search suggestion: </span>
            <code className="text-primary">{contention.sourceQuery}</code>
          </div>
        )}
        <div>
          <span className="font-medium text-muted-foreground">Impact: </span>
          <span className="text-foreground">{contention.impact}</span>
        </div>
      </div>
    </div>
  );
}

export function GenerateResults({ result, onRegenerateSection, onDiscuss }: GenerateResultsProps) {
  // Guard against incomplete result data
  if (!result?.caseStructure || !result?.contentions || !result?.predictedOpponentCase || !result?.counters) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <h3 className="text-lg font-semibold text-destructive mb-2">Generation Incomplete</h3>
        <p className="text-sm text-muted-foreground">
          The AI response was incomplete or malformed. Please try generating again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={result.metadata?.side === 'pro' ? 'default' : 'secondary'}>
            {result.metadata?.side === 'pro' ? 'Proposition' : 'Opposition'}
          </Badge>
          <Badge variant="outline">{result.metadata?.format?.toUpperCase() || 'N/A'}</Badge>
          <span className="text-xs text-muted-foreground">
            Generated {result.metadata?.generatedAt ? new Date(result.metadata.generatedAt).toLocaleString() : 'N/A'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCaseToDocx(result)}>
            <FileDown className="h-4 w-4 mr-2" />
            Export Word
          </Button>
          {onDiscuss && (
            <Button variant="outline" size="sm" onClick={onDiscuss}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Discuss Case
            </Button>
          )}
        </div>
      </div>

      {/* Case Structure */}
      <SectionCard
        title="Case Structure"
        description="Your argument framework"
        icon={<Target className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('structure')}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Thesis</h4>
            <p className="text-foreground">{result.caseStructure.thesis}</p>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Framework</h4>
            <p className="text-foreground">{result.caseStructure.framework}</p>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Burden of Proof</h4>
            <p className="text-foreground">{result.caseStructure.burdenOfProof}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Definitions</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
              {result.caseStructure.keyDefinitions?.map((def, i) => (
                <li key={i}>{def}</li>
              )) || <li className="text-muted-foreground">No definitions provided</li>}
            </ul>
          </div>
        </div>
      </SectionCard>

      {/* Contentions */}
      <SectionCard
        title="Contentions"
        description={`${result.contentions?.length || 0} structured arguments`}
        icon={<Shield className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('contentions')}
      >
        <div className="space-y-4">
          {result.contentions?.map((contention, index) => (
            <ContentionCard key={contention.id} contention={contention} index={index} />
          ))}
        </div>
      </SectionCard>

      {/* Predicted Opponent Case */}
      <SectionCard
        title="Predicted Opponent Case"
        description="What they'll likely argue"
        icon={<Swords className="h-5 w-5" />}
        onRegenerate={() => onRegenerateSection?.('opponent')}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Likely Arguments</h4>
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
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Strategic Weaknesses</h4>
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
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Clashes</h4>
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
        title="Prepared Counters"
        description="Ready-to-use rebuttals"
        onRegenerate={() => onRegenerateSection?.('counters')}
      >
        <div className="space-y-4">
          {result.counters?.map((counter, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">Target</Badge>
                <span className="text-sm font-medium text-foreground">{counter?.targetArgument}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Counter: </span>
                <span className="text-sm text-foreground">{counter?.counterpoint}</span>
              </div>
              <div className="bg-muted/50 rounded-md p-2">
                <span className="text-xs font-medium text-muted-foreground">Rebuttal: </span>
                <span className="text-sm text-foreground">{counter?.rebuttal}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
