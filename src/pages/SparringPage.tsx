import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { generateSparringTurn, isAISubscriptionError, judgeSparringSession } from '@/lib/ai/client';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import type { SparringRespondInput, SparringScoreInput, SparringSpeech } from '@/lib/ai/schemas/sparring';
import { SparringSetup, type SparringSetupValues } from '@/components/features/sparring/SparringSetup';
import { SparringRound } from '@/components/features/sparring/SparringRound';
import { SparringScorecard } from '@/components/features/sparring/SparringScorecard';
import type { LiveRunState } from '@/components/features/tools/tool-run';
import { readableLiveText } from '@/lib/voice/live-text';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateMotionGate } from '@/components/features/debate/DebateMotionGate';
import { toast } from '@/hooks/use-toast';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { saveWorkspaceArtifact } from '@/lib/workspace/practice-client';
import { createArtifactSaveQueue } from '@/lib/workspace/artifact-save-queue';
import { OpponentVoiceBar } from '@/components/features/voice/OpponentVoiceBar';
import { useVoiceAvailability } from '@/lib/voice/availability';
import type { SpeechDelivery } from '@/lib/voice/delivery';
import { opponentVoice } from '@/lib/voice/opponent-voice';
import { useSessionQuota } from '@/hooks/use-session-quota';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { SubscriptionErrorModals } from '@/components/features/subscription';

function readableError(error: unknown, fallback: string) {
  // Subscription errors have their own text; provider errors get the translated outage message.
  if (isAISubscriptionError(error) || (error instanceof Error && error.message.trim())) return getUserFacingAIError(error);
  return fallback;
}

function estimateAiTimeUsedSeconds(content: string, limit: number) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return Math.min(limit, Math.max(1, Math.round((words / 140) * 60)));
}

