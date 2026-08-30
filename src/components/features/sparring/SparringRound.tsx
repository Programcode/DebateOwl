import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bot, Check, ChevronRight, CirclePause, CirclePlay, Clock3, CloudOff, RotateCcw, Send, UserRound, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { formatRoundTime } from '@/lib/sparring/formats';
import type { SparringSession } from '@/lib/stores/sparring-store';
import { useSparringStore } from '@/lib/stores/sparring-store';

interface SparringRoundProps {
  session: SparringSession;
  aiLoading?: boolean;
  aiError?: string | null;
  judging?: boolean;
  judgingError?: string | null;
  onSubmit: (content: string) => void;
  onRetryAi?: () => void;
  onRetryJudging?: () => void;
}

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function SparringRound({
  session,
  aiLoading = false,
  aiError,
  judging = false,
  judgingError,
  onSubmit,
  onRetryAi,
  onRetryJudging,
}: SparringRoundProps) {
  const { t } = useTranslation();
  const setDraft = useSparringStore((state) => state.setDraft);
  const tickTimer = useSparringStore((state) => state.tickTimer);
  const pauseTimer = useSparringStore((state) => state.pauseTimer);
  const resumeTimer = useSparringStore((state) => state.resumeTimer);
  const resetTurnTimer = useSparringStore((state) => state.resetTurnTimer);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const currentTurn = session.turns[session.currentTurnIndex];
  const currentWordCount = wordCount(session.draft);
  const totalWords = useMemo(() => session.speeches.reduce((sum, speech) => sum + wordCount(speech.content), 0), [session.speeches]);
  const userTurn = currentTurn?.speaker === 'user';
  const timerProgress = currentTurn?.timeLimitSeconds ? Math.max(0, Math.min(100, (session.timerRemainingSeconds / currentTurn.timeLimitSeconds) * 100)) : 0;
  const isUrgent = session.timerRemainingSeconds <= 30 && session.timerRemainingSeconds > 0;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!userTurn || !session.timerRunning) return;
    const intervalId = window.setInterval(() => tickTimer(), 250);
    return () => window.clearInterval(intervalId);
  }, [session.timerRunning, tickTimer, userTurn]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (userTurn && session.draft.trim() && !judging && isOnline) onSubmit(session.draft);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <Badge variant="outline" className="rounded-md">{session.format.toUpperCase()}</Badge>
            <span>{t('sparring.round.inProgress', 'Round in progress')}</span>
            <span aria-hidden="true">·</span>
            <span>{session.userSide === 'pro' ? t('sparring.round.youArePro', 'You are Pro') : t('sparring.round.youAreCon', 'You are Con')}</span>
          </div>
          <h1 className="mt-2 max-w-4xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{session.motion}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground" aria-live="polite">
          {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <CloudOff className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
          <span>{isOnline ? t('sparring.round.connected', 'Connected') : t('sparring.round.offlineDraft', 'Offline. Draft saved locally.')}</span>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          <span className="font-mono tabular-nums">{t('sparring.round.totalWords', '{{count}} words', { count: totalWords })}</span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-5">
          <Card className={cn('overflow-hidden transition-colors duration-300', isUrgent && 'border-amber-500/60')}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{judging ? t('sparring.round.complete', 'Round complete') : currentTurn ? t('sparring.round.turnOf', 'Turn {{current}} of {{total}}', { current: session.currentTurnIndex + 1, total: session.turns.length }) : t('sparring.round.preparingResult', 'Preparing your result')}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{judging ? t('sparring.round.judgeReading', 'The judge is reading the transcript.') : currentTurn ? t(`sparring.turns.${currentTurn.id}`, currentTurn.label) : t('sparring.round.scoring', 'Scoring the round')}</p>
                </div>
                <div className={cn('flex items-center gap-2 font-mono text-3xl font-semibold tabular-nums tracking-tight', isUrgent ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')} aria-label={judging ? t('sparring.round.noTimer', 'No timer while judging') : t('sparring.round.timeRemaining', '{{time}} remaining', { time: formatRoundTime(session.timerRemainingSeconds) })}>
                  <Clock3 className="h-6 w-6" aria-hidden="true" />
                  <span>{judging ? '--:--' : formatRoundTime(session.timerRemainingSeconds)}</span>
                </div>
              </div>
              <Progress value={judging ? 0 : timerProgress} className={cn('mt-5 h-2', isUrgent ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary')} aria-label={t('sparring.round.timeRemaining', 'Time remaining')} />
              {!judging && userTurn && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => session.timerRunning ? pauseTimer() : resumeTimer()} disabled={session.timerRemainingSeconds <= 0}>
                    {session.timerRunning ? <CirclePause className="h-4 w-4" aria-hidden="true" /> : <CirclePlay className="h-4 w-4" aria-hidden="true" />}
                    {session.timerRunning ? t('sparring.round.pauseClock', 'Pause clock') : t('sparring.round.resumeClock', 'Resume clock')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => resetTurnTimer()}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('sparring.round.resetTurn', 'Reset turn')}
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">{t('sparring.round.clockNote', 'The clock uses the saved deadline, not tab focus.')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {judging ? (
          <Card className="border-primary/20 bg-primary/[0.025]" aria-busy={judging && !judgingError}>
              <CardContent className="flex min-h-[240px] flex-col items-center justify-center p-8 text-center">
                {judgingError ? (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertCircle className="h-6 w-6" aria-hidden="true" /></div>
                    <h2 className="mt-4 text-lg font-semibold">{t('sparring.round.scoreFailed', 'Could not score this round')}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{judgingError}</p>
                    <Button type="button" className="mt-5" onClick={onRetryJudging}>{t('sparring.round.retryScoring', 'Try scoring again')}</Button>
                  </>
                ) : (
                  <>
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                      <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/10 motion-reduce:animate-none" />
                      <Bot className="relative h-7 w-7" />
                    </div>
                    <h2 className="mt-5 text-lg font-semibold">{t('sparring.round.judgeWeighing', 'Judge is weighing the round')}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t('sparring.round.judgeDescription', 'Reading the claims, responses, and strategic choices. This usually takes one request.')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {userTurn ? (
                <Card className="border-primary/30 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5 text-primary" aria-hidden="true" /> {t('sparring.round.yourSpeech', 'Your speech')}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{t('sparring.round.yourSpeechDescription', 'Make the case in the time you have. The opponent will respond to this text.')}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-md font-mono text-xs tabular-nums">{t('sparring.round.wordCount', '{{count}} words', { count: currentWordCount })}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={session.draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('sparring.round.speechPlaceholder', 'Build your claim, warrant, and impact…')}
                      className="min-h-[240px] resize-y text-base leading-7"
                      maxLength={6000}
                      aria-label={t('sparring.round.draftFor', 'Draft for {{label}}', { label: t(`sparring.turns.${currentTurn.id}`, currentTurn.label) })}
                      disabled={judging}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">{isOnline ? <><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">⌘</kbd> or <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> {t('sparring.round.toSubmit', 'to submit')}</> : t('sparring.round.offlineCannotSubmit', 'Reconnect to submit this speech.')}</p>
                      <Button type="button" onClick={() => onSubmit(session.draft)} disabled={!session.draft.trim() || !isOnline} className="sm:min-w-36">
                        {t('sparring.round.submitSpeech', 'Submit speech')} <Send className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-primary/20 bg-primary/[0.025]">
                  <CardContent className="flex min-h-[240px] flex-col items-center justify-center p-8 text-center">
                    {aiError ? (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertCircle className="h-6 w-6" aria-hidden="true" /></div>
                        <h2 className="mt-4 text-lg font-semibold">{t('sparring.round.opponentFailed', 'The opponent could not answer')}</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{aiError}</p>
                        <Button type="button" className="mt-5" onClick={onRetryAi} disabled={!isOnline} title={!isOnline ? t('sparring.round.offlineRetry', 'Reconnect before retrying.') : undefined}>{t('sparring.round.retryOpponent', 'Retry opponent turn')}</Button>
                      </>
                    ) : (
                      <>
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground" aria-hidden="true">
                          <span className={cn('absolute inset-0 rounded-2xl bg-primary/10', aiLoading && 'animate-pulse motion-reduce:animate-none')} />
                          <Bot className="relative h-7 w-7" />
                        </div>
                        <h2 className="mt-5 text-lg font-semibold">{aiLoading ? t('sparring.round.opponentThinking', 'Opponent is thinking') : t('sparring.round.opponentUpNext', 'Opponent is up next')}</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{aiLoading ? t('sparring.round.opponentThinkingDescription', 'It is reading the motion and your speeches before choosing a response.') : t('sparring.round.opponentUpNextDescription', 'The next response will appear here.')}</p>
                        {aiLoading && <div className="mt-5 flex items-center gap-1.5" aria-label={t('sparring.round.aiThinking', 'AI is thinking')}><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s] motion-reduce:animate-none" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s] motion-reduce:animate-none" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" /></div>}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <section aria-labelledby="transcript-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 id="transcript-heading" className="text-lg font-semibold">{t('sparring.round.transcript', 'Transcript')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('sparring.round.transcriptDescription', 'Every submitted speech stays here for the judge.')}</p>
              </div>
              <Badge variant="secondary" className="rounded-md">{t('sparring.round.submittedCount', '{{count}} submitted', { count: session.speeches.length })}</Badge>
            </div>
            {session.speeches.length === 0 ? (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="flex min-h-[150px] items-center justify-center p-6 text-center text-sm text-muted-foreground">{t('sparring.round.transcriptEmpty', 'Your first speech will appear here after you submit it.')}</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {session.speeches.map((speech) => (
                  <article key={speech.id} className={cn('rounded-xl border p-4 sm:p-5', speech.speaker === 'user' ? 'border-primary/20 bg-primary/[0.035]' : 'border-border bg-card')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', speech.speaker === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground')}>
                          {speech.speaker === 'user' ? <UserRound className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{speech.speaker === 'user' ? t('sparring.user', 'You') : t('sparring.opponent', 'AI opponent')}</p>
                          <p className="truncate text-xs text-muted-foreground">{t(`sparring.turns.${speech.turnId}`, speech.role)}</p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{speech.speaker === 'ai' ? t('sparring.round.estimatedTimeUsed', '{{time}} estimated', { time: formatRoundTime(speech.timeUsedSeconds) }) : t('sparring.round.timeUsed', '{{time}} used', { time: formatRoundTime(speech.timeUsedSeconds) })}</span>
                    </div>
                    <div className="mt-4 border-t border-border/60 pt-4 text-sm leading-7 text-foreground/90"><Markdown>{speech.content}</Markdown></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>{t('sparring.round.roundPlan', 'Round plan')}</span>
                <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">{Math.min(session.currentTurnIndex + 1, session.turns.length)}/{session.turns.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {session.turns.map((turn, index) => {
                const complete = index < session.currentTurnIndex;
                const current = index === session.currentTurnIndex && session.phase === 'round';
                return (
                  <div key={turn.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', current && 'bg-primary/10 text-foreground', complete && 'text-muted-foreground', !current && !complete && 'text-muted-foreground/70')}>
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-mono tabular-nums', complete ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                      {complete ? <Check className="h-3.5 w-3.5" aria-label={t('sparring.round.completeStatus', 'Complete')} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t(`sparring.turns.${turn.id}`, turn.label)}</span>
                      <span className="block text-xs">{turn.speaker === 'user' ? t('sparring.user', 'You') : t('sparring.opponent', 'AI opponent')} · {formatRoundTime(turn.timeLimitSeconds)}</span>
                    </span>
                    {current && <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
