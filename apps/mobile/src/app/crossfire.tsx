import { createCrossfireSetupState, crossfireReducer, expectedUserTurnKind } from '@debatelab/core/crossfire/reducer';
import {
  CrossfireConfigSchema,
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_RESOLUTION_CHARS,
  MAX_CROSSFIRE_TURN_CHARS,
  type CrossfirePrefill,
  type CrossfireState,
  type CrossfireTurn,
} from '@debatelab/core/crossfire/schemas';
import { formatRoundTime } from '@debatelab/core/sparring/formats';
import { combineDelivery, measureDelivery } from '@debatelab/core/voice/delivery';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text-input';
import { MainActionButton, TextButton } from '@/components/buttons';
import { Celebration } from '@/components/celebration';
import { ChoiceCards, CrossfireDebriefDocument, CrossfireTranscript } from '@/components/crossfire-views';
import { DocumentScreen, DocumentTitle, SectionHeading } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SwitchRow } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import { ContextLine } from '@/components/context-line';
import { SessionCostNote } from '@/components/session-cost-note';
import { LiveTopBar, RoundIconButton } from '@/components/round-controls';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { TimerRing } from '@/components/timer-ring';
import { ToolTitle, WorkingIn } from '@/components/tool-form';
import { appendDictation, DeliverySummary, OpponentVoiceBar, VoiceMicControl, VoiceModeSwitch } from '@/components/voice';
import { useFocusedKeyCommand } from '@/lib/key-commands';
import { announceAnswer } from '@/lib/a11y';
import { abortError, AIError, isAbortError, type ResponseExtras, untilAborted } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { opponentVoice } from '@/lib/opponent-voice';
import { useSpeechCapture } from '@/lib/use-speech-capture';
import { useVoiceAvailability } from '@/lib/voice-availability';
import { backLabel } from '@/lib/back-label';
import { resetContextChoices } from '@/lib/context-plan';
import { buildDebateContext } from '@/lib/context-request';
import {
  countActiveSources,
  crossfireContext,
  crossfireDebrief,
  crossfireDraft,
  crossfirePrefill,
  CrossfireResponseError,
  crossfireSignal,
  crossfireTurn,
  recordCrossfire,
  withTurnDeadline,
} from '@/lib/crossfire';
import { useDebates } from '@/lib/debate-context';
import { fetchFeatureConfig } from '@/lib/feature-config';
import { openRefusal } from '@/lib/refusal';
import { sessionQuotaRefusal, useSessionQuota } from '@/lib/session-quota';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/motion';
import { chooseMotionTarget } from '@/lib/motion-gate';
import { keepSourceAssessments } from '@/lib/results';
import { useSettings } from '@/lib/settings';
import { formatClock } from '@/lib/timer';
import { useLatest } from '@/lib/live-value';
import { fontFamily } from '@/theme/fonts';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Active = Extract<CrossfireState, { phase: 'active' }>;
type Debriefing = Extract<CrossfireState, { phase: 'debriefing' }>;
type ErrorKind = 'timeout' | 'response' | 'request';

const PLAN_MESSAGES = new Set(['mobile.results.errors.trialExpired', 'mobile.results.errors.limitReached', 'mobile.results.errors.modelRestricted']);

/**
 * The round left behind, as the website's restoreState: a request that was cut off becomes one to
 * retry. A prefill from a case or an attack starts the form unless a round is still under way.
 */
function restoredState(prefill: CrossfirePrefill | null): CrossfireState {
  const draft = crossfireDraft.get()?.state;
  if (draft?.phase === 'active' && draft.request.status === 'pending') {
    return { ...draft, request: { status: 'failed', expectedReply: draft.request.expectedReply, errorKind: 'request', message: 'crossfire.interruptedRequest' } };
  }
  if (draft?.phase === 'debriefing' && draft.requestStatus === 'pending') {
    return { ...draft, requestStatus: 'failed', errorKind: 'request', errorMessage: 'crossfire.interruptedDebrief' };
  }
  if (draft?.phase === 'active' || draft?.phase === 'debriefing') return draft;
  // A form keeps its texts and goes back to the website's defaults for the rest.
  return createCrossfireSetupState(prefill ?? (draft?.phase === 'setup'
    ? { resolution: draft.config.resolution, argument: draft.config.argument, seedQuestions: draft.config.seedQuestions }
    : undefined));
}

