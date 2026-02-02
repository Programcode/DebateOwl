// src/components/features/brainstorm/BrainstormResults.tsx
import { TrendingUp, ArrowRight, AlertTriangle, Lightbulb, MessageSquare, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import type { BrainstormOutput, Idea } from '@/lib/ai/schemas/brainstorm';
import { cn } from '@/lib/utils';

// Helper to ensure we always have an array, filtering out non-array truthy values (objects/strings)
const safeArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  return [];
};

interface BrainstormResultsProps {
  result: BrainstormOutput;
  onDiscuss?: () => void;
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
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', strengthColors[idea.strength])}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">{idea.title}</h4>
        <div className="flex gap-1 shrink-0">
          <Badge className={cn('text-xs', sideColors[idea.side] || sideColors.neutral)}>
            {idea.side === 'pro' ? 'PRO' : idea.side === 'con' ? 'CON' : 'NEUTRAL'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {idea.strength}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-foreground">{idea.description}</p>
      {safeArray(idea.tradeoffs).length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">Tradeoffs: </span>
          <span className="text-xs text-foreground">{safeArray(idea.tradeoffs).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

export function BrainstormResults({ result, onDiscuss }: BrainstormResultsProps) {
  // Show clarifying questions if needed
  if (result.needsMoreInfo && result.clarifyingQuestions?.length) {
    return (
      <SectionCard
        title="Clarification Needed"
        description="Please answer these questions for better results"
        icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
      >
        <ul className="space-y-3">
          {safeArray(result.clarifyingQuestions).map((question, i) => (
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
      {onDiscuss && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onDiscuss}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Discuss Ideas
          </Button>
        </div>
      )}

      {/* Top Five */}
      {safeArray(result.topFive).length > 0 && (
        <SectionCard
          title="Top 5 Argument Angles"
          description="Best options ranked by potential"
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        >
          <div className="space-y-4">
            {safeArray(result.topFive).map((item) => (
              <div key={item.rank} className="flex gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  #{item.rank}
                </div>
                <div className="flex-1">
                  <IdeaCard idea={item.idea} />
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">{item.whyTop}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Mind Map */}
      {safeArray(result.mindmap).length > 0 && (
        <SectionCard
          title="Argument Map"
          description="Ideas organized by category"
        >
          <div className="space-y-6">
            {safeArray(result.mindmap).map((category, i) => (
              <div key={i}>
                <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  {category.category}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {safeArray(category.items).map((idea) => (
                    <IdeaCard key={idea.id} idea={idea} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Buckets */}
      {safeArray(result.buckets).length > 0 && (
        <div className="grid gap-6 md:grid-cols-3">
          {safeArray(result.buckets).map((bucket, i) => (
            <SectionCard
              key={i}
              title={bucket.name}
              description={bucket.keyInsight}
            >
              <div className="space-y-3">
                {safeArray(bucket.ideas).map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} />
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Find More Evidence */}
      {safeArray(result.searchSuggestions).length > 0 && (
        <SectionCard
          title="Find More Evidence"
          description="Suggested search queries"
          icon={<Search className="h-5 w-5" />}
        >
          <div className="space-y-2">
            {safeArray(result.searchSuggestions).map((query: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-xs font-medium shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground">{query}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Next Steps */}
      <SectionCard
        title="Recommended Next Steps"
        icon={<ArrowRight className="h-5 w-5" />}
      >
        <ul className="space-y-2">
          {safeArray(result.nextSteps).map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-xs font-medium shrink-0">
                {i + 1}
              </span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Warnings */}
      {safeArray(result.warningsAndTradeoffs).length > 0 && (
        <SectionCard
          title="Warnings & Tradeoffs"
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
        >
          <ul className="space-y-2">
            {safeArray(result.warningsAndTradeoffs).map((warning, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 mt-1">⚠</span>
                <span className="text-foreground">{warning}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
