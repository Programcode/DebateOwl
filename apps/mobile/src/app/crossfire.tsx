import { createCrossfireSetupState, crossfireReducer, expectedUserTurnKind } from '@debatelab/core/crossfire/reducer';
import {
  CrossfireConfigSchema,
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_RESOLUTION_CHARS,
  MAX_CROSSFIRE_TURN_CHARS,
  type CrossfireState,
  type CrossfireTurn,
} from '@debatelab/core/crossfire/schemas';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainActionButton, TextButton } from '@/components/buttons';
import { ChoiceCards, CrossfireDebriefDocument, CrossfireTranscript } from '@/components/crossfire-views';
import { DocumentScreen, DocumentTitle, SectionHeading } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SwitchRow } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import { LiveTopBar, RoundIconButton } from '@/components/round-controls';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { TimerRing } from '@/components/timer-ring';
import { ToolTitle, WorkingIn } from '@/components/tool-form';
import { AIError, isAbortError, type ResponseExtras } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { buildDebateContext } from '@/lib/context-request';
import {
  countActiveSources,
  crossfireContext,
  crossfireDebrief,
  crossfireDraft,
  CrossfireResponseError,
  crossfireSignal,
  crossfireTurn,
  recordCrossfire,
} from '@/lib/crossfire';
import { useDebates } from '@/lib/debate-context';
import { fetchFeatureConfig } from '@/lib/feature-config';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/motion';
import { chooseMotionTarget } from '@/lib/motion-gate';
import { keepSourceAssessments } from '@/lib/results';
import { useSettings } from '@/lib/settings';
import { formatClock } from '@/lib/timer';
import { fontFamily } from '@/theme/fonts';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Active = Extract<CrossfireState, { phase: 'active' }>;
type Debriefing = Extract<CrossfireState, { phase: 'debriefing' }>;
type ErrorKind = 'timeout' | 'response' | 'request';

const PLAN_MESSAGES = new Set(['mobile.results.errors.trialExpired', 'mobile.results.errors.limitReached', 'mobile.results.errors.modelRestricted']);