/** Errors are stored as translation keys, so a restored round still reads in the current language. */
function classify(cause: unknown, debrief: boolean): { kind: ErrorKind; message: string } {
  if (cause instanceof CrossfireResponseError) return { kind: 'response', message: debrief ? 'crossfire.invalidDebriefResponseDesc' : 'crossfire.invalidResponseDesc' };
  if (cause instanceof AIError) return { kind: cause.kind === 'timeout' ? 'timeout' : 'request', message: `mobile.results.errors.${cause.kind}` };
  console.warn('Crossfire request failed:', cause instanceof Error ? cause.message : cause);
  return { kind: 'request', message: 'mobile.results.errors.failed' };
}

function nextTurn(sequence: number, speaker: 'user' | 'ai', kind: 'question' | 'answer', text: string): CrossfireTurn {
  return { id: `T${sequence}`, sequence, speaker, kind, text: text.trim(), createdAt: Date.now() };
}

/**
 * Crossfire in its typed mode, as the website's CrossfirePage: set up a
 * resolution and a case, question the AI or be questioned for a few timed
 * minutes, then read the debrief. The live round is full screen; the round
 * stays for the session if the student leaves it. In a voice round the
 * student speaks each question or answer (the words fill the box, and the
 * delivery is measured) and the opponent replies aloud; it needs speech
 * recognition, so it runs in the development build, not in Expo Go.
 */
