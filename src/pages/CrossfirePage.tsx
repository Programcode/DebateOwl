import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BookOpen,
  Check,
  Clock3,
  Flame,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { crossfire, AIResponseError, isTimeoutError } from '@/lib/ai/client';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import {
  canEndCrossfireSession,
  createCrossfireSetupState,
  crossfireReducer,
  expectedUserTurnKind,
} from '@/lib/crossfire/reducer';
import {
  CrossfireConfigSchema,
  CrossfirePrefillSchema,
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_RESOLUTION_CHARS,
  MAX_CROSSFIRE_TURN_CHARS,
  type CrossfireDebrief,
  type CrossfirePrefill,
  type CrossfireState,
  type CrossfireTurn,
} from '@/lib/crossfire/schemas';
import {
  clearCrossfireDraft,
  loadCrossfireDraft,
  saveCrossfireDraft,
} from '@/lib/crossfire/storage';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { cn } from '@/lib/utils';

const SESSION_ID_PREFIX = 'crossfire';

function routePrefill(value: unknown): CrossfirePrefill | undefined {
  const parsed = CrossfirePrefillSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function restoreState(userId: string | undefined, prefill: CrossfirePrefill | undefined): CrossfireState {
  const restored = userId ? loadCrossfireDraft(userId) : null;
  if (restored?.phase === 'active') {
    return restored.request.status === 'pending'
      ? {
          ...restored,
          request: {
            status: 'failed',
            expectedReply: restored.request.expectedReply,
            errorKind: 'request',
            message: 'crossfire.interruptedRequest',
          },
        }
      : restored;
  }
  if (restored?.phase === 'debriefing') {
    return restored.requestStatus === 'pending'
      ? {
          ...restored,
          requestStatus: 'failed',
          errorKind: 'request',
          errorMessage: 'crossfire.interruptedDebrief',
        }
      : restored;
  }
  return createCrossfireSetupState(prefill ?? (restored?.phase === 'setup' ? {
    resolution: restored.config.resolution,
    argument: restored.config.argument,
    seedQuestions: restored.config.seedQuestions,
  } : undefined));
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function handleRadioKeys<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  current: T,
  testIdPrefix: string,
  onChange: (value: T) => void,
): void {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !backward && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const currentIndex = values.indexOf(current);
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? values.length - 1
      : (currentIndex + (forward ? 1 : -1) + values.length) % values.length;
  const next = values[nextIndex];
  onChange(next);
  event.currentTarget.parentElement
    ?.querySelector<HTMLElement>(`[data-testid="${testIdPrefix}-${next}"]`)
    ?.focus();
}

function classifyError(error: unknown): {
  kind: 'timeout' | 'response' | 'request';
  message: string;
} {
  if (isTimeoutError(error)) return { kind: 'timeout', message: error.message };
  if (error instanceof AIResponseError) return { kind: 'response', message: error.message };
  return { kind: 'request', message: getUserFacingAIError(error) };
}

function nextTurn(sequence: number, speaker: 'user' | 'ai', kind: 'question' | 'answer', text: string): CrossfireTurn {
  return {
    id: `T${sequence}`,
    sequence,
    speaker,
    kind,
    text: text.trim(),
    createdAt: Date.now(),
  };
}

interface ReferenceItem {
  turnIds: string[];
  claim: string;
}

function TurnReferences({ turnIds }: { turnIds: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5" aria-label="Transcript references">
      {turnIds.map((turnId) => (
        <a
          key={turnId}
          href={`#crossfire-turn-${turnId}`}
          className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {turnId}
        </a>
      ))}
    </span>
  );
}

function DebriefSection({ title, items, emptyLabel }: { title: string; items: ReferenceItem[]; emptyLabel: string }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item.turnIds.join('-')}-${index}`} className="space-y-2 rounded-lg border border-border/70 bg-card p-4">
              <p className="text-sm leading-relaxed text-foreground">{item.claim}</p>
              <TurnReferences turnIds={item.turnIds} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CrossfireDebriefView({ debrief, onRestart }: { debrief: CrossfireDebrief; onRestart: () => void }) {
  const { t } = useTranslation();
  const empty = t('crossfire.noGroundedFinding', 'No grounded finding in this transcript.');
  return (
    <div data-testid="crossfire-debrief" className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('crossfire.debriefTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('crossfire.debriefSubtitle')}</p>
        </div>
        <Button data-testid="new-crossfire" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('crossfire.restart')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DebriefSection title={t('crossfire.concessionsSecured')} items={debrief.concessionsSecured} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.controlledQuestions')} items={debrief.controlledQuestions} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.weakOrRepetitiveQuestions')} items={debrief.weakOrRepetitiveQuestions} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.evasiveOrIncompleteAnswers')} items={debrief.evasiveOrIncompleteAnswers} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.missedFollowUps')} items={debrief.missedFollowUps} emptyLabel={empty} />
        <section className="space-y-3" aria-label={t('crossfire.betterFollowUpQuestions')}>
          <h3 className="text-base font-semibold">{t('crossfire.betterFollowUpQuestions')}</h3>
          {debrief.betterFollowUpQuestions.length === 0 ? (
            <p className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="space-y-2">
              {debrief.betterFollowUpQuestions.map((item, index) => (
                <li key={`${item.turnIds.join('-')}-${index}`} className="space-y-2 rounded-lg border border-border/70 bg-card p-4">
                  <p className="font-medium text-foreground">{item.question}</p>
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                  <TurnReferences turnIds={item.turnIds} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-primary/25 bg-primary/5 p-5" aria-label={t('crossfire.strongestExchange')}>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{t('crossfire.strongestExchange')}</h3>
        </div>
        {debrief.strongestExchange ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{debrief.strongestExchange.claim}</p>
            <TurnReferences turnIds={debrief.strongestExchange.turnIds} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </section>
    </div>
  );
}

export default function CrossfirePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const importedPrefill = useMemo(() => routePrefill(location.state), [location.state]);
  const [state, dispatch] = useReducer(
    crossfireReducer,
    undefined,
    () => restoreState(user?.id, importedPrefill),
  );
  const previousPhaseRef = useRef(state.phase);
  const phaseChanged = previousPhaseRef.current !== state.phase;
  useEffect(() => {
    previousPhaseRef.current = state.phase;
  }, [state.phase]);
  const stateMotionClass = phaseChanged ? 'motion-swap' : undefined;
  const [draftTurn, setDraftTurn] = useState('');
  const [now, setNow] = useState(Date.now());
  const [formError, setFormError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [stateOwnerId, setStateOwnerId] = useState(user?.id);
  const requestRef = useRef<AbortController | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const activeSourceCount = useSessionStore((session) => session.sourceLibrary.filter((source) => source.isActive).length);
  const { getFeatureConfig } = useSettingsStore();
  const modelConfig = getFeatureConfig('ask');

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (stateOwnerId === user?.id) return;
    requestRef.current?.abort();
    dispatch({ type: 'state-restored', state: restoreState(user?.id, undefined) });
    setStateOwnerId(user?.id);
    setDraftTurn('');
    setFormError('');
  }, [stateOwnerId, user?.id]);

  useEffect(() => {
    if (!user?.id || stateOwnerId !== user.id) return;
    const saved = saveCrossfireDraft(user.id, state);
    setStorageError(!saved && state.phase !== 'complete');
  }, [state, stateOwnerId, user?.id]);

  useEffect(() => {
    if (state.phase !== 'active') return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [state.phase]);

  const runNextTurn = useCallback(async (
    snapshot: Extract<CrossfireState, { phase: 'active' }>,
    expectedReply: 'question' | 'answer',
  ) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await crossfire({
        operation: 'next-turn',
        config: snapshot.config,
        transcript: snapshot.turns,
        expectedReply,
      }, modelConfig, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!('type' in result)) {
        dispatch({
          type: 'request-failed',
          expectedReply,
          errorKind: 'response',
          message: 'crossfire.invalidResponseDesc',
        });
        return;
      }
      dispatch({
        type: 'ai-turn-received',
        turn: nextTurn(snapshot.turns.length + 1, 'ai', result.type, result.text),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const classified = classifyError(error);
      dispatch({ type: 'request-failed', expectedReply, errorKind: classified.kind, message: classified.message });
    }
  }, [modelConfig]);

  const runDebrief = useCallback(async (snapshot: Extract<CrossfireState, { phase: 'debriefing' }>) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await crossfire({
        operation: 'debrief',
        config: snapshot.config,
        transcript: snapshot.turns,
      }, modelConfig, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if ('type' in result) {
        dispatch({
          type: 'debrief-failed',
          errorKind: 'response',
          message: 'crossfire.invalidDebriefResponseDesc',
        });
        return;
      }
      dispatch({ type: 'debrief-received', debrief: result });
    } catch (error) {
      if (controller.signal.aborted) return;
      const classified = classifyError(error);
      dispatch({ type: 'debrief-failed', errorKind: classified.kind, message: classified.message });
    }
  }, [modelConfig]);

  const endSession = useCallback((reason: 'manual' | 'timer') => {
    if (state.phase !== 'active') return;
    requestRef.current?.abort();
    if (state.turns.length === 0) {
      dispatch({
        type: 'session-reset',
        prefill: {
          resolution: state.config.resolution,
          argument: state.config.argument,
          seedQuestions: state.config.seedQuestions,
        },
      });
      setFormError(t('crossfire.debriefEmptyDesc'));
      return;
    }
    const next = crossfireReducer(state, { type: 'session-ended', now: Date.now(), reason });
    dispatch({ type: 'session-ended', now: next.phase === 'debriefing' ? next.endedAt : Date.now(), reason });
    if (next.phase === 'debriefing') void runDebrief(next);
  }, [runDebrief, state, t]);

  useEffect(() => {
    if (state.phase === 'active' && now >= state.endsAt) endSession('timer');
  }, [endSession, now, state]);

  const startSession = () => {
    if (state.phase !== 'setup') return;
    const parsed = CrossfireConfigSchema.safeParse(state.config);
    if (!parsed.success) {
      setFormError(t('crossfire.validationError', 'Enter a resolution and argument before starting.'));
      return;
    }
    setFormError('');
    const action = {
      type: 'session-started' as const,
      sessionId: `${SESSION_ID_PREFIX}-${Date.now()}`,
      now: Date.now(),
    };
    const next = crossfireReducer(state, action);
    dispatch(action);
    if (next.phase === 'active' && next.request.status === 'pending') {
      void runNextTurn(next, next.request.expectedReply);
    }
  };

  const submitTurn = () => {
    if (state.phase !== 'active') return;
    const kind = expectedUserTurnKind(state);
    const text = draftTurn.trim();
    if (!kind || !text || text.length > MAX_CROSSFIRE_TURN_CHARS) return;
    const expectedReply: 'question' | 'answer' = kind === 'question' ? 'answer' : 'question';
    const action = {
      type: 'user-turn-submitted' as const,
      turn: nextTurn(state.turns.length + 1, 'user', kind, text),
      expectedReply,
    };
    const next = crossfireReducer(state, action);
    dispatch(action);
    setDraftTurn('');
    if (next.phase === 'active') void runNextTurn(next, expectedReply);
  };

  const retryTurn = () => {
    if (state.phase !== 'active' || state.request.status !== 'failed') return;
    const expectedReply = state.request.expectedReply;
    const next = crossfireReducer(state, { type: 'request-retried' });
    dispatch({ type: 'request-retried' });
    if (next.phase === 'active') void runNextTurn(next, expectedReply);
  };

  const retryDebrief = () => {
    if (state.phase !== 'debriefing' || state.requestStatus !== 'failed') return;
    const next = crossfireReducer(state, { type: 'debrief-retried' });
    dispatch({ type: 'debrief-retried' });
    if (next.phase === 'debriefing') void runDebrief(next);
  };

  const restart = () => {
    requestRef.current?.abort();
    if (user?.id) clearCrossfireDraft(user.id);
    dispatch({ type: 'session-reset' });
    setDraftTurn('');
    setFormError('');
  };

  if (stateOwnerId !== user?.id) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center px-4 py-8" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" />
        <span className="sr-only">{t('crossfire.loading')}</span>
      </div>
    );
  }

  if (state.phase === 'setup') {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="max-w-2xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Flame className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{t('crossfire.title')}</h1>
          </header>

          {(formError || storageError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('crossfire.error')}</AlertTitle>
              <AlertDescription>{formError || t('crossfire.storageError', 'This browser could not save the unfinished session locally.')}</AlertDescription>
            </Alert>
          )}

          {importedPrefill?.source && (
            <Alert>
              <BookOpen className="h-4 w-4" />
              <AlertTitle>{importedPrefill.source === 'generate' ? t('crossfire.importFromGenerate') : t('crossfire.importFromAttack')}</AlertTitle>
              <AlertDescription>
                {importedPrefill.source === 'generate' ? t('crossfire.importGenerateDesc') : t('crossfire.importAttackDesc')}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('crossfire.setupTitle')}</CardTitle>
              <CardDescription>{t('crossfire.setupDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-7">
              <div className="space-y-2">
                <Label htmlFor="crossfire-resolution">{t('crossfire.resolutionLabel')}</Label>
                <Textarea
                  id="crossfire-resolution"
                  data-testid="crossfire-resolution"
                  value={state.config.resolution}
                  maxLength={MAX_CROSSFIRE_RESOLUTION_CHARS}
                  onChange={(event) => dispatch({ type: 'config-patched', patch: { resolution: event.target.value } })}
                  placeholder={t('crossfire.resolutionPlaceholder')}
                  className="min-h-24 resize-y"
                />
                <p className="text-xs text-muted-foreground">{t('crossfire.resolutionHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crossfire-argument">{t('crossfire.argumentLabel')}</Label>
                <Textarea
                  id="crossfire-argument"
                  data-testid="crossfire-argument"
                  value={state.config.argument}
                  maxLength={MAX_CROSSFIRE_ARGUMENT_CHARS}
                  onChange={(event) => dispatch({ type: 'config-patched', patch: { argument: event.target.value } })}
                  placeholder={t('crossfire.argumentPlaceholder')}
                  className="min-h-48 resize-y"
                />
                <p className="text-xs text-muted-foreground">{t('crossfire.argumentHint')}</p>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('crossfire.modeLabel')}</legend>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                  {(['question-ai', 'ai-questions-user'] as const).map((mode) => {
                    const selected = state.config.mode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-testid={`mode-${mode}`}
                        onClick={() => dispatch({ type: 'config-patched', patch: { mode } })}
                        onKeyDown={(event) => handleRadioKeys(
                          event,
                          ['question-ai', 'ai-questions-user'] as const,
                          state.config.mode,
                          'mode',
                          (nextMode) => dispatch({ type: 'config-patched', patch: { mode: nextMode } }),
                        )}
                        className={cn(
                          'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <span className="flex items-center justify-between gap-3 font-medium">
                          {mode === 'question-ai' ? t('crossfire.modeQuestionAi') : t('crossfire.modeAiQuestionsUser')}
                          {selected && <Check className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {mode === 'question-ai' ? t('crossfire.modeQuestionAiDesc') : t('crossfire.modeAiQuestionsUserDesc')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('crossfire.styleLabel')}</legend>
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
                  {(['cooperative', 'evasive', 'aggressive'] as const).map((style) => {
                    const selected = state.config.style === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-testid={`style-${style}`}
                        onClick={() => dispatch({ type: 'config-patched', patch: { style } })}
                        onKeyDown={(event) => handleRadioKeys(
                          event,
                          ['cooperative', 'evasive', 'aggressive'] as const,
                          state.config.style,
                          'style',
                          (nextStyle) => dispatch({ type: 'config-patched', patch: { style: nextStyle } }),
                        )}
                        className={cn(
                          'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <span className="font-medium">{t(`crossfire.style${style[0].toUpperCase()}${style.slice(1)}`)}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {t(`crossfire.style${style[0].toUpperCase()}${style.slice(1)}Desc`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('crossfire.durationLabel')}</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {([180, 300, 480] as const).map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      role="radio"
                      aria-checked={state.config.durationSeconds === duration}
                      tabIndex={state.config.durationSeconds === duration ? 0 : -1}
                      data-testid={`duration-${duration}`}
                      onClick={() => dispatch({ type: 'config-patched', patch: { durationSeconds: duration } })}
                      onKeyDown={(event) => handleRadioKeys(
                        event,
                        ['180', '300', '480'] as const,
                        String(state.config.durationSeconds) as '180' | '300' | '480',
                        'duration',
                        (nextDuration) => dispatch({
                          type: 'config-patched',
                          patch: { durationSeconds: Number(nextDuration) as 180 | 300 | 480 },
                        }),
                      )}
                      className={cn(
                        'min-h-11 rounded-md border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        state.config.durationSeconds === duration ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                      )}
                    >
                      {t(`crossfire.duration${duration / 60}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {state.config.seedQuestions.length > 0 && (
                <section className="space-y-2" aria-label={t('crossfire.seedQuestionsLabel')}>
                  <h3 className="text-sm font-medium">{t('crossfire.seedQuestionsLabel')}</h3>
                  <ul className="space-y-2 rounded-lg bg-muted/45 p-4 text-sm">
                    {state.config.seedQuestions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}
                  </ul>
                </section>
              )}

              <div className="flex items-start gap-3 rounded-lg border border-border/70 p-4">
                <Checkbox
                  id="source-grounding"
                  data-testid="source-grounding"
                  checked={state.config.useSourceLibrary}
                  onCheckedChange={(checked) => dispatch({ type: 'config-patched', patch: { useSourceLibrary: checked === true } })}
                />
                <div className="space-y-1">
                  <Label htmlFor="source-grounding" className="cursor-pointer">{t('crossfire.sourceLibraryLabel')}</Label>
                  <p className="text-sm text-muted-foreground">{t('crossfire.sourceLibraryDesc')}</p>
                  {activeSourceCount === 0 && <p className="text-xs text-muted-foreground">{t('crossfire.sourceLibraryEmpty')}</p>}
                </div>
              </div>

              <Button data-testid="start-crossfire" size="lg" onClick={startSession} className="w-full sm:w-auto">
                <Flame className="mr-2 h-4 w-4" />
                {t('crossfire.start')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (state.phase === 'complete') {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <div className="mx-auto max-w-5xl space-y-10">
          <CrossfireDebriefView debrief={state.debrief} onRestart={restart} />
          <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} />
        </div>
      </div>
    );
  }

  if (state.phase === 'debriefing') {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <div className="mx-auto max-w-4xl space-y-6">
          <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} />
          <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
              {state.requestStatus === 'pending' ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-primary motion-reduce:animate-none" />
                  <div>
                    <h2 className="font-semibold">{t('crossfire.debriefLoading')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t('crossfire.debriefSubtitle')}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-7 w-7 text-destructive" />
                  <div>
                    <h2 className="font-semibold">{state.errorKind === 'timeout' ? t('crossfire.debriefTimeout') : t('crossfire.debriefError')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(state.errorMessage ?? 'crossfire.errorDesc', { defaultValue: state.errorMessage ?? t('crossfire.errorDesc') })}
                    </p>
                  </div>
                  <Button data-testid="retry-debrief" onClick={retryDebrief}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('crossfire.debriefRetry')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const inputKind = expectedUserTurnKind(state);
  const remaining = state.endsAt - now;
  return (
    <div className={cn(stateMotionClass, 'container px-4 py-6 md:py-8')}>
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{state.config.mode === 'question-ai' ? t('crossfire.modeQuestionAi') : t('crossfire.modeAiQuestionsUser')}</Badge>
              <Badge variant="secondary">{t(`crossfire.style${state.config.style[0].toUpperCase()}${state.config.style.slice(1)}`)}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">{t('crossfire.title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-card px-4 py-2 text-center" role="timer" aria-label={t('crossfire.timerLabel')}>
              <span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{t('crossfire.timerLabel')}</span>
              <span className="mt-0.5 block font-mono text-xl font-semibold tabular-nums">{formatRemaining(remaining)}</span>
            </div>
            <Button data-testid="end-crossfire" variant="outline" disabled={!canEndCrossfireSession(state)} onClick={() => endSession('manual')}>
              {t('crossfire.endSession')}
            </Button>
          </div>
        </header>

        <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} />

        {state.request.status === 'failed' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{state.request.errorKind === 'timeout' ? t('crossfire.timeout') : state.request.errorKind === 'response' ? t('crossfire.invalidResponse') : t('crossfire.error')}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                {state.request.errorKind === 'timeout'
                  ? t('crossfire.timeoutDesc')
                  : t(state.request.message, { defaultValue: state.request.message })}
              </p>
              <Button data-testid="retry-ai" size="sm" variant="outline" onClick={retryTurn}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('crossfire.retryResponse')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {state.request.status === 'pending' && (
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
            {t('crossfire.thinking')}
          </div>
        )}

        {inputKind && (
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Label htmlFor="crossfire-input">{inputKind === 'question' ? t('crossfire.questionLabel') : t('crossfire.answerLabel')}</Label>
              <Textarea
                id="crossfire-input"
                data-testid="crossfire-input"
                value={draftTurn}
                maxLength={MAX_CROSSFIRE_TURN_CHARS}
                onChange={(event) => setDraftTurn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitTurn();
                  }
                }}
                placeholder={inputKind === 'question' ? t('crossfire.questionPlaceholder') : t('crossfire.answerPlaceholder')}
                className="min-h-28 resize-y"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">{t('crossfire.charactersRemaining', { count: MAX_CROSSFIRE_TURN_CHARS - draftTurn.length })}</span>
                <Button data-testid="submit-turn" onClick={submitTurn} disabled={!draftTurn.trim()}>
                  <Send className="mr-2 h-4 w-4" />
                  {inputKind === 'question' ? t('crossfire.submitQuestion') : t('crossfire.submitAnswer')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Transcript({ turns, reduceMotion }: { turns: CrossfireTurn[]; reduceMotion: boolean | null }) {
  const { t } = useTranslation();
  return (
    <section data-testid="crossfire-transcript" aria-label={t('crossfire.transcript')} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{t('crossfire.transcript')}</h2>
      </div>
      {turns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('crossfire.emptyDesc')}</div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {turns.map((turn) => (
            <motion.article
              key={turn.id}
              id={`crossfire-turn-${turn.id}`}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className={cn(
                'scroll-mt-24 rounded-lg border p-4',
                turn.speaker === 'user' ? 'ml-auto max-w-[92%] border-primary/25 bg-primary/5' : 'mr-auto max-w-[92%] border-border bg-card',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{turn.id}</span>
                <span>{turn.kind === 'question' ? t('crossfire.question') : t('crossfire.answer')}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{turn.text}</p>
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}