/** The round left behind, as the website's restoreState: a request that was cut off becomes one to retry. */
function restoredState(): CrossfireState {
  const draft = crossfireDraft.get()?.state;
  if (draft?.phase === 'active' && draft.request.status === 'pending') {
    return { ...draft, request: { status: 'failed', expectedReply: draft.request.expectedReply, errorKind: 'request', message: 'crossfire.interruptedRequest' } };
  }
  if (draft?.phase === 'debriefing' && draft.requestStatus === 'pending') {
    return { ...draft, requestStatus: 'failed', errorKind: 'request', errorMessage: 'crossfire.interruptedDebrief' };
  }
  if (draft?.phase === 'active' || draft?.phase === 'debriefing') return draft;
  // A form keeps its texts and goes back to the website's defaults for the rest.
  return createCrossfireSetupState(draft?.phase === 'setup'
    ? { resolution: draft.config.resolution, argument: draft.config.argument, seedQuestions: draft.config.seedQuestions }
    : undefined);
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
 * stays for the session if the student leaves it. Voice rounds need the
 * development build (speech recognition and the opponent's voice).
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
  const [state, dispatch] = useReducer(crossfireReducer, undefined, restoredState);
  // The debate chosen when the round started; null for one-off rounds.
  const debateTarget = useRef<string | null>(crossfireDraft.get()?.debateId ?? null);
  const [draftTurn, setDraftTurn] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeSources, setActiveSources] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
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

  // The round's clock reads its end timestamp; the tick only redraws it, and coming back from the background redraws at once.
  useEffect(() => {
    if (state.phase !== 'active') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [state.phase]);

  /** What the website does with every whole answer: save the source rankings, and say when the input was shortened. */
  const afterResponse = useCallback((forUser: string, debateId: string | null, extras: ResponseExtras) => {
    if (extras.truncated) setNotice(`${t('aiClient.inputShortened')}. ${t('aiClient.inputShortenedDesc')}`);
    void keepSourceAssessments(forUser, debateId, extras.assessments).then((saved) => {
      if (!saved && live.current) setNotice(`${t('aiClient.sourceSaveFailed')}. ${t('aiClient.sourceAssessmentSaveFailed')}`);
    });
  }, [t]);

  const requestContext = useCallback(async (forUser: string, debateId: string | null) => {
    const [config, context] = await Promise.all([
      // The website sends Crossfire with the Ask tool's model settings.
      fetchFeatureConfig(forUser, 'ask'),
      debateId ? buildDebateContext(forUser, debateId, 'crossfire', 'both') : Promise.resolve(undefined),
    ]);
    return { config, context };
  }, []);

  const runNextTurn = useCallback(async (snapshot: Active, expectedReply: 'question' | 'answer', forUser: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const debateId = debateTarget.current;
    try {
      const { config, context } = await requestContext(forUser, debateId);
      if (controller.signal.aborted) return;
      const { reply, ...extras } = await crossfireTurn(
        { operation: 'next-turn', config: snapshot.config, transcript: snapshot.turns, expectedReply },
        { config, language: outputLanguage, debateContext: crossfireContext(context, snapshot.config), signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      dispatch({ type: 'ai-turn-received', turn: nextTurn(snapshot.turns.length + 1, 'ai', reply.type, reply.text) });
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
    }
  }, [afterResponse, outputLanguage, refresh, requestContext]);

  const runDebrief = useCallback(async (snapshot: Debriefing, forUser: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const debateId = debateTarget.current;
    try {
      const { config, context } = await requestContext(forUser, debateId);
      if (controller.signal.aborted) return;
      const { debrief, ...extras } = await crossfireDebrief(
        { operation: 'debrief', config: snapshot.config, transcript: snapshot.turns },
        { config, language: outputLanguage, debateContext: crossfireContext(context, snapshot.config), signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const action = { type: 'debrief-received' as const, debrief };
      const finished = crossfireReducer(snapshot, action);
      dispatch(action);
      afterResponse(forUser, debateId, extras);
      // A round that finishes here is recorded in its debate once; one-off rounds are not saved, as on the website.
      if (finished.phase === 'complete' && debateId) {
        recordCrossfire(forUser, debateId, finished).catch((cause: unknown) => {
          console.warn('Could not save the crossfire to the debate:', cause instanceof Error ? cause.message : cause);
          if (live.current && owner.current === forUser) setNotice(t('debate.recordFailed'));
        });
      }
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (cause instanceof AIError && cause.kind === 'debateMissing') void refresh();
      const { kind, message } = classify(cause, true);
      dispatch({ type: 'debrief-failed', errorKind: kind, message });
    }
  }, [afterResponse, outputLanguage, refresh, requestContext, t]);

  const endSession = useCallback((reason: 'manual' | 'timer') => {
    if (state.phase !== 'active' || !userId) return;
    requestRef.current?.abort();
    if (state.turns.length === 0) {
      dispatch({ type: 'session-reset', prefill: { resolution: state.config.resolution, argument: state.config.argument, seedQuestions: state.config.seedQuestions } });
      setFormError(t('crossfire.debriefEmptyDesc'));
      return;
    }
    const action = { type: 'session-ended' as const, now: Date.now(), reason };
    const next = crossfireReducer(state, action);
    dispatch(action);
    if (next.phase === 'debriefing') void runDebrief(next, userId);
  }, [runDebrief, state, t, userId]);

  useEffect(() => {
    if (state.phase === 'active' && now >= state.endsAt) endSession('timer');
  }, [endSession, now, state]);

  const beginSession = (debateId: string | null, forUser: string) => {
    if (state.phase !== 'setup') return;
    debateTarget.current = debateId;
    setNotice('');
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

  const submitTurn = () => {
    if (state.phase !== 'active' || !userId) return;
    const kind = expectedUserTurnKind(state);
    const text = draftTurn.trim();
    if (!kind || !text || text.length > MAX_CROSSFIRE_TURN_CHARS) return;
    const expectedReply = kind === 'question' ? 'answer' : 'question';
    const action = { type: 'user-turn-submitted' as const, turn: nextTurn(state.turns.length + 1, 'user', kind, text), expectedReply } as const;
    const next = crossfireReducer(state, action);
    if (next === state) return;
    dispatch(action);
    setDraftTurn('');
    if (next.phase === 'active') void runNextTurn(next, expectedReply, userId);
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
    debateTarget.current = null;
    dispatch({ type: 'session-reset' });
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
        actions={<MainActionButton label={t('crossfire.start')} onPress={() => void startSession()} />}>
        <ToolTitle title={t('crossfire.title')} subtitle={t('crossfire.setupDescription')} />
        <WorkingIn />
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
          {/* Voice rounds need speech recognition and the opponent's voice, which come with the development build. */}
          <SwitchRow
            label={t('voiceRound.mode.label')}
            description={`${t('voiceRound.mode.crossfireDescription')} ${t('mobile.crossfire.voiceLater')}`}
            value={false}
            onChange={() => {}}
            disabled
          />
        </FormGroup>
        {formError ? (
          <Text accessibilityRole="alert" style={[styles.formError, { color: colors.destructive }]} testID="crossfire-form-error">
            {formError}
          </Text>
        ) : null}
      </DocumentScreen>
    );
  }

  if (state.phase === 'complete') {
    return (
      <DocumentScreen
        testID="crossfire-complete"
        header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
        notice={notice}
        actions={<MainActionButton label={t('crossfire.restart')} onPress={restart} />}>
        <DocumentTitle title={t('crossfire.debriefTitle')} meta={state.config.resolution} />
        <Text tone="secondary" style={styles.subtitle}>
          {t('crossfire.debriefSubtitle')}
        </Text>
        <CrossfireDebriefDocument debrief={state.debrief} />
        <SectionHeading title={t('crossfire.transcript')} />
        <CrossfireTranscript turns={state.turns} />
      </DocumentScreen>
    );
  }

  // The live round and its debrief wait: full screen, following the system theme like mock 05.
  const inputKind = expectedUserTurnKind(state);
  const total = state.config.durationSeconds;
  const remaining = state.phase === 'active' ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;
  const modeLabel = state.config.mode === 'question-ai' ? t('crossfire.modeQuestionAi') : t('crossfire.modeAiQuestionsUser');
  const styleKey = `crossfire.style${state.config.style[0].toUpperCase()}${state.config.style.slice(1)}`;
  const canSend = Boolean(draftTurn.trim()) && inputKind !== null;

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
        <View accessible accessibilityRole="timer" accessibilityLabel={`${t('crossfire.timerLabel')}: ${formatClock(remaining)}`}>
          <TimerRing size={58} fraction={total > 0 ? remaining / total : 0} warning={state.phase === 'active' && remaining < 30}>
            <Text weight="bold" style={styles.clockText} testID="crossfire-clock">
              {formatClock(remaining)}
            </Text>
          </TimerRing>
        </View>
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
            <Text weight="semibold" style={styles.endLabel}>
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
        <CrossfireTranscript turns={state.turns} />

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
            <Text weight="medium" tone="secondary" style={styles.composerLabel}>
              {inputKind === 'question' ? t('crossfire.questionLabel') : t('crossfire.answerLabel')}
            </Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.input }]}>
              <TextInput
                value={draftTurn}
                onChangeText={setDraftTurn}
                maxLength={MAX_CROSSFIRE_TURN_CHARS}
                placeholder={inputKind === 'question' ? t('crossfire.questionPlaceholder') : t('crossfire.answerPlaceholder')}
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
                onPress={submitTurn}
                style={[styles.send, { backgroundColor: colors.primary }, !canSend && styles.sendDisabled]}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  resolution: { minHeight: 76, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  argument: { minHeight: 150, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  duration: { gap: 7 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  seed: { fontSize: 15.5, lineHeight: 22, paddingHorizontal: 15, paddingVertical: 10 },
  formError: { fontSize: 15, lineHeight: 21, marginLeft: 4 },
  subtitle: { fontSize: 15.5, lineHeight: 22, marginTop: -6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 720, alignSelf: 'center' },
  clockText: { fontSize: 14.5, fontVariant: ['tabular-nums'] },
  clockInfo: { flex: 1, gap: 1 },
  clockLabel: { fontSize: 13 },
  resolutionLine: { fontSize: 15, lineHeight: 20 },
  end: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  endLabel: { fontSize: 14.5 },
  pressed: { opacity: 0.7 },
  liveContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  notice: { fontSize: 14, lineHeight: 19 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: { fontSize: 15 },
  error: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16, textAlign: 'center' },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  debriefWait: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card + 2, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', gap: 10 },
  waitBody: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  composerColumn: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, gap: 6 },
  composerLabel: { fontSize: 13.5, marginLeft: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 48 },
  input: { flex: 1, fontSize: 17, fontFamily: fontFamily.regular, paddingTop: 7, paddingBottom: 7, maxHeight: 140 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