export default function CrossfireScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { debates, current, oneOff, create, switchTo, refresh } = useDebates();
  const { outputLanguage } = useSettings();
  const { colors } = useTheme();
  // Taken once, so coming back later does not import the same case again.
  const [imported] = useState(() => {
    const prefill = crossfirePrefill.get();
    crossfirePrefill.set(null);
    return prefill;
  });
  const [state, dispatch] = useReducer(crossfireReducer, imported, restoredState);
  const roundQuota = useSessionQuota('crossfire');
  // Start waits for the round's cost; a second tap meanwhile does nothing.
  const [checkingQuota, setCheckingQuota] = useState(false);
  // The round whose debrief arrived while this screen watched celebrates once; a kept or restarted one does not.
  const [celebrating, setCelebrating] = useState<string | null>(null);
  // The debate chosen when the round started; null for one-off rounds.
  const debateTarget = useRef<string | null>(crossfireDraft.get()?.debateId ?? null);
  const [draftTurn, setDraftTurnState] = useState('');
  // Read after the microphone's last words land, before React has drawn them.
  const draftRef = useRef('');
  const setDraftTurn = useCallback((value: string) => {
    draftRef.current = value;
    setDraftTurnState(value);
  }, []);
  const stateRef = useLatest(state);
  // A voice round falls back to typing when the microphone is lost.
  const voiceAvailability = useVoiceAvailability();
  const voiceActive = Boolean(state.voice) && voiceAvailability.available;
  const voiceActiveRef = useLatest(voiceActive);
  const capture = useSpeechCapture(outputLanguage, (text) => setDraftTurn(appendDictation(draftRef.current, text, MAX_CROSSFIRE_TURN_CHARS)));
  // Each round is measured on its own, and a start still waiting for permission does not carry over.
  const captureScope = state.phase === 'setup' ? 'setup' : state.sessionId;
  const cancelCapture = capture.cancel;
  useEffect(() => cancelCapture, [cancelCapture, captureScope]);
  // The microphone closes when it is not the student's turn.
  const awaitingUserTurn = expectedUserTurnKind(state) !== null;
  const stopCapture = capture.stop;
  useEffect(() => {
    if (!awaitingUserTurn) void stopCapture();
  }, [awaitingUserTurn, stopCapture]);
  const [formError, setFormError] = useState('');
  // A case or an attack opened in Crossfire while a round runs is not brought in, as on the website; say so.
  const [notice, setNotice] = useState(() => (imported && state.phase !== 'setup' ? t('mobile.crossfire.prefillHeld') : ''));
  const [activeSources, setActiveSources] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  // The finished round still to be recorded in its debate.
  const pendingRecord = useRef<{ sessionId: string; forUser: string; debateId: string } | null>(null);
  const signalRequests = useRef(new Set<AbortController>());
  const live = useRef(true);
  const owner = useRef(userId);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    owner.current = userId;
  }, [userId]);

  const abortSignals = useCallback(() => {
    signalRequests.current.forEach((controller) => controller.abort());
    signalRequests.current.clear();
  }, []);

  // Leaving cancels what is on its way; the round itself stays for the session.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      requestRef.current?.abort();
      abortSignals();
      opponentVoice.stop();
    };
  }, [abortSignals]);

  // The round is kept as it changes, as the website saves its draft; a finished one is not.
  useEffect(() => {
    crossfireDraft.set(state.phase === 'complete' ? null : { state, debateId: debateTarget.current });
  }, [state]);

  // The resolution follows the Current Debate unless the student typed their own.
  const resolution = state.phase === 'setup' ? state.config.resolution : null;
  useEffect(() => {
    if (resolution === null || oneOff || !current) return;
    if (shouldPrefillMotion(resolution, current.motion, debates.map((debate) => debate.motion))) {
      dispatch({ type: 'config-patched', patch: { resolution: current.motion } });
    }
  }, [current, debates, oneOff, resolution]);

  // The grounding switch says when the Current Debate's Library has no active sources.
  const sourceDebate = oneOff ? null : current?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!userId || !sourceDebate) {
        setActiveSources(0);
        return;
      }
      let active = true;
      countActiveSources(userId, sourceDebate)
        .then((count) => {
          if (active) setActiveSources(count);
        })
        .catch((cause: unknown) => console.warn('Could not count active sources:', cause instanceof Error ? cause.message : cause));
      return () => {
        active = false;
      };
    }, [userId, sourceDebate]),
  );


  /** What the website does with every whole answer: save the source rankings, and say when the input was shortened. */
  const afterResponse = useCallback((forUser: string, debateId: string | null, extras: ResponseExtras) => {
    if (extras.truncated) setNotice(`${t('aiClient.inputShortened')}. ${t('aiClient.inputShortenedDesc')}`);
    void keepSourceAssessments(forUser, debateId, extras.assessments).then((saved) => {
      if (!saved && live.current) setNotice(`${t('aiClient.sourceSaveFailed')}. ${t('aiClient.sourceAssessmentSaveFailed')}`);
    });
  }, [t]);

  // Read inside the request's deadline and abort, so a stalled read neither outlasts 75 s nor survives leaving.
  const requestContext = useCallback(async (forUser: string, debateId: string | null, signal: AbortSignal) => {
    const [config, context] = await untilAborted(
      Promise.all([
        // The website sends Crossfire with the Ask tool's model settings.
        fetchFeatureConfig(forUser, 'ask'),
        debateId ? buildDebateContext(forUser, debateId, 'crossfire', 'both') : Promise.resolve(undefined),
      ]),
      signal,
    );
    return { config, context };
  }, []);

  const runNextTurn = useCallback(async (snapshot: Active, expectedReply: 'question' | 'answer', forUser: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const debateId = debateTarget.current;
    const spoken = voiceActiveRef.current;
    try {
      const { config, reply, ...extras } = await withTurnDeadline(controller.signal, async (signal) => {
        const { config, context } = await requestContext(forUser, debateId, signal);
        if (signal.aborted) throw abortError();
        const turn = await crossfireTurn(
          { operation: 'next-turn', config: snapshot.config, transcript: snapshot.turns, expectedReply },
          { config, language: outputLanguage, debateContext: crossfireContext(context, snapshot.config), signal, quotaSession: snapshot.sessionId, voice: spoken },
        );
        return { config, ...turn };
      });
      if (controller.signal.aborted) return;
      dispatch({ type: 'ai-turn-received', turn: nextTurn(snapshot.turns.length + 1, 'ai', reply.type, reply.text) });
      // The turn is back with the student; in a voice round the opponent says it aloud, otherwise VoiceOver reads the finished reply.
      haptics.turn();
      if (!spoken) announceAnswer(reply.text);
      else if (live.current) opponentVoice.speak({ feature: 'crossfire', text: reply.text, voice: reply.voice, language: outputLanguage });
      afterResponse(forUser, debateId, extras);
      if (reply.signalToken) {
        const signalController = new AbortController();
        signalRequests.current.add(signalController);
        crossfireSignal(
          { config: snapshot.config, transcript: snapshot.turns, reply: { type: reply.type, text: reply.text }, signalToken: reply.signalToken },
          { config, language: outputLanguage, signal: signalController.signal },
        )
          .then((signal) => {
            if (signal && !signalController.signal.aborted) dispatch({ type: 'signal-received', signal });
          })
          .catch((): void => {})
          .finally(() => signalRequests.current.delete(signalController));
      }
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (cause instanceof AIError && cause.kind === 'debateMissing') void refresh();
      const { kind, message } = classify(cause, false);
      dispatch({ type: 'request-failed', expectedReply, errorKind: kind, message });
      // Crossfire runs on Ask's model settings, so a model refusal switches Ask's.
      openRefusal(router, cause, 'ask');
    }
  }, [afterResponse, outputLanguage, refresh, requestContext, router, voiceActiveRef]);

  const runDebrief = useCallback(async (snapshot: Debriefing, forUser: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const debateId = debateTarget.current;
    try {
      const { debrief, ...extras } = await withTurnDeadline(controller.signal, async (signal) => {
        const { config, context } = await requestContext(forUser, debateId, signal);
        if (signal.aborted) throw abortError();
        return crossfireDebrief(
          { operation: 'debrief', config: snapshot.config, transcript: snapshot.turns },
          { config, language: outputLanguage, debateContext: crossfireContext(context, snapshot.config), signal, quotaSession: snapshot.sessionId },
        );
      });
      if (controller.signal.aborted) return;
      // The effect below saves the finished round from the state it reaches, with any signal that came in meanwhile.
      if (debateId) pendingRecord.current = { sessionId: snapshot.sessionId, forUser, debateId };
      dispatch({ type: 'debrief-received', debrief });
      // Shown only if the reducer took the debrief: the screen checks the round reached complete.
      setCelebrating(snapshot.sessionId);
      // Review choices cover the round; its last request clears them, as on the website.
      resetContextChoices('crossfire');
      afterResponse(forUser, debateId, extras);
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (cause instanceof AIError && cause.kind === 'debateMissing') void refresh();
      const { kind, message } = classify(cause, true);
      dispatch({ type: 'debrief-failed', errorKind: kind, message });
      openRefusal(router, cause, 'ask');
    }
  }, [afterResponse, outputLanguage, refresh, requestContext, router]);

  // A round that finishes here is recorded in its debate once, from its latest state, as CrossfirePage does; one-off rounds are not saved.
  useEffect(() => {
    const pending = pendingRecord.current;
    if (!pending || state.phase !== 'complete' || state.sessionId !== pending.sessionId) return;
    pendingRecord.current = null;
    recordCrossfire(pending.forUser, pending.debateId, state).catch((cause: unknown) => {
      console.warn('Could not save the crossfire to the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === pending.forUser) setNotice(t('debate.recordFailed'));
    });
  }, [state, t]);

  const endSession = useCallback((reason: 'manual' | 'timer') => {
    if (state.phase !== 'active' || !userId) return;
    requestRef.current?.abort();
    opponentVoice.stop();
    capture.cancel();
    if (state.turns.length === 0) {
      dispatch({ type: 'session-reset', prefill: { resolution: state.config.resolution, argument: state.config.argument, seedQuestions: state.config.seedQuestions } });
      setFormError(t('crossfire.debriefEmptyDesc'));
      return;
    }
    const action = { type: 'session-ended' as const, now: Date.now(), reason };
    const next = crossfireReducer(state, action);
    dispatch(action);
    if (next.phase === 'debriefing') void runDebrief(next, userId);
  }, [capture, runDebrief, state, t, userId]);


  const beginSession = (debateId: string | null, forUser: string) => {
    if (state.phase !== 'setup') return;
    debateTarget.current = debateId;
    setNotice('');
    if (state.voice) opponentVoice.beginRound();
    const action = { type: 'session-started' as const, sessionId: `crossfire-${Date.now()}`, now: Date.now() };
    const next = crossfireReducer(state, action);
    dispatch(action);
    if (next.phase === 'active' && next.request.status === 'pending') void runNextTurn(next, next.request.expectedReply, forUser);
  };

  const startSession = async () => {
    if (state.phase !== 'setup' || !userId) return;
    const parsed = CrossfireConfigSchema.safeParse(state.config);
    if (!parsed.success) {
      setFormError(t('crossfire.validationError'));
      return;
    }
    setFormError('');
    const forUser = userId;
    // A round the day's uses cannot cover opens the limit sheet before its clock starts, as on the website.
    if (checkingQuota) return;
    setCheckingQuota(true);
    const refusal = sessionQuotaRefusal(await roundQuota.check());
    if (!live.current) return;
    setCheckingQuota(false);
    if (refusal) {
      openRefusal(router, refusal, 'ask');
      return;
    }
    const motion = parsed.data.resolution;
    // Where the round belongs is settled before it starts, as the website's motion gate does.
    const decision = decideMotionTarget(motion, { debates, current, oneOff });
    if (decision.kind !== 'ask') {
      beginSession(decision.kind === 'attach' ? decision.debateId : null, forUser);
      return;
    }
    const choice = await chooseMotionTarget(decision.matches, {
      title: current ? t('debate.mismatchTitle') : t('debate.offerTitle'),
      message: `“${motion}”\n\n${current ? t('debate.mismatchDesc', { motion: current.motion }) : t('debate.offerDesc')}`,
      switchLabel: t('debate.switchToExisting'),
      createLabel: current ? t('debate.createFromMotion') : t('debate.startDebate'),
      onceLabel: current ? t('debate.useOnce') : t('debate.offerNotNow'),
      cancel: t('common.cancel'),
    });
    if (!choice || !live.current) return;
    let debateId: string | null = null;
    try {
      if (choice.kind === 'switch') {
        await switchTo(choice.debateId);
        debateId = choice.debateId;
      } else if (choice.kind === 'create') {
        debateId = (await create({ motion, settings: {} })).id;
      }
    } catch (cause) {
      console.warn('Could not save the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current) setFormError(t('debate.saveFailed'));
      return;
    }
    if (live.current) beginSession(debateId, forUser);
  };

  const submitTurn = async () => {
    if (state.phase !== 'active' || !userId) return;
    // Stopping also withdraws a start still waiting for permission; the last words land in the box first.
    if (capture.listening) await capture.stop();
    else void capture.stop();
    const latest = stateRef.current;
    if (!live.current || latest.phase !== 'active') return;
    const kind = expectedUserTurnKind(latest);
    const text = draftRef.current.trim();
    if (!kind || !text || text.length > MAX_CROSSFIRE_TURN_CHARS) return;
    const expectedReply = kind === 'question' ? 'answer' : 'question';
    const delivery = voiceActiveRef.current ? measureDelivery(capture.getTake(), outputLanguage) : null;
    capture.resetTake();
    const turn = { ...nextTurn(latest.turns.length + 1, 'user', kind, text), ...(delivery ? { delivery } : {}) };
    const action = { type: 'user-turn-submitted' as const, turn, expectedReply } as const;
    const next = crossfireReducer(latest, action);
    if (next === latest) return;
    dispatch(action);
    setDraftTurn('');
    if (next.phase === 'active') void runNextTurn(next, expectedReply, userId);
  };

  // ⌘↩ submits the turn on an iPad keyboard.
  useFocusedKeyCommand('cmd+enter', () => void submitTurn());

  const startSpeaking = () => {
    // Speaking over the opponent ends its audio.
    opponentVoice.stop();
    void capture.start();
  };

  const retryTurn = () => {
    if (state.phase !== 'active' || state.request.status !== 'failed' || !userId) return;
    const expectedReply = state.request.expectedReply;
    const next = crossfireReducer(state, { type: 'request-retried' });
    dispatch({ type: 'request-retried' });
    if (next.phase === 'active') void runNextTurn(next, expectedReply, userId);
  };

  const retryDebrief = () => {
    if (state.phase !== 'debriefing' || state.requestStatus !== 'failed' || !userId) return;
    const next = crossfireReducer(state, { type: 'debrief-retried' });
    dispatch({ type: 'debrief-retried' });
    if (next.phase === 'debriefing') void runDebrief(next, userId);
  };

  const restart = () => {
    requestRef.current?.abort();
    abortSignals();
    opponentVoice.stop();
    capture.cancel();
    debateTarget.current = null;
    dispatch({ type: 'session-reset' });
    setCelebrating(null);
    setDraftTurn('');
    setFormError('');
    setNotice('');
  };

  if (state.phase === 'setup') {
    const config = state.config;
    return (
      <DocumentScreen
        testID="crossfire-setup"
        header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
        actions={<MainActionButton label={t('crossfire.start')} busy={checkingQuota} onPress={() => void startSession()} />}>
        <ToolTitle title={t('crossfire.title')} subtitle={t('crossfire.setupDescription')} />
        <WorkingIn />
        {imported?.source ? (
          <View style={[styles.imported, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} testID="crossfire-imported">
            <Icon name="book" color={colors.primary} size={20} />
            <View style={styles.importedText}>
              <Text weight="bold" style={styles.importedTitle}>
                {imported.source === 'generate' ? t('crossfire.importFromGenerate') : t('crossfire.importFromAttack')}
              </Text>
              <Text tone="secondary" style={styles.importedBody}>
                {imported.source === 'generate' ? t('crossfire.importGenerateDesc') : t('crossfire.importAttackDesc')}
              </Text>
            </View>
          </View>
        ) : null}
        <Field
          label={t('crossfire.resolutionLabel')}
          hint={t('crossfire.resolutionHint')}
          value={config.resolution}
          maxLength={MAX_CROSSFIRE_RESOLUTION_CHARS}
          onChangeText={(value) => dispatch({ type: 'config-patched', patch: { resolution: value } })}
          placeholder={t('crossfire.resolutionPlaceholder')}
          multiline
          style={styles.resolution}
          testID="crossfire-resolution"
        />
        <Field
          label={t('crossfire.argumentLabel')}
          hint={t('crossfire.argumentHint')}
          value={config.argument}
          maxLength={MAX_CROSSFIRE_ARGUMENT_CHARS}
          onChangeText={(value) => dispatch({ type: 'config-patched', patch: { argument: value } })}
          placeholder={t('crossfire.argumentPlaceholder')}
          multiline
          style={styles.argument}
          testID="crossfire-argument"
        />
        <ChoiceCards
          label={t('crossfire.modeLabel')}
          value={config.mode}
          onChange={(mode) => dispatch({ type: 'config-patched', patch: { mode } })}
          testIDPrefix="crossfire-mode"
          options={[
            { value: 'question-ai', label: t('crossfire.modeQuestionAi'), description: t('crossfire.modeQuestionAiDesc') },
            { value: 'ai-questions-user', label: t('crossfire.modeAiQuestionsUser'), description: t('crossfire.modeAiQuestionsUserDesc') },
          ]}
        />
        <ChoiceCards
          label={t('crossfire.styleLabel')}
          value={config.style}
          onChange={(style) => dispatch({ type: 'config-patched', patch: { style } })}
          testIDPrefix="crossfire-style"
          options={[
            { value: 'cooperative', label: t('crossfire.styleCooperative'), description: t('crossfire.styleCooperativeDesc') },
            { value: 'evasive', label: t('crossfire.styleEvasive'), description: t('crossfire.styleEvasiveDesc') },
            { value: 'aggressive', label: t('crossfire.styleAggressive'), description: t('crossfire.styleAggressiveDesc') },
          ]}
        />
        <View style={styles.duration}>
          <Text weight="medium" tone="secondary" style={styles.groupLabel}>
            {t('crossfire.durationLabel')}
          </Text>
          <SegmentedControl<'180' | '300' | '480'>
            value={String(config.durationSeconds) as '180' | '300' | '480'}
            onChange={(value) => dispatch({ type: 'config-patched', patch: { durationSeconds: Number(value) as 180 | 300 | 480 } })}
            options={[
              { value: '180', label: t('crossfire.duration3m') },
              { value: '300', label: t('crossfire.duration5m') },
              { value: '480', label: t('crossfire.duration8m') },
            ]}
          />
        </View>
        {config.seedQuestions.length > 0 ? (
          <FormGroup label={t('crossfire.seedQuestionsLabel')}>
            {config.seedQuestions.map((question, index) => (
              <Text key={index} style={styles.seed}>
                {question}
              </Text>
            ))}
          </FormGroup>
        ) : null}
        <FormGroup footer={activeSources === 0 ? t('crossfire.sourceLibraryEmpty') : undefined}>
          <SwitchRow
            first
            label={t('crossfire.sourceLibraryLabel')}
            description={t('crossfire.sourceLibraryDesc')}
            value={config.useSourceLibrary}
            onChange={(useSourceLibrary) => dispatch({ type: 'config-patched', patch: { useSourceLibrary } })}
          />
        </FormGroup>
        <VoiceModeSwitch value={Boolean(state.voice)} onChange={(voice) => dispatch({ type: 'voice-toggled', voice })} description={t('voiceRound.mode.crossfireDescription')} />
        <ContextLine feature="crossfire" side="both" includeSources={config.useSourceLibrary} />
        <SessionCostNote quota={roundQuota.quota} />
        {formError ? (
          <Text accessibilityRole="alert" style={[styles.formError, { color: colors.destructive }]} testID="crossfire-form-error">
            {formError}
          </Text>
        ) : null}
      </DocumentScreen>
    );
  }

  if (state.phase === 'complete') {
    // The measured facts of every turn the student spoke, added up, as the website's debrief shows them.
    const spokenDelivery = combineDelivery(state.turns.flatMap((turn) => (turn.delivery ? [turn.delivery] : [])));
    const celebrate = celebrating === state.sessionId;
    return (
      <View style={styles.flex}>
        <DocumentScreen
          testID="crossfire-complete"
          header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
          notice={notice}
          actions={<MainActionButton label={t('crossfire.restart')} onPress={restart} />}>
          <DocumentTitle title={t('crossfire.debriefTitle')} meta={state.config.resolution} />
          <Text tone="secondary" style={styles.subtitle}>
            {t('crossfire.debriefSubtitle')}
          </Text>
          <CrossfireDebriefDocument debrief={state.debrief} holdEntrance={celebrate} />
          {spokenDelivery ? <DeliverySummary delivery={spokenDelivery} /> : null}
          <SectionHeading title={t('crossfire.transcript')} />
          <Transcript turns={state.turns} />
        </DocumentScreen>
        {celebrate ? (
          <Celebration
            eyebrow={t('crossfire.title')}
            title={t('sparring.round.complete')}
            stats={[
              { key: 'concessions', label: t('crossfire.concessionsSecured'), value: state.debrief.concessionsSecured.length },
              { key: 'time', label: t('export.sparringTimeUsed'), value: Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000)), format: formatRoundTime },
            ]}
            onDone={() => setCelebrating(null)}
          />
        ) : null}
      </View>
    );
  }

  // The live round and its debrief wait: full screen, following the system theme like mock 05.
  const inputKind = expectedUserTurnKind(state);
  const total = state.config.durationSeconds;
  const modeLabel = state.config.mode === 'question-ai' ? t('crossfire.modeQuestionAi') : t('crossfire.modeAiQuestionsUser');
  const styleKey = `crossfire.style${state.config.style[0].toUpperCase()}${state.config.style.slice(1)}`;
  const canSend = (Boolean(draftTurn.trim()) || capture.listening) && inputKind !== null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.background }]} testID="crossfire-live">
      {/* The setup's document header is replaced by the live bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <LiveTopBar
        left={<RoundIconButton icon="x" label={t('common.close')} onPress={() => router.back()} testID="crossfire-close" />}
        title={t('crossfire.title')}
        subtitle={`${modeLabel} · ${t(styleKey)}`}
      />
      <View style={[styles.clockRow, { borderBottomColor: colors.line }]}>
        <CrossfireClock active={state.phase === 'active'} endsAt={state.phase === 'active' ? state.endsAt : 0} total={total} onExpired={() => endSession('timer')} />
        <View style={styles.clockInfo}>
          <Text tone="faint" style={styles.clockLabel}>
            {t('crossfire.timerLabel')}
          </Text>
          <Text weight="semibold" style={styles.resolutionLine} numberOfLines={2}>
            {state.config.resolution}
          </Text>
        </View>
        {state.phase === 'active' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => endSession('manual')}
            testID="crossfire-end"
            style={({ pressed }) => [styles.end, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
            <Text weight="semibold" style={styles.endLabel} numberOfLines={2}>
              {t('crossfire.endSession')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.liveContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Transcript turns={state.turns} />

        {voiceActive ? <OpponentVoiceBar /> : null}

        {notice ? (
          <Text tone="secondary" accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        {state.phase === 'active' && state.request.status === 'pending' ? (
          <View style={styles.thinking} accessibilityRole="progressbar" accessibilityLiveRegion="polite" testID="crossfire-thinking">
            <ActivityIndicator color={colors.primary} />
            <Text tone="secondary" style={styles.thinkingText}>
              {t('crossfire.thinking')}
            </Text>
          </View>
        ) : null}

        {state.phase === 'active' && state.request.status === 'failed' ? (
          <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.border, backgroundColor: colors.card }]} testID="crossfire-error">
            <Text weight="semibold" style={styles.errorTitle}>
              {state.request.errorKind === 'timeout' ? t('crossfire.timeout') : state.request.errorKind === 'response' ? t('crossfire.invalidResponse') : t('crossfire.error')}
            </Text>
            <Text tone="secondary" style={styles.errorBody}>
              {state.request.errorKind === 'timeout' ? t('crossfire.timeoutDesc') : t(state.request.message)}
            </Text>
            <View style={styles.errorActions}>
              <TextButton label={t('crossfire.retryResponse')} onPress={retryTurn} />
              {PLAN_MESSAGES.has(state.request.message) ? <TextButton label={t('mobile.ask.openYou')} onPress={() => router.navigate('/you')} /> : null}
            </View>
          </View>
        ) : null}

        {state.phase === 'debriefing' ? (
          <View style={[styles.debriefWait, { borderColor: colors.border, backgroundColor: colors.card }]} testID="crossfire-debriefing">
            {state.requestStatus === 'pending' ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text weight="semibold" style={styles.errorTitle} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
                  {t('crossfire.debriefLoading')}
                </Text>
                <Text tone="secondary" style={styles.waitBody}>
                  {t('crossfire.debriefSubtitle')}
                </Text>
              </>
            ) : (
              <>
                <Icon name="alert" color={colors.destructive} size={26} />
                <Text weight="semibold" style={styles.errorTitle} accessibilityRole="alert">
                  {state.errorKind === 'timeout' ? t('crossfire.debriefTimeout') : t('crossfire.debriefError')}
                </Text>
                <Text tone="secondary" style={styles.waitBody}>
                  {t(state.errorMessage ?? 'crossfire.errorDesc')}
                </Text>
                <TextButton label={t('crossfire.debriefRetry')} onPress={retryDebrief} />
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {inputKind ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.line, backgroundColor: colors.tabBar }]}>
          <View style={styles.composerColumn}>
            <View style={styles.composerLabelRow}>
              <Text weight="medium" tone="secondary" style={styles.composerLabel}>
                {inputKind === 'question' ? t('crossfire.questionLabel') : t('crossfire.answerLabel')}
              </Text>
              {/* The website's count; plural forms need the Intl.PluralRules polyfill on Hermes. */}
              <Text tone="faint" style={styles.composerCount} testID="crossfire-count">
                {t('crossfire.charactersRemaining', { count: MAX_CROSSFIRE_TURN_CHARS - draftTurn.length })}
              </Text>
            </View>
            {voiceActive ? <VoiceMicControl capture={capture} onStart={startSpeaking} onStop={() => void capture.stop()} /> : null}
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.input }]}>
              <AppTextInput
                value={draftTurn}
                onChangeText={setDraftTurn}
                maxLength={MAX_CROSSFIRE_TURN_CHARS}
                placeholder={voiceActive ? t('voiceRound.mic.draftPlaceholder') : inputKind === 'question' ? t('crossfire.questionPlaceholder') : t('crossfire.answerPlaceholder')}
                placeholderTextColor={colors.tabInactive}
                accessibilityLabel={inputKind === 'question' ? t('crossfire.questionLabel') : t('crossfire.answerLabel')}
                multiline
                style={[styles.input, { color: colors.foreground }]}
                testID="crossfire-input"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inputKind === 'question' ? t('crossfire.submitQuestion') : t('crossfire.submitAnswer')}
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => void submitTurn()}
                style={[styles.send, { backgroundColor: colors.primaryFill }, !canSend && styles.sendDisabled]}
                testID="crossfire-send">
                <Icon name="arrowUp" color={colors.onPrimary} size={19} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** The transcript, drawn again only when a turn is added: not for typing, the clock or the microphone. */
