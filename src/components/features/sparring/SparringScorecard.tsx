import { useState } from 'react';
import { Owl, OwlAvatar } from '@/components/brand/Owl';
import { useTranslation } from 'react-i18next';
import { Award, BarChart3, Bot, Download, FileText, Lightbulb, Mic, RotateCcw, Sparkles, Target, UserRound, Check } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { formatRoundTime, getSparringFormat } from '@/lib/sparring/formats';
import type { SparringScorecard } from '@/lib/ai/schemas/sparring';
import type { SparringSession } from '@/lib/stores/sparring-store';
import { DeliveryFacts } from '@/components/features/voice/DeliveryFacts';

interface SparringScorecardProps {
  session: SparringSession;
  scorecard: SparringScorecard;
  onRestart: () => void;
  onExport?: () => void;
  onExportPdf?: () => void;
}

function winnerTone(winner: SparringScorecard['winner']) {
  // A loss is never red: it reads as "keep training", in the plume tint.
  if (winner === 'user') return 'border-success/40 bg-success-tint text-success-text';
  if (winner === 'ai') return 'border-brand-tint-border bg-brand-tint text-primary';
  return 'border-warning/40 bg-warning-tint text-warning-text';
}

export function SparringScorecard({ session, scorecard, onRestart, onExport, onExportPdf }: SparringScorecardProps) {
  const { t } = useTranslation();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const formatLabel = t(`sparring.format.${session.format}`, getSparringFormat(session.format).name);
  // Speeches the student spoke aloud carry measured facts; typed rounds have none.
  const spokenSpeeches = session.speeches.filter((speech) => speech.speaker === 'user' && speech.delivery);
  const spokenRound = spokenSpeeches.length > 0;
  const chartData = scorecard.categories.map((category) => ({
    // The axis shows this value, so it carries the translated name.
    category: t(`sparring.category.${category.name}`, category.name),
    You: category.userScore,
    Opponent: category.aiScore,
  }));
  const winnerText = scorecard.winner === 'user'
    ? t('sparring.scorecard.userWon', 'You won the ballot')
    : scorecard.winner === 'ai'
      ? t('sparring.scorecard.opponentWon', 'AI opponent won the ballot')
      : t('sparring.scorecard.tie', 'The round was a tie');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Award className="h-3.5 w-3.5" aria-hidden="true" /> {t('sparring.scorecard.eyebrow', 'Round review')}</div>
          <h1 className="mt-2 font-display text-3xl font-[600] tracking-[-0.015em] text-heading sm:text-4xl">{t('sparring.scorecard.heading', 'Here is what happened in the room.')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{session.motion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onExport && <Button type="button" variant="outline" onClick={onExport}><Download className="h-4 w-4" aria-hidden="true" />{t('sparring.scorecard.exportDocx', 'Export DOCX')}</Button>}
          {onExportPdf && <Button type="button" variant="ghost" onClick={onExportPdf}><Download className="h-4 w-4" aria-hidden="true" />{t('sparring.scorecard.exportPdf', 'PDF')}</Button>}
          <Button type="button" onClick={onRestart}><RotateCcw className="h-4 w-4" aria-hidden="true" />{t('sparring.scorecard.restart', 'Start another round')}</Button>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]" aria-labelledby="result-heading">
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* The owl celebrates a win and holds up one point to work on otherwise. */}
                <Owl pose={scorecard.winner === 'user' ? 'celebrating' : 'idea'} size={96} priority className="-my-2 animate-in zoom-in-90 fade-in-0 duration-500 ease-overshoot" />
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{t('sparring.scorecard.finalResult', 'Final result')}</p>
                  <h2 id="result-heading" className="mt-1 font-display text-2xl font-[600] text-heading">{winnerText}</h2>
                </div>
              </div>
              <Badge variant="outline" className={cn('rounded-full px-3 py-1.5 text-xs', winnerTone(scorecard.winner))}>{scorecard.winner === 'user' && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}{scorecard.winner === 'tie' ? t('sparring.scorecard.tied', 'Tied') : scorecard.winner === 'user' ? t('sparring.scorecard.winner', 'Winner') : t('sparring.scorecard.keepTraining', 'Keep training')}</Badge>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <ScoreTotal label={t('sparring.scorecard.yourScore', 'Your score')} score={scorecard.userScore} icon={<UserRound className="h-4 w-4" aria-hidden="true" />} isWinner={scorecard.winner === 'user'} topScoreLabel={t('sparring.scorecard.topScore', 'Top score')} />
              <ScoreTotal label={t('sparring.scorecard.opponentScore', 'Opponent score')} score={scorecard.aiScore} icon={<OwlAvatar pose="skeptical" size={22} />} isWinner={scorecard.winner === 'ai'} topScoreLabel={t('sparring.scorecard.topScore', 'Top score')} />
            </div>
            <div className="mt-7 rounded-lg border-2 border-border bg-surface-sunken/60 p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('sparring.scorecard.verdict', "Judge's verdict")}</p>
              <p className="mt-2 text-base leading-7 text-foreground">{scorecard.verdict}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />{t('sparring.scorecard.categoryBalance', 'Category balance')}</CardTitle>
            <CardDescription>{t('sparring.scorecard.categoryDescription', 'Each category is scored out of 25.')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[270px] w-full" aria-label={t('sparring.scorecard.radarLabel', 'Radar chart comparing category scores')}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Radar name={t('sparring.user', 'You')} dataKey="You" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.22} />
                  <Radar name={t('sparring.opponent', 'Opponent')} dataKey="Opponent" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--foreground))' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-xs text-muted-foreground">{t('sparring.scorecard.radarNote', 'Visual summary only. Read the text scores below for the full feedback.')}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('sparring.scorecard.categoryNotes', 'Category notes')}</CardTitle>
          <CardDescription>{spokenRound ? t('voiceRound.scorecard.categoryNotesDescription') : t('sparring.scorecard.categoryNotesDescription', 'Specific reasons behind every score. Delivery is judged from the written speech, not audio.')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {scorecard.categories.map((category) => (
            <article key={category.name} className="rounded-xl border border-border/70 bg-background p-4 sm:p-5" aria-labelledby={`category-${category.name}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={`category-${category.name}`} className="font-semibold">{t(`sparring.category.${category.name}`, category.name)}{category.name === 'Delivery' && <span className="ml-2 text-xs font-normal text-muted-foreground">{spokenRound ? t('voiceRound.scorecard.measuredOnly') : t('sparring.scorecard.writtenOnly', 'written only')}</span>}</h3>
                  <p className="sr-only">{t('sparring.scorecard.accessibleCategoryScore', 'Your score {{user}} out of 25. Opponent score {{opponent}} out of 25.', { user: category.userScore, opponent: category.aiScore })}</p>
                </div>
                <div className="flex items-center gap-2 font-mono text-sm tabular-nums" aria-hidden="true">
                  <span className="text-primary">{category.userScore}</span><span className="text-muted-foreground">/25</span><span className="text-border">·</span><span className="text-muted-foreground">{category.aiScore}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2" aria-hidden="true">
                <div className="flex items-center gap-2"><span className="w-12 text-xs text-muted-foreground">{t('sparring.user', 'You')}</span><div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(category.userScore / 25) * 100}%` }} /></div></div>
                <div className="flex items-center gap-2"><span className="w-12 text-xs text-muted-foreground">{t('sparring.scorecard.aiShort', 'AI')}</span><div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${(category.aiScore / 25) * 100}%` }} /></div></div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{category.feedback}</p>
            </article>
          ))}
        </CardContent>
      </Card>

      {spokenRound && (
        <Card data-testid="spoken-delivery">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><Mic className="h-5 w-5 text-primary" aria-hidden="true" />{t('voiceRound.delivery.title')}</CardTitle>
            <CardDescription>{t('voiceRound.delivery.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {spokenSpeeches.map((speech) => (
              <section key={speech.id} aria-label={t(`sparring.turns.${speech.turnId}`, speech.role)}>
                <h3 className="mb-2 text-sm font-semibold">{t(`sparring.turns.${speech.turnId}`, speech.role)}</h3>
                <DeliveryFacts delivery={speech.delivery!} timeLimitSeconds={speech.timeLimitSeconds} />
              </section>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-5 md:grid-cols-2">
        <InsightCard title={t('sparring.scorecard.keyMoments', 'Key moments')} icon={<Sparkles className="h-5 w-5" aria-hidden="true" />} items={scorecard.keyMoments} tone="primary" emptyLabel={t('sparring.scorecard.noKeyMoments', 'No key moments were recorded.')} />
        <InsightCard title={t('sparring.scorecard.workOnNext', 'Work on next')} icon={<Target className="h-5 w-5" aria-hidden="true" />} items={scorecard.improvementAreas} tone="amber" emptyLabel={t('sparring.scorecard.noImprovementAreas', 'No improvement areas were recorded.')} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />{t('sparring.scorecard.overallFeedback', 'Overall feedback')}</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert"><Markdown>{scorecard.overallFeedback}</Markdown></CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-primary" aria-hidden="true" />{t('sparring.scorecard.fullTranscript', 'Full transcript')}</CardTitle>
            <CardDescription className="mt-1">{t('sparring.scorecard.transcriptDescription', '{{count}} speeches from this {{format}} round.', { count: session.speeches.length, format: formatLabel })}</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setTranscriptOpen((open) => !open)} aria-expanded={transcriptOpen}>{transcriptOpen ? t('sparring.scorecard.hideTranscript', 'Hide transcript') : t('sparring.scorecard.showTranscript', 'Show transcript')}</Button>
        </CardHeader>
        {transcriptOpen && (
          <CardContent className="space-y-4 border-t border-border/60 pt-6">
            {session.speeches.map((speech) => (
              <article key={speech.id} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><span className={cn('flex h-7 w-7 items-center justify-center rounded-md', speech.speaker === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted')} aria-hidden="true">{speech.speaker === 'user' ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>{speech.speaker === 'user' ? t('sparring.user', 'You') : t('sparring.opponent', 'AI opponent')} <span className="font-normal text-muted-foreground">· {t(`sparring.turns.${speech.turnId}`, speech.role)}</span></div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{speech.speaker === 'ai' ? t('sparring.round.estimatedTimeUsed', '{{time}} estimated', { time: formatRoundTime(speech.timeUsedSeconds) }) : t('sparring.round.timeUsed', '{{time}} used', { time: formatRoundTime(speech.timeUsedSeconds) })}</span>
                </div>
                <div className="mt-3 text-sm leading-7"><Markdown>{speech.content}</Markdown></div>
              </article>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ScoreTotal({ label, score, icon, isWinner, topScoreLabel }: { label: string; score: number; icon: React.ReactNode; isWinner: boolean; topScoreLabel: string }) {
  return (
    <div className={cn('rounded-lg border-2 p-4', isWinner ? 'border-brand bg-brand-tint shadow-[0_4px_0_var(--do-primary-tint-border)]' : 'border-border bg-card')}>
      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">{icon}{label}{isWinner && <span className="ml-auto text-xs font-extrabold text-primary">{topScoreLabel}</span>}</div>
      <p className="mt-2 font-display text-5xl font-[600] tracking-[-0.02em] text-heading tabular-nums">{score}<span className="ml-1 text-lg font-normal text-muted-foreground">/100</span></p>
    </div>
  );
}

function InsightCard({ title, icon, items, tone, emptyLabel }: { title: string; icon: React.ReactNode; items: string[]; tone: 'primary' | 'amber'; emptyLabel: string }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-xl">{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-3">
            {items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'primary' ? 'bg-brand' : 'bg-warning')} aria-hidden="true" />{item}</li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
      </CardContent>
    </Card>
  );
}
