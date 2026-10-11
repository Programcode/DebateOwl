import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { AlertCircle, Bot, Check, ChevronRight, CirclePause, CirclePlay, Clock3, CloudOff, Loader2, RotateCcw, Send, UserRound, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { formatRoundTime, type SparringTurnKind } from '@/lib/sparring/formats';
import type { SparringSession } from '@/lib/stores/sparring-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useSpeechCapture } from '@/hooks/use-speech-capture';
import { VoiceMicControl } from '@/components/features/voice/VoiceMicControl';
import { measureDelivery, type SpeechDelivery } from '@/lib/voice/delivery';
import { opponentVoice } from '@/lib/voice/opponent-voice';
import type { AppLanguage } from '@/lib/languages';
import { ClockAnnouncer, RoundClock, clockTone } from '@/components/features/practice/RoundClock';

const MAX_SPEECH_CHARS = 6_000;

interface SparringRoundProps {
  session: SparringSession;
  /** The student speaks this round; the language is the one they speak in. */
  voice?: { language: AppLanguage } | null;
  aiLoading?: boolean;
  aiError?: string | null;
  judging?: boolean;
  judgingError?: string | null;
  submissionError?: string | null;
  onSubmit: (content: string, delivery?: SpeechDelivery | null) => void;
  onRetryAi?: () => void;
  onRetryJudging?: () => void;
}

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const SCHOOL_ROLE_GUIDANCE: Partial<Record<SparringTurnKind, string>> = {
  introductor: 'Open with an exordio, define the key terms, set the framework and thesis, then give the roadmap. Save the full arguments for R1.',
  r1: 'Build the core arguments with claims, warrants, support, and impacts. Use the final part to anticipate or answer the strongest opposition.',
  r2: 'Extend R1, answer the opponent directly, identify the central clashes, and compare the impacts. Do not simply repeat the case.',
  conclusor: 'Add no new arguments. Crystallize the decisive clashes, weigh the round, and close with the reason your side wins.',
};

export function SparringRound({
  session,
  voice = null,
  aiLoading = false,
  aiError,
  judging = false,
  judgingError,
  submissionError,
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
  const isOnline = useOnlineStatus();
  const currentTurn = session.turns[session.currentTurnIndex];
  const currentWordCount = wordCount(session.draft);
  const totalWords = useMemo(() => session.speeches.reduce((sum, speech) => sum + wordCount(speech.content), 0), [session.speeches]);
  const userTurn = currentTurn?.speaker === 'user';
  const roleGuidance = currentTurn && SCHOOL_ROLE_GUIDANCE[currentTurn.kind]
    ? t(`sparring.roleGuidance.${currentTurn.kind}`, SCHOOL_ROLE_GUIDANCE[currentTurn.kind])
    : t('sparring.round.yourSpeechDescription', 'Make the case in the time you have. The opponent will respond to this text.');
  const timerProgress = currentTurn?.timeLimitSeconds ? Math.max(0, Math.min(100, (session.timerRemainingSeconds / currentTurn.timeLimitSeconds) * 100)) : 0;
  const tone = clockTone(session.timerRemainingSeconds);
  const isUrgent = tone === 'warning';
  const latestOpponentSpeech = session.speeches.at(-1)?.speaker === 'ai' ? session.speeches.at(-1) : undefined;
  const timeExpired = session.timerRemainingSeconds <= 0
    || (session.timerDeadline !== null && session.timerDeadline <= Date.now());

  useEffect(() => {
    if (!userTurn || !session.timerRunning) return;
    const intervalId = window.setInterval(() => tickTimer(), 250);
    return () => window.clearInterval(intervalId);
  }, [session.timerRunning, tickTimer, userTurn]);

  // Recognised words join the draft, so the student can see and fix them.
  const capture = useSpeechCapture(voice?.language ?? 'en', (text) => {
    const draft = useSparringStore.getState().currentSession?.draft ?? '';
    setDraft(`${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${text}`.slice(0, MAX_SPEECH_CHARS));
  });
  const { listening, stop: stopCapture, cancel: cancelCapture } = capture;
  const turnKey = `${session.id}:${currentTurn?.id ?? ''}`;

  // Each turn of each round is measured on its own, and a microphone start
  // still waiting for permission does not carry over into the next turn.
  useEffect(() => cancelCapture, [cancelCapture, turnKey]);

  // The microphone closes when the student's time or turn is over.
  const micAllowed = userTurn && !judging && !timeExpired;
  useEffect(() => {
    if (!micAllowed) void stopCapture();
  }, [micAllowed, stopCapture]);

  const startSpeaking = () => {
    // Speaking over the opponent ends its audio, and the clock runs again.
    opponentVoice.stop();
    resumeTimer();
    void capture.start();
  };

  const submitSpeech = async () => {
    // Stopping also withdraws a start that is still waiting for permission.
    if (listening) await stopCapture();
    else void stopCapture();
    const draft = useSparringStore.getState().currentSession?.draft ?? '';
    if (!draft.trim()) return;
    onSubmit(draft, voice ? measureDelivery(capture.getTake(), voice.language) : null);
  };
  const canSubmit = (Boolean(session.draft.trim()) || listening) && isOnline && !timeExpired;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (userTurn && !judging && canSubmit) void submitSpeech();
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <Badge variant="outline" className="rounded-md">{t(`sparring.format.${session.format}`, session.format.toUpperCase())}</Badge>
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
                <div className="flex items-center gap-2 text-3xl">
                  <Clock3 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  {judging
                    ? <span className="font-semibold tabular-nums text-muted-foreground" aria-label={t('sparring.round.noTimer', 'No timer while judging')}>--:--</span>
                    : <RoundClock secondsLeft={session.timerRemainingSeconds} label={t('sparring.round.timeRemaining', '{{time}} remaining', { time: formatRoundTime(session.timerRemainingSeconds) })} />}
                  {!judging && <ClockAnnouncer secondsLeft={session.timerRemainingSeconds} running={session.timerRunning} />}
                </div>
              </div>
              <Progress value={judging ? 0 : timerProgress} className={cn('mt-5 h-2', tone === 'over' ? '[&>div]:bg-destructive' : isUrgent ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary')} aria-label={t('sparring.round.timeRemaining', 'Time remaining')} />
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
                    <Loader2 className="h-7 w-7 animate-spin text-primary [animation-duration:700ms]" aria-hidden="true" />
                    <h2 className="mt-5 text-lg font-semibold">{t('sparring.round.judgeWeighing', 'Judge is weighing the round')}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t('sparring.round.judgeDescription', 'Reading the claims, responses, and strategic choices. This usually takes one request.')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {userTurn && latestOpponentSpeech && (
                // What you're answering stays in view above the composer, not below it in the transcript.
                <article className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="sparring-latest-opponent">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h2 id="sparring-latest-opponent" className="text-sm font-semibold">{t('sparring.round.latestOpponent', 'Opponent’s last speech')}</h2>
                    <span className="truncate text-xs text-muted-foreground">{t(`sparring.turns.${latestOpponentSpeech.turnId}`, latestOpponentSpeech.role)}</span>
                  </div>
                  <div className="mt-3 max-h-60 overflow-y-auto text-sm leading-7 text-foreground/90"><Markdown>{latestOpponentSpeech.content}</Markdown></div>
                </article>
              )}
              {userTurn ? (
                <Card className="border-primary/30 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5 text-primary" aria-hidden="true" /> {t('sparring.round.yourSpeech', 'Your speech')}</CardTitle>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{roleGuidance}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-md font-mono text-xs tabular-nums">{t('sparring.round.wordCount', '{{count}} words', { count: currentWordCount })}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {voice && <VoiceMicControl capture={capture} onStart={startSpeaking} onStop={() => void stopCapture()} disabled={timeExpired} />}
                    <Textarea
                      value={session.draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={voice ? t('voiceRound.mic.draftPlaceholder') : t('sparring.round.speechPlaceholder', 'Build your claim, warrant, and impact…')}
                      className="min-h-[240px] resize-y text-base leading-7"
                      maxLength={MAX_SPEECH_CHARS}
                      aria-label={t('sparring.round.draftFor', 'Draft for {{label}}', { label: t(`sparring.turns.${currentTurn.id}`, currentTurn.label) })}
                      disabled={judging}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">{isOnline ? <span className="pointer-coarse:hidden"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">⌘</kbd> {t('common.or')} <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> {t('sparring.round.toSubmit', 'to submit')}</span> : t('sparring.round.offlineCannotSubmit', 'Reconnect to submit this speech.')}</p>
                      <Button type="button" onClick={() => void submitSpeech()} disabled={!canSubmit} className="sm:min-w-36">
                        {t('sparring.round.submitSpeech', 'Submit speech')} <Send className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {timeExpired && <p className="text-sm text-destructive" role="alert">{t('sparring.round.timeExpired', 'This speaking time has ended. Reset the turn to continue.')}</p>}
                    {!timeExpired && submissionError && <p className="text-sm text-destructive" role="alert">{submissionError}</p>}
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
                        {/* One indicator: a spinner while the opponent works, its icon otherwise. */}
                        {aiLoading
                          ? <Loader2 className="h-7 w-7 animate-spin text-primary [animation-duration:700ms]" aria-hidden="true" />
                          : <Bot className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
                        <h2 className="mt-5 text-lg font-semibold">{aiLoading ? t('sparring.round.opponentThinking', 'Opponent is thinking') : t('sparring.round.opponentUpNext', 'Opponent is up next')}</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{aiLoading ? t('sparring.round.opponentThinkingDescription', 'It is reading the motion and your speeches before choosing a response.') : t('sparring.round.opponentUpNextDescription', 'The next response will appear here.')}</p>
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
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-mono tabular-nums', complete ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
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
