import { ArrowRight, BookOpenCheck, CheckCircle2, FileDown, FileText, Lightbulb, MessageCircle, RefreshCcw, Swords, Target, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SparringScorecard as SparringScorecardType, SparringSession } from '@/lib/ai/schemas/sparring';
import { cn } from '@/lib/utils';

interface SparringScorecardProps {
  session: SparringSession;
  scorecard: SparringScorecardType;
  onRematch: () => void;
  onDiscuss: () => void;
  onAttackRound: () => void;
  onBrainstormMissed: () => void;
  onVerifyOpening: () => void;
  onNewRound: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
}

const categoryLabels: Record<SparringScorecardType['categories'][number]['category'], string> = {
  'argument-strength': 'Argument strength',
  'warrant-quality': 'Warrant quality',
  'impact-analysis': 'Impact analysis',
  engagement: 'Engagement',
  'rebuttal-efficiency': 'Rebuttal efficiency',
  weighing: 'Weighing',
  'evidence-use': 'Evidence use',
  strategy: 'Strategy',
};

function ratingClass(rating: SparringScorecardType['categories'][number]['rating']) {
  if (rating === 'strong') return 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300';
  if (rating === 'needs-work') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-primary/25 bg-primary/10 text-primary';
}

export function SparringScorecard({
  session,
  scorecard,
  onRematch,
  onDiscuss,
  onAttackRound,
  onBrainstormMissed,
  onVerifyOpening,
  onNewRound,
  onExportDocx,
  onExportPdf,
}: SparringScorecardProps) {
  const verdictLabel = scorecard.verdict === 'user-edge'
    ? 'Your side had the edge'
    : scorecard.verdict === 'ai-edge'
      ? 'Opponent had the edge'
      : 'Close round';

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Trophy className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">Round review</span>
              </div>
              <CardTitle className="mt-2 text-2xl">{verdictLabel}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-sm leading-relaxed">{scorecard.summary}</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit capitalize">{session.setup.difficulty}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-primary/20 bg-background/60 p-4">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-semibold">Your single biggest improvement</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{scorecard.biggestImprovement}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {scorecard.categories.map((item) => (
          <Card key={item.category} className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{categoryLabels[item.category]}</CardTitle>
                <Badge variant="outline" className={cn('capitalize', ratingClass(item.rating))}>{item.rating.replace('-', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened</div>
                <p className="mt-1 leading-relaxed">{item.evidence}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next adjustment</div>
                <p className="mt-1 leading-relaxed text-muted-foreground">{item.advice}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3"><CardTitle className="text-base">What worked</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {scorecard.strengths.length > 0 ? scorecard.strengths.map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{item}</span></li>
              )) : <li>No specific strength was identified strongly enough to list.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3"><CardTitle className="text-base">Missed opportunities</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {scorecard.missedArguments.length > 0 ? scorecard.missedArguments.map((item) => <li key={item}>• {item}</li>) : <li>No major missed argument was identified.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3"><CardTitle className="text-base">Next drill</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{scorecard.nextDrill}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Keep working from this round</CardTitle>
          <CardDescription>Carry the actual transcript and motion into DebateLab's existing prep tools instead of starting from scratch.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={onDiscuss}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Discuss with Ask
          </Button>
          <Button variant="outline" onClick={onAttackRound}>
            <Swords className="mr-2 h-4 w-4" />
            Attack my round
          </Button>
          <Button variant="outline" onClick={onBrainstormMissed}>
            <Lightbulb className="mr-2 h-4 w-4" />
            Find arguments I missed
          </Button>
          <Button variant="outline" onClick={onVerifyOpening}>
            <BookOpenCheck className="mr-2 h-4 w-4" />
            Verify my opening
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button onClick={onRematch}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Rematch this motion
        </Button>
        <Button variant="outline" onClick={onExportDocx}>
          <FileText className="mr-2 h-4 w-4" />
          Export Word
        </Button>
        <Button variant="outline" onClick={onExportPdf}>
          <FileDown className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
        <Button variant="ghost" onClick={onNewRound}>
          New motion
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