const Transcript = memo(CrossfireTranscript);

/**
 * The round's clock. It reads the end timestamp and ticks on its own, so the
 * rest of the round does not render twice a second; coming back from the
 * background redraws it at once, and it ends the round when time is up.
 */
function CrossfireClock({ active, endsAt, total, onExpired }: { active: boolean; endsAt: number; total: number; onExpired: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const expired = useLatest(onExpired);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [active]);
  useEffect(() => {
    if (active && now >= endsAt) expired.current();
  }, [active, now, endsAt, expired]);
  const remaining = active ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`${t('crossfire.timerLabel')}: ${formatClock(remaining)}`}>
      <TimerRing size={58} fraction={total > 0 ? remaining / total : 0} warning={active && remaining < 30}>
        <Text weight="bold" style={styles.clockText} testID="crossfire-clock">
          {formatClock(remaining)}
        </Text>
      </TimerRing>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  resolution: { minHeight: 76, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  argument: { minHeight: 150, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  duration: { gap: 7 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  imported: { flexDirection: 'row', gap: 10, borderWidth: 2, borderRadius: radius.field, paddingHorizontal: 14, paddingVertical: 11 },
  importedText: { flex: 1, gap: 2 },
  importedTitle: { fontSize: 15.5, lineHeight: 21 },
  importedBody: { fontSize: 14.5, lineHeight: 20 },
  seed: { fontSize: 15.5, lineHeight: 22, paddingHorizontal: 15, paddingVertical: 10 },
  formError: { fontSize: 15, lineHeight: 21, marginLeft: 4 },
  subtitle: { fontSize: 15.5, lineHeight: 22, marginTop: -6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 720, alignSelf: 'center' },
  clockText: { fontSize: 14.5, fontVariant: ['tabular-nums'] },
  clockInfo: { flex: 1, minWidth: 0, gap: 1 },
  clockLabel: { fontSize: 13 },
  resolutionLine: { fontSize: 15, lineHeight: 20 },
  // Long labels ("Munkamenet befejezése") wrap instead of squeezing the resolution.
  end: { borderWidth: 1, borderRadius: 19, paddingHorizontal: 14, paddingVertical: 6, minHeight: 38, justifyContent: 'center', maxWidth: '38%' },
  endLabel: { fontSize: 14.5, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  liveContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  notice: { fontSize: 14, lineHeight: 19 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: { fontSize: 15 },
  error: { borderWidth: 2, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16, textAlign: 'center' },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  debriefWait: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.card + 2, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', gap: 10 },
  waitBody: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  composerColumn: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, gap: 6 },
  composerLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginHorizontal: 6 },
  composerLabel: { fontSize: 13.5 },
  composerCount: { fontSize: 12.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 48 },
  input: { flex: 1, fontSize: 17, fontFamily: fontFamily.regular, paddingTop: 7, paddingBottom: 7, maxHeight: 140 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