export default function SparringPage() {
  const workspace = useWorkspaceToolScope('sparring');
  const debateGate = useDebateMotionGate({ disabled: Boolean(workspace.context) });
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const subError = useSubscriptionError();
  const { handleSubscriptionError } = subError;
  const workspaceLaunch = (location.state as { workspaceLaunch?: unknown } | null)?.workspaceLaunch === true;
  const workspaceArtifact = (location.state as { workspaceArtifact?: unknown } | null)?.workspaceArtifact;
  const storedSession = useSparringStore((state) => state.currentSession);
  const session = workspaceLaunch || workspaceArtifact !== undefined ? null : storedSession;
  const currentView = !session ? 'setup' : session.phase === 'complete' && session.scorecard ? 'scorecard' : 'round';
  const previousViewRef = useRef(currentView);
  const viewChanged = previousViewRef.current !== currentView;
  useEffect(() => {
    previousViewRef.current = currentView;
  }, [currentView]);
  const stateMotionClass = viewChanged ? 'motion-swap' : undefined;
  const startSession = useSparringStore((state) => state.startSession);
  const restoreWorkspaceSession = useSparringStore((state) => state.restoreWorkspaceSession);
  const submitUserSpeech = useSparringStore((state) => state.submitUserSpeech);
  const appendAiSpeech = useSparringStore((state) => state.appendAiSpeech);
  const completeSession = useSparringStore((state) => state.completeSession);
  const abandonSession = useSparringStore((state) => state.abandonSession);
  const pauseTimer = useSparringStore((state) => state.pauseTimer);
  const resumeTimer = useSparringStore((state) => state.resumeTimer);
  const beginWorkspaceSession = useSparringStore((state) => state.beginWorkspaceSession);
  const endWorkspaceSession = useSparringStore((state) => state.endWorkspaceSession);
  const getFeatureConfig = useSettingsStore((state) => state.getFeatureConfig);
  const outputLanguage = useSettingsStore((state) => state.outputLanguage);
  const [aiLoading, setAiLoading] = useState(false);
  const [liveSpeech, setLiveSpeech] = useState('');
  const [liveJudging, setLiveJudging] = useState<LiveRunState>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [judgingError, setJudgingError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const [retryNonce, setRetryNonce] = useState(0);
  const aiRequestRef = useRef<string | null>(null);
  const judgeRequestRef = useRef<string | null>(null);
  const aiInFlightRef = useRef(false);
  const judgeInFlightRef = useRef(false);
  const artifactRequestIdRef = useRef(workspace.context?.requestId ?? crypto.randomUUID());
  // Autosaves fire on every change; the queue keeps an older one from landing last.
  const [saveArtifact] = useState(() => createArtifactSaveQueue(saveWorkspaceArtifact));
  const isOnlineRef = useRef(isOnline);
  const voiceAvailability = useVoiceAvailability();
  // A voice round falls back to typing when the microphone is lost.
  const voiceActive = Boolean(session?.voice) && voiceAvailability.available && !workspace.context;

  // A reply that arrives after the student left is saved but not spoken.
  const mountedRef = useRef(true);
  // Names the latest Start; a newer Start, leaving the page, or switching
  // accounts makes an earlier one that is still checking quota stale.
  const startRequestRef = useRef(0);
  const { user } = useAuth();
  const userId = user?.id;
  const userIdRef = useRef(userId);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRequestRef.current += 1;
      opponentVoice.stop();
    };
  }, []);

  const workspaceRequestId = workspace.context?.requestId;
  useEffect(() => {
    if (!workspaceRequestId) return;
    beginWorkspaceSession();
    return endWorkspaceSession;
  }, [beginWorkspaceSession, endWorkspaceSession, workspaceRequestId]);

  useEffect(() => {
    if (!workspace.context || (!workspaceLaunch && workspaceArtifact === undefined)) return;
    if (workspaceArtifact !== undefined) restoreWorkspaceSession(workspaceArtifact);
    navigate(location.pathname, { replace: true, state: { workspaceContext: workspace.context } });
  }, [location.pathname, navigate, restoreWorkspaceSession, workspace.context, workspaceArtifact, workspaceLaunch]);

  // Declared before the request effects so they read the new status in the same commit.
  useEffect(() => {
    const reconnected = isOnline && !isOnlineRef.current;
    isOnlineRef.current = isOnline;
    // Re-run a request that was gated while offline. Do not disturb a call
    // that was already in flight before the connectivity event.
    if (reconnected && !aiInFlightRef.current && !judgeInFlightRef.current) {
      setRetryNonce((value) => value + 1);
    }
  }, [isOnline]);

  useEffect(() => {
    if (session?.id) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [session?.id]);

  // Follows the model picked in setup; getFeatureConfig alone never changes identity.
  const sparringConfig = useSettingsStore((state) => state.featureConfigs.sparring);
  const config = useMemo(() => sparringConfig ?? getFeatureConfig('sparring'), [getFeatureConfig, sparringConfig]);
  // A round costs one use however many replies it takes; the setup says so.
  const sessionQuota = useSessionQuota('sparring', config, !session);
  // While the server's answer is unknown (an older server, a timeout), warn
  // from the browser's own estimate, as before session charging.
  const { remainingToday } = useSubscription();
  const [checkingQuota, setCheckingQuota] = useState(false);
  useEffect(() => {
    if (userIdRef.current === userId) return;
    userIdRef.current = userId;
    // A Start pressed by the previous account never opens a round for this one.
    startRequestRef.current += 1;
    setCheckingQuota(false);
  }, [userId]);

  const retryAi = useCallback(() => {
    aiRequestRef.current = null;
    setAiError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  const retryJudging = useCallback(() => {
    judgeRequestRef.current = null;
    setJudgingError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!session || session.phase !== 'round') return;
    const currentTurn = session.turns[session.currentTurnIndex];
    if (!currentTurn || currentTurn.speaker !== 'ai') {
      setAiLoading(false);
      return;
    }

    if (!isOnlineRef.current) {
      setAiLoading(false);
      setAiError(t('sparring.round.aiOffline', 'Reconnect to let the opponent answer. Your transcript is safe.'));
      return;
    }

    const requestKey = `${session.id}:${currentTurn.id}:${session.speeches.length}`;
    if (aiRequestRef.current === requestKey) return;
    aiRequestRef.current = requestKey;
    aiInFlightRef.current = true;
    setAiLoading(true);
    setAiError(null);
    const { speaker: _speaker, ...turnInput } = currentTurn;
    const input: SparringRespondInput = {
      action: 'respond',
      sessionId: session.id,
      motion: session.motion,
      userSide: session.userSide,
      format: session.format,
      difficulty: session.difficulty,
      speeches: session.speeches,
      language: outputLanguage,
      currentTurn: turnInput,
    };

    setLiveSpeech('');
    void generateSparringTurn(input, config, workspace.context ?? undefined, session.debateId ?? null, voiceActive, {
      onDraft: (draft) => {
        if (aiRequestRef.current !== requestKey) return;
        const speech = draft.speech && typeof draft.speech === 'object' ? (draft.speech as Record<string, unknown>).content : undefined;
        setLiveSpeech(typeof speech === 'string' ? readableLiveText(speech) : '');
      },
    })
      .then((result) => {
        if (aiRequestRef.current !== requestKey) return;
        if (useSparringStore.getState().currentSession?.id !== session.id) return;
        const generated = result.speech;
        const speech: SparringSpeech = {
          id: `ai-${session.id}-${currentTurn.id}`,
          turnId: currentTurn.id,
          speaker: 'ai',
          side: currentTurn.side,
          role: currentTurn.label,
          content: generated.content,
          createdAt: Date.now(),
          timeLimitSeconds: currentTurn.timeLimitSeconds,
          timeUsedSeconds: estimateAiTimeUsedSeconds(generated.content, currentTurn.timeLimitSeconds),
          integrityToken: generated.integrityToken,
        };
        const next = appendAiSpeech(speech);
        if (!next || !voiceActive || !mountedRef.current) return;
        // The student's clock waits while the opponent is speaking.
        const userIsNext = next.phase === 'round';
        if (userIsNext) pauseTimer();
        opponentVoice.speak({ feature: 'sparring', text: generated.content, voice: result.voice, language: outputLanguage }, () => {
          // Resume only the turn this reply paused. A reply still playing when
          // the next one arrives ends after that one has paused a later turn.
          const current = useSparringStore.getState().currentSession;
          if (userIsNext && current?.id === session.id && current.currentTurnIndex === next.currentTurnIndex) resumeTimer();
        });
      })
      .catch((error: unknown) => {
        if (aiRequestRef.current !== requestKey) return;
        handleSubscriptionError(error);
        setAiError(readableError(error, t('sparring.round.aiRequestFailed', 'The AI request failed. Check your connection and try again.')));
      })
      .finally(() => {
        if (aiRequestRef.current === requestKey) {
          aiInFlightRef.current = false;
          setAiLoading(false);
          setLiveSpeech('');
        }
      });
  }, [appendAiSpeech, config, handleSubscriptionError, outputLanguage, pauseTimer, resumeTimer, retryNonce, session, t, voiceActive, workspace.context]);

  useEffect(() => {
    if (!session || session.phase !== 'judging') return;
    if (!isOnlineRef.current) {
      setJudgingError(t('sparring.round.judgeOffline', 'Reconnect to score this round. Your transcript is safe.'));
      return;
    }
    const requestKey = `${session.id}:judge:${session.speeches.length}`;
    if (judgeRequestRef.current === requestKey) return;
    judgeRequestRef.current = requestKey;
    judgeInFlightRef.current = true;
    setJudgingError(null);
    const input: SparringScoreInput = {
      action: 'score',
      sessionId: session.id,
      motion: session.motion,
      userSide: session.userSide,
      format: session.format,
      difficulty: session.difficulty,
      speeches: session.speeches,
      language: outputLanguage,
    };
    setLiveJudging({});
    void judgeSparringSession(input, config, workspace.context ?? undefined, session.debateId ?? null, {
      onDraft: (draft) => {
        if (judgeRequestRef.current === requestKey) setLiveJudging({ phase: 'writing', draft });
      },
    })
      .then((result) => {
        if (judgeRequestRef.current !== requestKey) return;
        if (useSparringStore.getState().currentSession?.id !== session.id) return;
        const completed = completeSession(result.scorecard);
        // The server has now stored the judged round; file it in its debate.
        if (completed?.debateId && !workspace.context) {
          useSparringStore.getState().attachSessionToDebate(completed.id, completed.debateId)
            .catch(() => toast({ title: t('debate.recordFailed', 'Could not save this result to the debate'), variant: 'destructive' }));
        }
      })
      .catch((error: unknown) => {
        if (judgeRequestRef.current !== requestKey) return;
        handleSubscriptionError(error);
        setJudgingError(readableError(error, t('sparring.round.judgeRequestFailed', 'The judge request failed. Check your connection and try again.')));
      })
      .finally(() => {
        if (judgeRequestRef.current === requestKey) {
          judgeInFlightRef.current = false;
          setLiveJudging({});
        }
      });
  }, [completeSession, config, handleSubscriptionError, outputLanguage, retryNonce, session, t, workspace.context]);

  useEffect(() => {
    if (!workspace.context || !session) return;
    saveArtifact({
      documentEpoch: workspace.context.documentEpoch,
      documentId: workspace.context.documentId,
      inputSnapshot: { motion: session.motion, side: session.userSide, format: session.format, difficulty: session.difficulty },
      outputSnapshot: session.phase === 'complete' ? session : undefined,
      progress: session,
      requestId: artifactRequestIdRef.current,
      status: session.phase === 'complete' ? 'complete' : 'progress',
      tool: 'sparring',
      workspaceId: workspace.context.workspaceId,
    });
  }, [saveArtifact, session, workspace.context]);

  const handleStart = (values: SparringSetupValues) => debateGate.run(values.motion, (target) => void beginRound(values, target.debateId));

  const beginRound = async (values: SparringSetupValues, debateId: string | null) => {
    const owner = userIdRef.current;
    const roundBefore = useSparringStore.getState().currentSession;
    const startRequest = startRequestRef.current + 1;
    startRequestRef.current = startRequest;
    // Check today's quota before the round opens, so a speech is never
    // written for a round the server would refuse. An unknown answer does not block.
    setCheckingQuota(true);
    const refusal = await sessionQuota.checkBeforeStart();
    if (startRequestRef.current !== startRequest || !mountedRef.current || userIdRef.current !== owner) return;
    setCheckingQuota(false);
    if (refusal) {
      handleSubscriptionError(refusal);
      return;
    }
    // A round was restored or started elsewhere while the check ran: never replace it.
    if (useSparringStore.getState().currentSession !== roundBefore) return;
    const target = { debateId };
    artifactRequestIdRef.current = crypto.randomUUID();
    opponentVoice.beginRound();
    startSession({ ...values, debateId: target.debateId });
    setAiError(null);
    setJudgingError(null);
    setRetryNonce(0);
    aiRequestRef.current = null;
    judgeRequestRef.current = null;
    setSubmissionError(null);
  };

  const handleRestart = () => {
    artifactRequestIdRef.current = crypto.randomUUID();
    opponentVoice.stop();
    abandonSession();
    setAiError(null);
    setJudgingError(null);
    setRetryNonce(0);
    aiRequestRef.current = null;
    judgeRequestRef.current = null;
    setSubmissionError(null);
  };

  const handleSubmit = (content: string, delivery?: SpeechDelivery | null) => {
    const result = submitUserSpeech(content, undefined, delivery);
    setSubmissionError(result ? null : t('sparring.round.speechRejected', 'This speech could not be submitted. Check the timer and length, then try again.'));
  };

  const handleExportDocx = () => {
    if (session) void import('@/lib/export-utils')
      .then(({ exportSparringToDocx }) => exportSparringToDocx(session))
      .catch((): undefined => undefined);
  };

  const handleExportPdf = () => {
    if (session) void import('@/lib/pdf-export-utils')
      .then(({ exportSparringToPdf }) => exportSparringToPdf(session))
      .catch((): undefined => undefined);
  };

  if (!session) {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8 sm:py-10')}>
        <WorkspaceToolScope context={workspace.context} />
        <SparringSetup
          initialValues={workspace.context ? { motion: workspace.context.motion, userSide: workspace.context.side } : undefined}
          onStart={handleStart}
          roundCost={sessionQuota.units}
          remainingRequests={sessionQuota.remaining ?? remainingToday}
          blockedReason={sessionQuota.blocked}
          isStarting={checkingQuota}
          debatePrefill={!workspace.context}
          voiceAllowed={!workspace.context}
          banner={<CurrentDebateStrip hidden={Boolean(workspace.context)} className="" />}
        />
        {debateGate.dialog}
        <SubscriptionErrorModals subError={subError} />
      </div>
    );
  }

  if (session.phase === 'complete' && session.scorecard) {
    return (
      <div className={cn(stateMotionClass, 'container px-4 py-8 sm:py-10')}>
        <WorkspaceToolScope context={workspace.context} />
        {voiceActive && <OpponentVoiceBar className="mx-auto mb-4 max-w-6xl" />}
        <SparringScorecard session={session} scorecard={session.scorecard} onRestart={handleRestart} onExport={handleExportDocx} onExportPdf={handleExportPdf} />
      </div>
    );
  }

  return (
    <div className={cn(stateMotionClass, 'container px-4 py-6 sm:py-8')}>
      <WorkspaceToolScope context={workspace.context} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/app')} className="-ml-2 text-muted-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('sparring.round.backToWorkspace', 'Back to workspace')}</Button>
        <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', !isOnline && 'text-amber-600 dark:text-amber-400')}><CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />{t('sparring.round.draftSavedNotice', 'Drafts save in this tab')}</span>
      </div>
      {session.voice && !workspace.context && !voiceAvailability.available && (
        <p data-testid="voice-unavailable" className="mx-auto mb-4 max-w-7xl text-xs leading-5 text-muted-foreground">
          {voiceAvailability.reason === 'denied' ? t('voiceRound.unavailable.denied') : t('voiceRound.unavailable.unsupported')}
        </p>
      )}
      {voiceActive && <OpponentVoiceBar className="mx-auto mb-4 max-w-7xl" />}
      <SparringRound
        session={session}
        voice={voiceActive ? { language: outputLanguage } : null}
        aiLoading={aiLoading}
        liveSpeech={liveSpeech}
        liveJudging={liveJudging}
        aiError={aiError}
        judging={session.phase === 'judging'}
        judgingError={judgingError}
        submissionError={submissionError}
        onSubmit={handleSubmit}
        onRetryAi={retryAi}
        onRetryJudging={retryJudging}
      />
      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}
