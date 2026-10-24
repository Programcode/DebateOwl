import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { OwlLoader } from '@/components/ui/loading-spinner';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BookOpen,
  Check,
  Clock3,
  Flame,
  MessageSquare,
  Mic,
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
import { crossfire, crossfireSignal, AIResponseError, isTimeoutError } from '@/lib/ai/client';
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
  CrossfireStateSchema,
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
import { readableLiveText } from '@/lib/voice/live-text';
import { LiveCaret, LiveToolRun } from '@/components/features/tools/live-draft';
import { crossfireDebriefDraftSections } from '@/components/features/tools/live-sections';
import type { LiveRunState } from '@/components/features/tools/tool-run';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { cn } from '@/lib/utils';
import { ClockAnnouncer, RoundClock } from '@/components/features/practice/RoundClock';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { CurrentDebateStrip, useDebateMotionPrefill } from '@/components/features/debate/CurrentDebateStrip';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { useDebateContextStore } from '@/lib/stores/debate-context-store';
import { useDebateMotionGate } from '@/components/features/debate/DebateMotionGate';
import { activeDebateId, sameMotion, selectCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { toast } from '@/hooks/use-toast';
import { saveWorkspaceArtifact } from '@/lib/workspace/practice-client';
import { createArtifactSaveQueue } from '@/lib/workspace/artifact-save-queue';
import { useSpeechCapture } from '@/hooks/use-speech-capture';
import { isAppLanguage } from '@/lib/languages';
import { DeliveryFacts } from '@/components/features/voice/DeliveryFacts';
import { OpponentVoiceBar } from '@/components/features/voice/OpponentVoiceBar';
import { VoiceMicControl } from '@/components/features/voice/VoiceMicControl';
import { VoiceModeToggle } from '@/components/features/voice/VoiceModeToggle';
import { useVoiceAvailability } from '@/lib/voice/availability';
import { combineDelivery, measureDelivery } from '@/lib/voice/delivery';
import { opponentVoice } from '@/lib/voice/opponent-voice';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { DailyUsage, SessionCostNote, SubscriptionErrorModals } from '@/components/features/subscription';
import { useSessionQuota } from '@/hooks/use-session-quota';

const SESSION_ID_PREFIX = 'crossfire';

function routePrefill(value: unknown): CrossfirePrefill | undefined {
  const input = value && typeof value === 'object'
    ? (({ argument, resolution, seedQuestions, source }) => ({ argument, resolution, seedQuestions, source }))(value as Record<string, unknown>)
    : value;
  const parsed = CrossfirePrefillSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function restoreState(userId: string | undefined, prefill: CrossfirePrefill | undefined, fresh = false, resumed?: CrossfireState): CrossfireState {
  const restored = resumed ?? (userId ? loadCrossfireDraft(userId) : null);
  if (fresh && prefill) return createCrossfireSetupState(prefill);
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

/**
 * The live round clock ticks on its own, so the page doesn't re-render twice a second
 * during a round. It calls onExpire once when time runs out.
 */
function CrossfireClock({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt && !firedRef.current) {
        firedRef.current = true;
        expireRef.current();
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1_000));
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2 text-center">
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{t('crossfire.timerLabel')}</span>
      <RoundClock secondsLeft={seconds} label={t('crossfire.timerLabel')} className="mt-0.5 block text-xl" />
      <ClockAnnouncer secondsLeft={seconds} running />
    </div>
  );
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
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5" aria-label={t('crossfire.transcriptReferences')}>
      {turnIds.map((turnId) => (
        <a
          key={turnId}
          href={`#crossfire-turn-${turnId}`}
          className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
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

function CrossfireDebriefView({ debrief, turns, onRestart }: { debrief: CrossfireDebrief; turns: CrossfireTurn[]; onRestart: () => void }) {
  const { t } = useTranslation();
  const empty = t('crossfire.noGroundedFinding', 'No grounded finding in this transcript.');
  // Measured facts from the turns the student spoke aloud; typed rounds have none.
  const spokenDelivery = combineDelivery(turns.flatMap((turn) => turn.delivery ? [turn.delivery] : []));
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

      {spokenDelivery && (
        <section data-testid="spoken-delivery" className="space-y-3 rounded-xl border border-border/70 p-5" aria-label={t('voiceRound.delivery.title')}>
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t('voiceRound.delivery.title')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('voiceRound.delivery.description')}</p>
          <DeliveryFacts delivery={spokenDelivery} />
        </section>
      )}
    </div>
  );
}

export default function CrossfirePage() {
  const workspace = useWorkspaceToolScope('crossfire');
  const { t } = useTranslation();
  const { user } = useAuth();
  const subError = useSubscriptionError();
  const { handleSubscriptionError } = subError;
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceLaunch = (location.state as { workspaceLaunch?: unknown } | null)?.workspaceLaunch === true;
  const workspaceArtifact = CrossfireStateSchema.safeParse((location.state as { workspaceArtifact?: unknown } | null)?.workspaceArtifact).data;
  const importedPrefill = useMemo(() => routePrefill(location.state), [location.state]);
  const [state, dispatch] = useReducer(
    crossfireReducer,
    undefined,
    () => restoreState(user?.id, importedPrefill, workspaceLaunch, workspaceArtifact),
  );

  useEffect(() => {
    if ((!workspaceLaunch && !workspaceArtifact) || !workspace.context) return;
    navigate(location.pathname, { replace: true, state: { workspaceContext: workspace.context } });
  }, [location.pathname, navigate, workspace.context, workspaceArtifact, workspaceLaunch]);
  const previousPhaseRef = useRef(state.phase);
  const phaseChanged = previousPhaseRef.current !== state.phase;
  useEffect(() => {
    previousPhaseRef.current = state.phase;
  }, [state.phase]);
  const stateMotionClass = phaseChanged ? 'motion-swap' : undefined;
  const [draftTurn, setDraftTurn] = useState('');
  // Mirrors of the latest draft and state for the spoken path, which awaits
  // the recogniser's last words before it submits.
  const draftTurnRef = useRef('');
  const setDraft = useCallback((value: string) => {
    draftTurnRef.current = value;
    setDraftTurn(value);
  }, []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [formError, setFormError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [stateOwnerId, setStateOwnerId] = useState(user?.id);
  const requestRef = useRef<AbortController | null>(null);
  // The opponent's turn and the debrief as the model writes them.
  const [liveReply, setLiveReply] = useState('');
  const [liveDebrief, setLiveDebrief] = useState<LiveRunState>({});
  const artifactRequestIdRef = useRef(workspace.context?.requestId ?? crypto.randomUUID());
  // Autosaves fire on every change; the queue keeps an older one from landing last.
  const [saveArtifact] = useState(() => createArtifactSaveQueue(saveWorkspaceArtifact));
  const signalRequestsRef = useRef(new Set<AbortController>());
  const shouldReduceMotion = useReducedMotion();
  const sourceDebateId = useDebateStore((debates) => debates.oneOff ? null : debates.currentDebateId);
  const activeSourceCount = useSessionStore((session) => sourceDebateId
    ? session.sourceLibrary.filter((source) => source.isActive && source.debateId === sourceDebateId).length
    : 0);
  const recordResult = useSessionStore((session) => session.recordResult);
  const debateGate = useDebateMotionGate({ disabled: Boolean(workspace.context) });
  // Debate chosen when the round started; undefined after a reload.
  const debateTargetRef = useRef<string | null | undefined>(undefined);
  // After a reload, a restored round belongs to the Current Debate only when the
  // motions match; otherwise it runs one-off so another debate's sources stay out.
  const roundDebateId = useCallback((resolution: string): string | null => {
    if (debateTargetRef.current !== undefined) return debateTargetRef.current;
    const current = selectCurrentDebate(useDebateStore.getState());
    return sameMotion(current?.motion, resolution) ? activeDebateId() : null;
  }, []);
  useDebateMotionPrefill(
    () => state.phase === 'setup' ? state.config.resolution : undefined,
    (resolution) => dispatch({ type: 'config-patched', patch: { resolution } }),
    Boolean(workspace.context) || state.phase !== 'setup',
  );
  const { getFeatureConfig, outputLanguage } = useSettingsStore();
  const modelConfig = getFeatureConfig('ask');
  // A round costs one use however many turns it takes; the setup says so.
  const sessionQuota = useSessionQuota('crossfire', modelConfig, state.phase === 'setup');
  const [checkingQuota, setCheckingQuota] = useState(false);
  // Names the latest Start; a newer Start, leaving the page, or switching
  // accounts makes an earlier one that is still checking quota stale.
  const startRequestRef = useRef(0);
  const voiceLanguage = isAppLanguage(outputLanguage) ? outputLanguage : 'en';
  const voiceAvailability = useVoiceAvailability();
  // A voice round falls back to typing when the microphone is lost.
  const voiceActive = Boolean(state.voice) && voiceAvailability.available && !workspace.context;
  const capture = useSpeechCapture(voiceLanguage, (text) => {
    const draft = draftTurnRef.current;
    setDraft(`${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${text}`.slice(0, MAX_CROSSFIRE_TURN_CHARS));
  });
  const { listening, stop: stopCapture, cancel: cancelCapture } = capture;
  // A take belongs to one round of one account. Anything said but not sent
  // is dropped when the round or the account changes.
  const captureScope = `${stateOwnerId ?? ''}:${state.phase === 'setup' ? 'setup' : state.sessionId}`;
  useEffect(() => cancelCapture, [cancelCapture, captureScope]);

  const abortSignalRequests = useCallback(() => {
    signalRequestsRef.current.forEach((controller) => controller.abort());
    signalRequestsRef.current.clear();
  }, []);

  useEffect(() => () => {
    startRequestRef.current += 1;
    requestRef.current?.abort();
    abortSignalRequests();
    opponentVoice.stop();
  }, [abortSignalRequests]);

  useEffect(() => {
    if (stateOwnerId === user?.id) return;
    startRequestRef.current += 1;
    setCheckingQuota(false);
    requestRef.current?.abort();
    abortSignalRequests();
    dispatch({ type: 'state-restored', state: restoreState(user?.id, undefined) });
    setStateOwnerId(user?.id);
    setDraft('');
    setFormError('');
  }, [abortSignalRequests, setDraft, stateOwnerId, user?.id]);

  useEffect(() => {
    if (!user?.id || stateOwnerId !== user.id) return;
    const saved = saveCrossfireDraft(user.id, state);
    setStorageError(!saved && state.phase !== 'complete');
  }, [state, stateOwnerId, user?.id]);

  useEffect(() => {
    if (!workspace.context) return;
    saveArtifact({
      documentEpoch: workspace.context.documentEpoch,
      documentId: workspace.context.documentId,
      inputSnapshot: state.phase === 'setup' ? state.config : { config: state.config },
      outputSnapshot: state.phase === 'complete' ? state : undefined,
      progress: state,
      requestId: artifactRequestIdRef.current,
      status: state.phase === 'complete' ? 'complete' : 'progress',
      tool: 'crossfire',
      workspaceId: workspace.context.workspaceId,
    });
  }, [saveArtifact, state, workspace.context]);

  // A round that finishes on this page is recorded in its debate once.
  const recordedPhaseRef = useRef(state.phase);
  useEffect(() => {
    const finishedHere = recordedPhaseRef.current === 'debriefing' && state.phase === 'complete';
    recordedPhaseRef.current = state.phase;
    if (!finishedHere || state.phase !== 'complete' || workspace.context) return;
    const debateId = roundDebateId(state.config.resolution);
    if (!debateId) return;
    void recordResult('crossfire', {
      title: state.config.resolution,
      input: state.config,
      output: { turns: state.turns, debrief: state.debrief, endedReason: state.endedReason },
      debateId,
      side: 'neutral',
    }).catch(() => toast({ title: t('debate.recordFailed', 'Could not save this result to the debate'), variant: 'destructive' }));
  }, [recordResult, roundDebateId, state, t, workspace.context]);


  const runNextTurn = useCallback(async (
    snapshot: Extract<CrossfireState, { phase: 'active' }>,
    expectedReply: 'question' | 'answer',
  ) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLiveReply('');
    const ownsRequest = () => requestRef.current === controller && !controller.signal.aborted;
    try {
      const result = await crossfire({
        operation: 'next-turn',
        config: snapshot.config,
        transcript: snapshot.turns,
        expectedReply,
      }, modelConfig, {
        signal: controller.signal,
        workspaceContext: workspace.context ?? undefined,
        debateId: workspace.context ? undefined : roundDebateId(snapshot.config.resolution),
        quotaSession: snapshot.sessionId,
        voice: voiceActive,
        live: {
          onDraft: (draft) => {
            if (ownsRequest()) setLiveReply(typeof draft.text === 'string' ? readableLiveText(draft.text) : '');
          },
        },
      });
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
      const reply = { type: result.type, text: result.text };
      dispatch({
        type: 'ai-turn-received',
        turn: nextTurn(snapshot.turns.length + 1, 'ai', result.type, result.text),
      });
      if (voiceActive) opponentVoice.speak({ feature: 'crossfire', text: result.text, voice: result.voice, language: voiceLanguage });
      if (result.signalToken) {
        const signalController = new AbortController();
        signalRequestsRef.current.add(signalController);
        void crossfireSignal({
          config: snapshot.config,
          transcript: snapshot.turns,
          reply,
          signalToken: result.signalToken,
        }, modelConfig, { signal: signalController.signal })
          .then((signal) => {
            if (signal && !signalController.signal.aborted) dispatch({ type: 'signal-received', signal });
          })
          .catch((): void => {})
          .finally(() => signalRequestsRef.current.delete(signalController));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      // Out of requests or not allowed this model: the same dialog every tool uses.
      if (handleSubscriptionError(error) && snapshot.turns.length === 0) {
        // Nothing was exchanged, so the round never really started: no clock, back to setup.
        opponentVoice.stop();
        useDebateContextStore.getState().resetOverride('crossfire');
        dispatch({
          type: 'session-reset',
          prefill: {
            resolution: snapshot.config.resolution,
            argument: snapshot.config.argument,
            seedQuestions: snapshot.config.seedQuestions,
          },
        });
        return;
      }
      const classified = classifyError(error);
      dispatch({ type: 'request-failed', expectedReply, errorKind: classified.kind, message: classified.message });
    } finally {
      if (requestRef.current === controller) setLiveReply('');
    }
  }, [handleSubscriptionError, modelConfig, roundDebateId, voiceActive, voiceLanguage, workspace.context]);

  const runDebrief = useCallback(async (snapshot: Extract<CrossfireState, { phase: 'debriefing' }>) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLiveDebrief({});
    const ownsRequest = () => requestRef.current === controller && !controller.signal.aborted;
    try {
      const result = await crossfire({
        operation: 'debrief',
        config: snapshot.config,
        transcript: snapshot.turns,
      }, modelConfig, {
        signal: controller.signal,
        workspaceContext: workspace.context ?? undefined,
        debateId: workspace.context ? undefined : roundDebateId(snapshot.config.resolution),
        quotaSession: snapshot.sessionId,
        live: {
          onDraft: (draft) => {
            if (ownsRequest()) setLiveDebrief({ phase: 'writing', draft });
          },
        },
      });
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
      // The same limit dialog as a turn; the inline error stays so the debrief can be retried.
      handleSubscriptionError(error);
      const classified = classifyError(error);
      dispatch({ type: 'debrief-failed', errorKind: classified.kind, message: classified.message });
    } finally {
      if (requestRef.current === controller) setLiveDebrief({});
    }
  }, [handleSubscriptionError, modelConfig, roundDebateId, workspace.context]);

  const endSession = useCallback((reason: 'manual' | 'timer') => {
    if (state.phase !== 'active') return;
    requestRef.current?.abort();
    opponentVoice.stop();
    if (state.turns.length === 0) {
      useDebateContextStore.getState().resetOverride('crossfire');
      dispatch({
        type: 'session-reset',
        prefill: {
          resolution: state.config.resolution,
          argument: state.config.argument,
          seedQuestions: state.config.seedQuestions,
        },
      });
      // Ending by hand before any exchange just leaves; only the clock running out needs explaining.
      setFormError(reason === 'timer' ? t('crossfire.debriefEmptyDesc') : '');
      return;
    }
    const next = crossfireReducer(state, { type: 'session-ended', now: Date.now(), reason });
    dispatch({ type: 'session-ended', now: next.phase === 'debriefing' ? next.endedAt : Date.now(), reason });
    if (next.phase === 'debriefing') void runDebrief(next);
  }, [runDebrief, state, t]);


  const startSession = () => {
    if (state.phase !== 'setup') return;
    const parsed = CrossfireConfigSchema.safeParse(state.config);
    if (!parsed.success) {
      setFormError(t('crossfire.validationError', 'Enter a resolution and argument before starting.'));
      return;
    }
    setFormError('');
    debateGate.run(parsed.data.resolution, (target) => void beginSession(target.debateId));
  };

  const beginSession = async (debateId: string | null) => {
    // The round starts from the setup as it was when Start was pressed, with
    // the debate chosen for that motion.
    const target = stateRef.current;
    if (target.phase !== 'setup') return;
    const startRequest = startRequestRef.current + 1;
    startRequestRef.current = startRequest;
    // Check today's quota before the clock starts, so a round the server
    // would refuse never starts. An unknown answer does not block.
    setCheckingQuota(true);
    const refusal = await sessionQuota.checkBeforeStart();
    if (startRequestRef.current !== startRequest) return;
    setCheckingQuota(false);
    if (refusal) {
      handleSubscriptionError(refusal);
      return;
    }
    // Edited, restarted, or restored while the check ran: this Start is stale.
    if (stateRef.current !== target) return;
    const current = target;
    debateTargetRef.current = debateId;
    artifactRequestIdRef.current = crypto.randomUUID();
    opponentVoice.beginRound();
    const action = {
      type: 'session-started' as const,
      sessionId: `${SESSION_ID_PREFIX}-${Date.now()}`,
      now: Date.now(),
    };
    const next = crossfireReducer(current, action);
    dispatch(action);
    if (next.phase === 'active' && next.request.status === 'pending') {
      void runNextTurn(next, next.request.expectedReply);
    }
  };

  const submitTurn = async () => {
    // A spoken turn waits for the recogniser's last words, so read the
    // freshest draft and state afterwards rather than this render's copies.
    // Stopping also withdraws a start that is still waiting for permission.
    if (listening) await stopCapture();
    else void stopCapture();
    const current = stateRef.current;
    if (current.phase !== 'active') return;
    const kind = expectedUserTurnKind(current);
    const text = draftTurnRef.current.trim();
    if (!kind || !text || text.length > MAX_CROSSFIRE_TURN_CHARS) return;
    const expectedReply: 'question' | 'answer' = kind === 'question' ? 'answer' : 'question';
    const delivery = voiceActive ? measureDelivery(capture.getTake(), voiceLanguage) : null;
    capture.resetTake();
    const action = {
      type: 'user-turn-submitted' as const,
      turn: { ...nextTurn(current.turns.length + 1, 'user', kind, text), ...(delivery ? { delivery } : {}) },
      expectedReply,
    };
    const next = crossfireReducer(current, action);
    dispatch(action);
    setDraft('');
    if (next.phase === 'active') void runNextTurn(next, expectedReply);
  };

  const startSpeaking = () => {
    // Speaking over the opponent ends its audio.
    opponentVoice.stop();
    void capture.start();
  };

  // The microphone closes when it is no longer the student's turn.
  const awaitingUserTurn = expectedUserTurnKind(state) !== null;
  useEffect(() => {
    if (!awaitingUserTurn) void stopCapture();
  }, [awaitingUserTurn, stopCapture]);

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
    abortSignalRequests();
    opponentVoice.stop();
    if (user?.id) clearCrossfireDraft(user.id);
    // The round is over, so its Review choices go with it.
    useDebateContextStore.getState().resetOverride('crossfire');
    artifactRequestIdRef.current = crypto.randomUUID();
    dispatch({ type: 'session-reset' });
    setDraft('');
    setFormError('');
  };

  if (stateOwnerId !== user?.id) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center px-4 py-8">
        <OwlLoader message={t('crossfire.loading')} />
      </div>
    );
  }

  if (state.phase === 'setup') {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <WorkspaceToolScope context={workspace.context} />
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="max-w-2xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Flame className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{t('crossfire.title')}</h1>
            <DailyUsage className="mt-1" />
          </header>
          <CurrentDebateStrip hidden={Boolean(workspace.context)} />
          {debateGate.dialog}
          <SubscriptionErrorModals subError={subError} />

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
                          'rounded-lg border p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
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
                          'rounded-lg border p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
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
                        'min-h-11 rounded-md border px-4 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
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

              {!workspace.context && (
                <VoiceModeToggle
                  id="crossfire-voice"
                  checked={Boolean(state.voice)}
                  onCheckedChange={(voice) => dispatch({ type: 'voice-toggled', voice })}
                  description={t('voiceRound.mode.crossfireDescription')}
                />
              )}

              <DebateContextControl
                feature="crossfire"
                side="both"
                includeSources={state.config.useSourceLibrary}
                hidden={Boolean(workspace.context)}
              />

              <div className="space-y-2">
                <Button data-testid="start-crossfire" size="lg" onClick={startSession} disabled={checkingQuota} className="w-full sm:w-auto">
                  <Flame className="mr-2 h-4 w-4" />
                  {t('crossfire.start')}
                </Button>
                <SessionCostNote units={sessionQuota.units} remaining={sessionQuota.remaining} blocked={sessionQuota.blocked} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (state.phase === 'complete') {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <WorkspaceToolScope context={workspace.context} />
        <div className="mx-auto max-w-5xl space-y-10">
          <CrossfireDebriefView debrief={state.debrief} turns={state.turns} onRestart={restart} />
          <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} />
        </div>
      </div>
    );
  }

  if (state.phase === 'debriefing') {
    const debriefSections = liveDebrief.draft ? crossfireDebriefDraftSections(liveDebrief.draft, t) : [];
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8')}>
        <WorkspaceToolScope context={workspace.context} />
        <div className="mx-auto max-w-4xl space-y-6">
          <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} />
          {state.requestStatus === 'pending' && debriefSections.length > 0 ? (
            <LiveToolRun label={t('crossfire.debriefLoading')} live={liveDebrief} sections={debriefSections} />
          ) : (
          <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
              {state.requestStatus === 'pending' ? (
                <>
                  <OwlLoader size={88} />
                  <div>
                    <h2 className="font-display text-lg font-[600] text-heading">{t('crossfire.debriefLoading')}</h2>
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
          )}
          <SubscriptionErrorModals subError={subError} />
        </div>
      </div>
    );
  }

  const inputKind = expectedUserTurnKind(state);
  // The composer stays open while the AI works, so the next turn can be drafted; only sending waits.
  const composerKind = inputKind ?? (state.config.mode === 'question-ai' ? 'question' : state.turns.length > 0 ? 'answer' : null);
  return (
    <div className={cn(stateMotionClass, 'container px-4 py-6 md:py-8')}>
      <WorkspaceToolScope context={workspace.context} />
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{state.config.mode === 'question-ai' ? t('crossfire.modeQuestionAi') : t('crossfire.modeAiQuestionsUser')}</Badge>
              <Badge variant="secondary">{t(`crossfire.style${state.config.style[0].toUpperCase()}${state.config.style.slice(1)}`)}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">{t('crossfire.title')}</h1>
            <p className="mt-1 max-w-3xl wrap-break-word text-sm text-muted-foreground">{state.config.resolution}</p>
          </div>
          <div className="flex items-center gap-3">
            <CrossfireClock endsAt={state.endsAt} onExpire={() => endSession('timer')} />
            <Button data-testid="end-crossfire" variant="outline" disabled={!canEndCrossfireSession(state)} onClick={() => endSession('manual')}>
              {t('crossfire.endSession')}
            </Button>
          </div>
        </header>

        <Transcript turns={state.turns} reduceMotion={shouldReduceMotion} live />

        {state.voice && !workspace.context && !voiceAvailability.available && (
          <p data-testid="voice-unavailable" className="text-xs leading-5 text-muted-foreground">
            {voiceAvailability.reason === 'denied' ? t('voiceRound.unavailable.denied') : t('voiceRound.unavailable.unsupported')}
          </p>
        )}
        {voiceActive && <OpponentVoiceBar />}

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

        {state.request.status === 'pending' && (liveReply ? (
          // The opponent's turn as it is written, styled as the turn it becomes.
          <article data-testid="crossfire-live-turn" className="mr-auto max-w-[92%] rounded-lg border border-border bg-card p-4" aria-busy="true">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">T{state.turns.length + 1}</span>
              <span>{state.request.expectedReply === 'question' ? t('crossfire.question') : t('crossfire.answer')}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{liveReply}<LiveCaret /></p>
          </article>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
            <LoadingSpinner size="sm" className="text-primary" />
            {t('crossfire.thinking')}
          </div>
        ))}

        {composerKind && (
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Label htmlFor="crossfire-input">{composerKind === 'question' ? t('crossfire.questionLabel') : t('crossfire.answerLabel')}</Label>
              {voiceActive && <VoiceMicControl capture={capture} onStart={startSpeaking} onStop={() => void stopCapture()} />}
              <Textarea
                id="crossfire-input"
                data-testid="crossfire-input"
                value={draftTurn}
                maxLength={MAX_CROSSFIRE_TURN_CHARS}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void submitTurn();
                  }
                }}
                placeholder={voiceActive ? t('voiceRound.mic.draftPlaceholder') : composerKind === 'question' ? t('crossfire.questionPlaceholder') : t('crossfire.answerPlaceholder')}
                className="min-h-28 resize-y"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">{t('crossfire.charactersRemaining', { count: MAX_CROSSFIRE_TURN_CHARS - draftTurn.length })}</span>
                <Button data-testid="submit-turn" onClick={() => void submitTurn()} disabled={!inputKind || (!draftTurn.trim() && !listening)}>
                  <Send className="mr-2 h-4 w-4" />
                  {composerKind === 'question' ? t('crossfire.submitQuestion') : t('crossfire.submitAnswer')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}

const NEW_TURN_MS = 1_000;

// `live`: the round is running, so the setup hint never shows; the first turn is on its way or the student's to write.
function Transcript({ turns, reduceMotion, live = false }: { turns: CrossfireTurn[]; reduceMotion: boolean | null; live?: boolean }) {
  const { t } = useTranslation();
  return (
    <section data-testid="crossfire-transcript" aria-label={t('crossfire.transcript')} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{t('crossfire.transcript')}</h2>
      </div>
      {turns.length === 0 ? (
        live ? null : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('crossfire.emptyDesc')}</div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {turns.map((turn) => (
            <motion.article
              key={turn.id}
              id={`crossfire-turn-${turn.id}`}
              // Only a turn that just arrived fades in; a phase change re-renders the
              // transcript without replaying every card.
              initial={reduceMotion || Date.now() - turn.createdAt > NEW_TURN_MS ? false : { opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
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
              {turn.kind === 'answer' && turn.signal ? (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('crossfire.liveSignals')}>
                  <Badge
                    variant="outline"
                    aria-label={t('crossfire.signalConfidence', {
                      label: t(`crossfire.signalQuality.${turn.signal.answerQuality}`),
                      percent: Math.round(turn.signal.answerQualityConfidence * 100),
                    })}
                  >
                    {t(`crossfire.signalQuality.${turn.signal.answerQuality}`)}
                  </Badge>
                  <Badge
                    variant="outline"
                    aria-label={t('crossfire.signalConfidence', {
                      label: t(`crossfire.signalConcession.${turn.signal.concession}`),
                      percent: Math.round(turn.signal.concessionConfidence * 100),
                    })}
                  >
                    {t(`crossfire.signalConcession.${turn.signal.concession}`)}
                  </Badge>
                  {turn.signal.followUpOpportunity > 0.70 ? (
                    <Badge
                      variant="secondary"
                      aria-label={t('crossfire.signalProbability', {
                        label: t('crossfire.signalFollowUp'),
                        percent: Math.round(turn.signal.followUpOpportunity * 100),
                      })}
                    >
                      {t('crossfire.signalFollowUp')}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}
