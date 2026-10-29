import type { SparringDifficulty, SparringFormat, SparringSide, SparringSpeech } from '@debatelab/core/ai/schemas/sparring';
import { buildSparringTurns, formatRoundTime, getSparringFormat, SPARRING_FORMATS } from '@debatelab/core/sparring/formats';
import {
  appendSparringAiSpeech,
  completeSparringSession,
  currentSparringTurn,
  estimateAiTimeUsedSeconds,
  MAX_SPARRING_SPEECH_CHARS,
  pauseSparringTimer,
  resetSparringTurnTimer,
  resumeSparringTimer,
  startSparringSession,
  submitSparringSpeech,
  tickSparringTimer,
  type SparringSession,
} from '@debatelab/core/sparring/session';
import { measureDelivery } from '@debatelab/core/voice/delivery';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text-input';
import { ActionMenu } from '@/components/action-menu';
import { MainActionButton, TextButton } from '@/components/buttons';
import { Celebration } from '@/components/celebration';
import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import { LiveTopBar, MainRoundControl, RoundIconButton, SideControl } from '@/components/round-controls';
import { SegmentedControl } from '@/components/segmented-control';
import { ContextLine } from '@/components/context-line';
import { SessionCostNote } from '@/components/session-cost-note';
import { SparringScorecardScreen, winnerText } from '@/components/sparring-views';
import { SuccessCheck } from '@/components/success-check';
import { Text } from '@/components/text';
import { TimerRing } from '@/components/timer-ring';
import { ToolTitle, WorkingIn } from '@/components/tool-form';
import { appendDictation, OpponentVoiceBar, VoiceMicControl, VoiceModeSwitch } from '@/components/voice';
import { useFocusedKeyCommand } from '@/lib/key-commands';
import { AIError, isAbortError, untilAborted } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { useDebates } from '@/lib/debate-context';
import { fetchFeatureConfig } from '@/lib/feature-config';
import { useContentWidth } from '@/lib/layout';
import { openRefusal } from '@/lib/refusal';
import { sessionQuotaRefusal, useSessionQuota } from '@/lib/session-quota';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/motion';
import { chooseMotionTarget } from '@/lib/motion-gate';
import { opponentVoice } from '@/lib/opponent-voice';
import { useSettings } from '@/lib/settings';
import { announceAnswer } from '@/lib/a11y';
import { attachSparring, judgeSparring, newSparringId, noteJudgedRound, SparringResponseError, sparringDraft, sparringTurn } from '@/lib/sparring';
import { formatClock } from '@/lib/timer';
import { tapTurnStart, useKeepAwakeWhile } from '@/lib/timer-signals';
import { useSpeechCapture, type SpeechCaptureApi } from '@/lib/use-speech-capture';
import { useVoiceAvailability } from '@/lib/voice-availability';
import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';
import { OwlAvatar, OwlLoader } from '@/components/owl';

const TICK_MS = 250;
const MIN_MOTION_CHARS = 8;
const PLAN_ERRORS = new Set(['trialExpired', 'limitReached', 'modelRestricted']);
/** The turn kinds the website gives school-format guidance for. */
const ROLE_GUIDANCE = new Set(['introductor', 'r1', 'r2', 'conclusor']);

/** A failed opponent turn or judge request. Messages are translation keys, so they read in the current language. */
type Failure = { message: string; plan: boolean };
type RequestState = { status: 'idle' } | { status: 'pending' } | { status: 'failed'; failure: Failure };

function needsRequest(session: SparringSession | null): boolean {
  if (!session) return false;
  return session.phase === 'judging' || (session.phase === 'round' && currentSparringTurn(session)?.speaker === 'ai');
}

function classify(cause: unknown, judge: boolean): Failure {
  if (cause instanceof SparringResponseError) {
    return { message: judge ? 'sparring.round.judgeRequestFailed' : 'sparring.round.aiRequestFailed', plan: false };
  }
  if (cause instanceof AIError) return { message: `mobile.results.errors.${cause.kind}`, plan: PLAN_ERRORS.has(cause.kind) };
  console.warn('Sparring request failed:', cause instanceof Error ? cause.message : cause);
  return { message: 'mobile.results.errors.failed', plan: false };
}

/**
 * Sparring in its typed mode, as the website's SparringPage: set up a motion,
 * pick a side when the round starts, give your speeches in format order
 * against the AI opponent on each speech's clock, and read the judge's
 * scorecard. The live round is full screen like mock 05 and stays for the
 * session if the student leaves it; a request cut off by leaving is offered
 * again. A voice round, as the website's, lets the student speak each speech
 * (the words fill the draft, and the speech's delivery is measured) and
 * plays the opponent's speeches aloud; it needs speech recognition, so it
 * runs in the development build, not in Expo Go.
 */
export default function SparringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session: auth } = useAuth();
  const userId = auth?.user.id ?? null;
  const { debates, current, oneOff, create, switchTo, refresh } = useDebates();
  const { outputLanguage } = useSettings();
  const { colors } = useTheme();

  const [session, setSession] = useState<SparringSession | null>(() => sparringDraft.get());
  // Moves read the latest round from here, so a reply that lands after a keystroke keeps the keystroke.
  const sessionRef = useRef(session);
  // A pause after starting must stay paused when the student edits the draft.
  const startedTurn = useRef<string | null>(null);
  const [request, setRequest] = useState<RequestState>(() =>
    needsRequest(sparringDraft.get()) ? { status: 'failed', failure: { message: 'mobile.sparring.interrupted', plan: false } } : { status: 'idle' });
  const [motion, setMotion] = useState('');
  const [format, setFormat] = useState<SparringFormat>('standard');
  const [difficulty, setDifficulty] = useState<SparringDifficulty>('medium');
  const [voiceMode, setVoiceMode] = useState(false);
  const [formError, setFormError] = useState('');
  const [sideMenu, setSideMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const live = useRef(true);
  const owner = useRef(userId);
  // Each side choice gets a number; a slower earlier one never starts a round over a newer one.
  const startAttempt = useRef(0);
  const roundQuota = useSessionQuota('sparring');
  // Start waits for the round's cost; a second tap meanwhile does nothing.
  const [checkingQuota, setCheckingQuota] = useState(false);
  // A voice round falls back to typing when the microphone is lost.
  const voiceAvailability = useVoiceAvailability();
  const voiceActive = Boolean(session?.voice) && voiceAvailability.available;
  const voiceActiveRef = useRef(voiceActive);
  voiceActiveRef.current = voiceActive;
  // The round judged while this screen watched celebrates once; a round reopened or kept from earlier does not.
  const [celebrating, setCelebrating] = useState<string | null>(null);

  // Another account starts with no round: the session slot was already cleared, and this screen's copy goes too.
  useEffect(() => {
    if (owner.current === userId) return;
    owner.current = userId;
    requestRef.current?.abort();
    sessionRef.current = null;
    setSession(null);
    setRequest({ status: 'idle' });
  }, [userId]);

  /** The one way the round changes: kept for the session as it changes, as the website keeps it in the tab. */
  const commit = useCallback((next: SparringSession | null) => {
    sessionRef.current = next;
    sparringDraft.set(next);
    setSession(next);
  }, []);

  // Leaving cancels what is on its way; the round itself stays for the session.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      requestRef.current?.abort();
      opponentVoice.stop();
    };
  }, []);

  // The motion follows the Current Debate unless the student typed their own.
  useEffect(() => {
    if (session || oneOff || !current) return;
    if (shouldPrefillMotion(motion, current.motion, debates.map((debate) => debate.motion))) setMotion(current.motion);
  }, [current, debates, motion, oneOff, session]);

  const runJudge = useCallback(async (snapshot: SparringSession, forUser: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRequest({ status: 'pending' });
    try {
      // Read under the request's abort, so leaving while the settings load sends nothing.
      const config = await untilAborted(fetchFeatureConfig(forUser, 'sparring'), controller.signal);
      const scorecard = await judgeSparring(
        { action: 'score', sessionId: snapshot.id, motion: snapshot.motion, userSide: snapshot.userSide, format: snapshot.format, difficulty: snapshot.difficulty, speeches: snapshot.speeches, language: outputLanguage },
        { config, debateId: snapshot.debateId ?? null, signal: controller.signal },
      );
      // The server saved the round as judged, so this account's saved lists change whatever happens next.
      noteJudgedRound(forUser, snapshot.id, snapshot.debateId ?? null);
      if (controller.signal.aborted || owner.current !== forUser) return;
      const latest = sessionRef.current;
      const completed = latest?.id === snapshot.id ? completeSparringSession(latest, scorecard, Date.now()) : null;
      setRequest({ status: 'idle' });
      if (!completed) return;
      commit(completed);
      setCelebrating(completed.id);
      // The server saved the judged round before it answered; file it in its debate.
      if (completed.debateId) {
        attachSparring(forUser, completed.id, completed.debateId, completed.userSide).catch((cause: unknown) => {
          console.warn('Could not file the round in its debate:', cause instanceof Error ? cause.message : cause);
          if (live.current && owner.current === forUser) setNotice(t('debate.recordFailed'));
        });
      }
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (cause instanceof AIError && cause.kind === 'debateMissing') void refresh();
      setRequest({ status: 'failed', failure: classify(cause, true) });
      openRefusal(router, cause, 'sparring');
    }
  }, [commit, outputLanguage, refresh, router, t]);

  const runTurn = useCallback(async (snapshot: SparringSession, forUser: string) => {
    const turn = currentSparringTurn(snapshot);
    if (snapshot.phase !== 'round' || turn?.speaker !== 'ai') return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRequest({ status: 'pending' });
    try {
      // Read under the request's abort, so leaving while the settings load sends nothing.
      const config = await untilAborted(fetchFeatureConfig(forUser, 'sparring'), controller.signal);
      const { speaker: _speaker, ...currentTurn } = turn;
      const spoken = voiceActiveRef.current;
      const { speech: generated, voice } = await sparringTurn(
        { action: 'respond', sessionId: snapshot.id, motion: snapshot.motion, userSide: snapshot.userSide, format: snapshot.format, difficulty: snapshot.difficulty, speeches: snapshot.speeches, language: outputLanguage, currentTurn },
        { config, debateId: snapshot.debateId ?? null, signal: controller.signal, voice: spoken },
      );
      if (controller.signal.aborted || owner.current !== forUser) return;
      const speech: SparringSpeech = {
        id: `ai-${snapshot.id}-${turn.id}`,
        turnId: turn.id,
        speaker: 'ai',
        side: turn.side,
        role: turn.label,
        content: generated.content,
        createdAt: Date.now(),
        timeLimitSeconds: turn.timeLimitSeconds,
        timeUsedSeconds: estimateAiTimeUsedSeconds(generated.content, turn.timeLimitSeconds),
        integrityToken: generated.integrityToken,
      };
      const latest = sessionRef.current;
      const next = latest?.id === snapshot.id ? appendSparringAiSpeech(latest, speech, Date.now()) : null;
      setRequest({ status: 'idle' });
      if (!next) return;
      commit(next);
      // In a voice round the opponent speaks its speech aloud; otherwise VoiceOver reads the finished speech, never as it streams in.
      if (!spoken) announceAnswer(generated.content);
      else if (live.current) opponentVoice.speak({ feature: 'sparring', text: generated.content, voice, language: outputLanguage });
      if (next.phase === 'judging') void runJudge(next, forUser);
      else if (currentSparringTurn(next)?.speaker === 'user') tapTurnStart();
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (cause instanceof AIError && cause.kind === 'debateMissing') void refresh();
      setRequest({ status: 'failed', failure: classify(cause, false) });
      openRefusal(router, cause, 'sparring');
    }
  }, [commit, outputLanguage, refresh, router, runJudge]);

  // The clock counts down from its deadline; the tick only redraws it, and coming back from the background redraws at once.
  const timerRunning = session?.timerRunning ?? false;
  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => {
      const latest = sessionRef.current;
      if (!latest) return;
      const next = tickSparringTimer(latest, Date.now());
      if (next !== latest) commit(next);
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [commit, timerRunning]);

  const begin = (side: SparringSide, debateId: string | null, forUser: string) => {
    const started = startSparringSession({ motion, userSide: side, format, difficulty, debateId, ...(voiceMode ? { voice: true } : {}) }, newSparringId(), Date.now());
    if (voiceMode) opponentVoice.beginRound();
    setNotice('');
    setSubmissionError('');
    commit(started);
    if (currentSparringTurn(started)?.speaker === 'ai') void runTurn(started, forUser);
    else tapTurnStart();
  };

  const start = async () => {
    if (motion.trim().length < MIN_MOTION_CHARS) {
      setFormError(t('sparring.setup.motionTooShort'));
      return;
    }
    setFormError('');
    // A round the day's uses cannot cover opens the limit sheet before its clock starts, as on the website.
    if (checkingQuota) return;
    setCheckingQuota(true);
    const refusal = sessionQuotaRefusal(await roundQuota.check());
    if (!live.current) return;
    setCheckingQuota(false);
    if (refusal) {
      openRefusal(router, refusal, 'sparring');
      return;
    }
    setSideMenu(true);
  };

  // The side comes first, then where the round belongs, settled before it starts as the website's motion gate does.
  const chooseSide = async (side: SparringSide) => {
    if (!userId) return;
    const forUser = userId;
    const attempt = ++startAttempt.current;
    const text = motion.trim();
    const decision = decideMotionTarget(text, { debates, current, oneOff });
    if (decision.kind !== 'ask') {
      begin(side, decision.kind === 'attach' ? decision.debateId : null, forUser);
      return;
    }
    const choice = await chooseMotionTarget(decision.matches, {
      title: current ? t('debate.mismatchTitle') : t('debate.offerTitle'),
      message: `“${text}”\n\n${current ? t('debate.mismatchDesc', { motion: current.motion }) : t('debate.offerDesc')}`,
      switchLabel: t('debate.switchToExisting'),
      createLabel: current ? t('debate.createFromMotion') : t('debate.startDebate'),
      onceLabel: current ? t('debate.useOnce') : t('debate.offerNotNow'),
      cancel: t('common.cancel'),
    });
    if (!choice || !live.current || owner.current !== forUser || startAttempt.current !== attempt) return;
    let debateId: string | null = null;
    try {
      if (choice.kind === 'switch') {
        await switchTo(choice.debateId);
        debateId = choice.debateId;
      } else if (choice.kind === 'create') {
        debateId = (await create({ motion: text, settings: {} })).id;
      }
    } catch (cause) {
      console.warn('Could not save the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current) setFormError(t('debate.saveFailed'));
      return;
    }
    if (live.current && owner.current === forUser && startAttempt.current === attempt) begin(side, debateId, forUser);
  };

  // ⌘↩ submits the speech on an iPad keyboard.
  useFocusedKeyCommand('cmd+enter', () => void submit());

  const submit = async () => {
    const before = sessionRef.current;
    // A second tap after the speech went in lands on the opponent's turn; it is not a rejected speech.
    if (!before || !userId || before.phase !== 'round' || currentSparringTurn(before)?.speaker !== 'user') return;
    Keyboard.dismiss();
    // Stopping also withdraws a start still waiting for permission; the last words land in the draft first.
    if (capture.listening) await capture.stop();
    else void capture.stop();
    const latest = sessionRef.current;
    if (!latest || latest.id !== before.id || latest.currentTurnIndex !== before.currentTurnIndex) return;
    // Send pressed while listening, and nothing was heard: there is no speech to send yet.
    if (!latest.draft.trim()) return;
    const delivery = voiceActiveRef.current ? measureDelivery(capture.getTake(), outputLanguage) : null;
    const next = submitSparringSpeech(latest, latest.draft, { now: Date.now(), createId: newSparringId, delivery });
    if (!next) {
      setSubmissionError(t('sparring.round.speechRejected'));
      return;
    }
    capture.resetTake();
    setSubmissionError('');
    commit(next);
    if (next.phase === 'judging') void runJudge(next, userId);
    else void runTurn(next, userId);
  };

  const retry = () => {
    const latest = sessionRef.current;
    if (!latest || !userId) return;
    if (latest.phase === 'judging') void runJudge(latest, userId);
    else void runTurn(latest, userId);
  };

  const restart = () => {
    requestRef.current?.abort();
    opponentVoice.stop();
    capture.cancel();
    setRequest({ status: 'idle' });
    setNotice('');
    setSubmissionError('');
    setCelebrating(null);
    commit(null);
  };

  const move = (change: (round: SparringSession, now: number) => SparringSession) => {
    const latest = sessionRef.current;
    if (!latest) return;
    const next = change(latest, Date.now());
    if (next !== latest) commit(next);
  };

  // The first keystroke or word of a turn starts its clock, and talks over the opponent's voice.
  const updateDraft = (draft: string) => move((round, now) => {
    const turn = currentSparringTurn(round);
    const key = `${round.id}:${turn?.id ?? ''}`;
    const awaitingStart = startedTurn.current !== key && !round.timerRunning
      && round.timerRemainingSeconds === turn?.timeLimitSeconds;
    if (awaitingStart) {
      startedTurn.current = key;
      opponentVoice.stop();
    }
    return { ...(awaitingStart ? resumeSparringTimer(round, now) : round), draft: draft.slice(0, MAX_SPARRING_SPEECH_CHARS), updatedAt: now };
  });
  const resume = () => {
    opponentVoice.stop();
    move((round, now) => {
      startedTurn.current = `${round.id}:${currentSparringTurn(round)?.id ?? ''}`;
      return resumeSparringTimer(round, now);
    });
  };

  // Recognised words join the draft, so the student can see and fix them. They
  // never start the clock: speaking starts it (onStart), and the last words
  // after a Reset must not set the reset turn running again.
  const capture = useSpeechCapture(outputLanguage, (text) => move((round, now) => ({
    ...round,
    draft: appendDictation(round.draft, text, MAX_SPARRING_SPEECH_CHARS),
    updatedAt: now,
  })));
  // Each turn of each round is measured on its own, and a start still waiting for permission does not carry over.
  const turnKey = session ? `${session.id}:${currentSparringTurn(session)?.id ?? ''}` : '';
  const cancelCapture = capture.cancel;
  useEffect(() => cancelCapture, [cancelCapture, turnKey]);

  if (!session) {
    const turns = buildSparringTurns(format, 'pro');
    return (
      <DocumentScreen
        testID="sparring-setup"
        header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
        actions={<MainActionButton label={t('sparring.setup.startRound')} busy={checkingQuota} onPress={() => void start()} />}>
        <ToolTitle title={t('nav.sparring')} subtitle={t('mobile.debate.sparSide')} />
        <WorkingIn />
        <Field
          label={t('sparring.setup.motion')}
          value={motion}
          onChangeText={setMotion}
          maxLength={1200}
          placeholder={t('sparring.setup.motionPlaceholder')}
          multiline
          invalid={Boolean(formError) && motion.trim().length < MIN_MOTION_CHARS}
          style={styles.motion}
          testID="sparring-motion"
        />
        <View style={styles.group}>
          <Text weight="medium" tone="secondary" style={styles.groupLabel}>
            {t('sparring.setup.choosePressure')}
          </Text>
          <SegmentedControl<SparringDifficulty>
            value={difficulty}
            onChange={setDifficulty}
            options={(['easy', 'medium', 'hard'] as const).map((level) => ({ value: level, label: t(`sparring.difficulty.${level}`) }))}
          />
        </View>
        <FormGroup footer={`${t(`sparring.formatDescription.${format}`)} ${t('sparring.setup.aboutMinutes', { count: getSparringFormat(format).approximateMinutes })}.`}>
          <SelectRow<SparringFormat>
            first
            label={t('sparring.setup.roundFormat')}
            value={format}
            onChange={setFormat}
            options={SPARRING_FORMATS.map((item) => ({ value: item.id, label: t(`sparring.format.${item.id}`) }))}
            testID="sparring-format"
          />
        </FormGroup>
        <FormGroup label={`${t('sparring.setup.speakingOrder')} · ${t('sparring.setup.turns', { count: turns.length })}`}>
          {turns.map((turn, index) => (
            <View key={turn.id} style={[styles.orderRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <Text tone="faint" style={styles.orderNumber}>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.orderLabel} numberOfLines={1}>
                {t(`sparring.turns.${turn.id}`)}
              </Text>
              <Text tone="faint" style={styles.orderTime}>
                {formatRoundTime(turn.timeLimitSeconds)}
              </Text>
            </View>
          ))}
        </FormGroup>
        <VoiceModeSwitch value={voiceMode} onChange={setVoiceMode} description={t('voiceRound.mode.sparringDescription')} />
        <ContextLine feature="sparring" side="both" />
        <SessionCostNote quota={roundQuota.quota} />
        {formError ? (
          <Text accessibilityRole="alert" style={[styles.formError, { color: colors.destructive }]} testID="sparring-form-error">
            {formError}
          </Text>
        ) : null}
        <ActionMenu
          visible={sideMenu}
          title={t('mobile.sparring.chooseSide')}
          items={[
            { key: 'pro', label: t('sparring.pro') },
            { key: 'con', label: t('sparring.con') },
          ]}
          cancelLabel={t('common.cancel')}
          onClose={() => setSideMenu(false)}
          onSelect={(key) => void chooseSide(key === 'con' ? 'con' : 'pro')}
          testID="sparring-side-menu"
        />
      </DocumentScreen>
    );
  }

  if (session.phase === 'complete' && session.scorecard) {
    const celebrate = celebrating === session.id;
    return (
      <View style={styles.flex}>
        <SparringScorecardScreen
          session={{ ...session, scorecard: session.scorecard }}
          from={from}
          notice={notice}
          onRestart={restart}
          onDeleted={() => {
            if (sessionRef.current?.id === session.id) restart();
          }}
          holdEntrance={celebrate}
        />
        {celebrate ? (
          <Celebration
            eyebrow={t('sparring.round.complete')}
            title={winnerText(t, session.scorecard.winner)}
            stats={[
              { key: 'score', label: t('sparring.scorecard.yourScore'), value: session.scorecard.userScore },
              { key: 'speeches', label: t('export.sparringSpeeches'), value: session.speeches.length },
              {
                key: 'time',
                label: t('export.sparringTimeUsed'),
                value: Math.round(session.speeches.reduce((total, speech) => total + speech.timeUsedSeconds, 0)),
                format: formatRoundTime,
              },
            ]}
            onDone={() => setCelebrating(null)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <LiveRound
      session={session}
      request={request}
      notice={notice}
      submissionError={submissionError}
      voice={voiceActive ? {
        capture,
        // Speaking starts the turn's clock and talks over the opponent.
        onStart: () => {
          resume();
          void capture.start();
        },
        onStop: () => void capture.stop(),
      } : null}
      onClose={() => router.back()}
      onDraft={updateDraft}
      onPause={() => move(pauseSparringTimer)}
      onResume={resume}
      onReset={() => {
        // A microphone still listening would keep adding untimed words to the reset turn.
        void capture.stop();
        startedTurn.current = null;
        move(resetSparringTurnTimer);
      }}
      onSubmit={() => void submit()}
      onRetry={retry}
    />
  );
}

/** The live round from mock 05: the speech's ring timer, the opponent's speech as it arrives, your typed speech, and the controls. */
function LiveRound({
  session,
  voice,
  request,
  notice,
  submissionError,
  onClose,
  onDraft,
  onPause,
  onResume,
  onReset,
  onSubmit,
  onRetry,
}: {
  session: SparringSession;
  /** A voice round's microphone, while voice is available. */
  voice: { capture: SpeechCaptureApi; onStart: () => void; onStop: () => void } | null;
  request: RequestState;
  notice: string;
  submissionError: string;
  onClose: () => void;
  onDraft: (draft: string) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const width = useContentWidth();
  const { colors } = useTheme();
  const [keyboard, setKeyboard] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useKeepAwakeWhile(true);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const judging = session.phase === 'judging';
  const turn = currentSparringTurn(session);
  const userTurn = !judging && turn?.speaker === 'user';
  const failure = request.status === 'failed' ? request.failure : null;
  const waiting = !failure && (judging || !userTurn);
  const total = turn?.timeLimitSeconds ?? 0;
  const remaining = judging ? 0 : session.timerRemainingSeconds;
  const warning = userTurn && remaining <= 30;
  const timeExpired = userTurn && (session.timerRemainingSeconds <= 0 || (session.timerDeadline !== null && session.timerDeadline <= Date.now()));
  const lastAi = [...session.speeches].reverse().find((speech) => speech.speaker === 'ai');
  const turnLabel = turn ? t(`sparring.turns.${turn.id}`) : t('sparring.round.complete');
  const nextUserTurn = session.turns.slice(session.currentTurnIndex).find((item) => item.speaker === 'user');
  const ringSize = Math.round(Math.min(width - 96, height * (userTurn ? 0.27 : 0.34), 300));
  const status = judging ? t('sparring.round.complete') : userTurn ? t('sparring.round.yourSpeech') : t('sparring.round.opponentThinking');
  const guidance = turn && ROLE_GUIDANCE.has(turn.kind) ? t(`sparring.roleGuidance.${turn.kind}`) : t('sparring.round.yourSpeechDescription');
  const words = session.draft.trim() ? session.draft.trim().split(/\s+/).length : 0;
  const listening = voice?.capture.listening ?? false;
  const canSubmit = userTurn && (Boolean(session.draft.trim()) || listening) && !timeExpired;
  // The microphone closes when the student's time or turn is over.
  const micAllowed = userTurn && !timeExpired;
  const stopMic = voice?.onStop;
  useEffect(() => {
    if (!micAllowed) stopMic?.();
  }, [micAllowed, stopMic]);
  const pressure = t(`sparring.difficulty.${session.difficulty}`);

  const main = failure
    ? { icon: 'reset' as const, label: judging ? t('sparring.round.retryScoring') : t('sparring.round.retryOpponent'), onPress: onRetry, disabled: false }
    : userTurn
      ? { icon: 'send' as const, label: t('sparring.round.submitSpeech'), onPress: onSubmit, disabled: !canSubmit }
      : {
        icon: 'send' as const,
        label: !judging && nextUserTurn ? t('mobile.sparring.yourNext', { turn: t(`sparring.turns.${nextUserTurn.id}`) }) : t('sparring.round.scoring'),
        onPress: () => {},
        disabled: true,
      };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.background }]} testID="sparring-live">
      {/* The setup's document header is replaced by the live bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <LiveTopBar
        left={<RoundIconButton icon="x" label={t('common.close')} onPress={onClose} testID="sparring-close" />}
        // The Flowchart opens above the round on the Current Debate's map; the round keeps running underneath.
        right={<RoundIconButton icon="branch" label={t('nav.flowchart')} onPress={() => router.push({ pathname: '/flowchart', params: { from: 'sparring' } })} testID="sparring-flow" />}
        title={judging ? t('sparring.round.complete') : turnLabel}
        subtitle={judging ? pressure : t('mobile.sparring.turnOf', { current: session.currentTurnIndex + 1, total: session.turns.length, pressure })}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: keyboard ? 16 : insets.bottom + 186 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {keyboard ? null : (
          <View style={styles.ringWrap} accessible accessibilityRole="timer" accessibilityLabel={judging ? status : `${status}: ${t('sparring.round.timeRemaining', { time: formatClock(remaining) })}`} testID="sparring-clock">
            <TimerRing size={ringSize} fraction={judging ? 0 : total > 0 ? remaining / total : 0} warning={warning}>
              <Text weight="medium" tone="faint" style={styles.status} numberOfLines={2}>
                {status}
              </Text>
              {judging ? (
                <SuccessCheck size={Math.round(ringSize * 0.26)} haptic={false} />
              ) : (
                <Text
                  weight="bold"
                  style={[styles.time, { fontSize: Math.round(ringSize * 0.25), lineHeight: Math.round(ringSize * 0.29) }, warning && { color: colors.destructive }]}
                  testID="sparring-time">
                  {formatClock(remaining)}
                </Text>
              )}
              {judging ? null : (
                <Text tone="faint" style={styles.status}>
                  {t('mobile.timer.ofTotal', { total: formatClock(total) })}
                </Text>
              )}
            </TimerRing>
          </View>
        )}

        {voice ? <OpponentVoiceBar /> : null}

        {notice ? (
          <Text tone="secondary" accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        {failure ? (
          <View accessibilityRole="alert" style={[styles.caption, styles.centredCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="sparring-error">
            <Icon name="alert" color={colors.destructive} size={24} />
            <Text weight="semibold" style={styles.captionTitle}>
              {judging ? t('sparring.round.scoreFailed') : t('sparring.round.opponentFailed')}
            </Text>
            <Text tone="secondary" style={[styles.captionText, styles.centred]}>
              {t(failure.message)}
            </Text>
            {failure.plan ? <TextButton label={t('mobile.ask.openYou')} onPress={() => router.navigate('/you')} /> : null}
          </View>
        ) : waiting ? (
          <View style={[styles.caption, styles.centredCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID={judging ? 'sparring-judging' : 'sparring-thinking'}>
            <OwlLoader pose="arguing" size={88} />
            <Text weight="semibold" style={styles.captionTitle} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
              {judging ? t('sparring.round.judgeWeighing') : t('sparring.round.opponentThinking')}
            </Text>
            <Text tone="secondary" style={[styles.captionText, styles.centred]}>
              {judging ? t('sparring.round.judgeDescription') : t('sparring.round.opponentThinkingDescription')}
            </Text>
          </View>
        ) : null}

        {userTurn && lastAi ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={[styles.caption, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="sparring-opponent-speech">
            <View style={styles.speaker}>
              <OwlAvatar pose="arguing" size={28} label={t('sparring.opponentAvatarAlt')} />
              <Text tone="faint" weight="medium" style={[styles.captionLabel, styles.speakerLabel]}>
                {`${t('sparring.opponent')} · ${t(`sparring.turns.${lastAi.turnId}`)}`}
              </Text>
            </View>
            <Text style={styles.speechText} numberOfLines={expanded ? undefined : keyboard ? 2 : 4}>
              {lastAi.content}
            </Text>
          </Pressable>
        ) : null}

        {userTurn ? (
          <View style={[styles.composer, { backgroundColor: colors.card, borderColor: timeExpired ? colors.destructive : colors.border }]}>
            <Text tone="faint" style={styles.guidance}>
              {guidance}
            </Text>
            {voice ? <VoiceMicControl capture={voice.capture} onStart={voice.onStart} onStop={voice.onStop} disabled={timeExpired} /> : null}
            <AppTextInput
              value={session.draft}
              onChangeText={onDraft}
              maxLength={MAX_SPARRING_SPEECH_CHARS}
              multiline
              placeholder={voice ? t('voiceRound.mic.draftPlaceholder') : t('sparring.round.speechPlaceholder')}
              placeholderTextColor={colors.tabInactive}
              accessibilityLabel={t('sparring.round.draftFor', { label: turnLabel })}
              style={[styles.input, { color: colors.foreground }]}
              testID="sparring-input"
            />
            <Text tone="faint" style={styles.words}>
              {t('sparring.round.wordCount', { count: words, formatted: words.toLocaleString(i18n.language) })}
            </Text>
          </View>
        ) : null}
        {timeExpired ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]} testID="sparring-time-expired">
            {t('sparring.round.timeExpired')}
          </Text>
        ) : submissionError ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]}>
            {submissionError}
          </Text>
        ) : null}
      </ScrollView>

      {keyboard ? (
        // With the keyboard up, the speech goes in from a slim bar above it, beside its clock.
        <View style={[styles.keyboardBar, { borderTopColor: colors.line, backgroundColor: colors.tabBar }]}>
          <Text weight="semibold" style={[styles.keyboardClock, warning && { color: colors.destructive }]}>
            {formatClock(remaining)}
          </Text>
          <TextButton label={t('sparring.round.submitSpeech')} onPress={onSubmit} disabled={!canSubmit} />
        </View>
      ) : (
        <View style={[styles.controls, { paddingBottom: insets.bottom + 18, backgroundColor: colors.background }]}>
          <SideControl
            icon={session.timerRunning || !userTurn ? 'pause' : 'play'}
            label={session.timerRunning || !userTurn ? t('timer.pause') : t('mobile.sparring.resume')}
            onPress={session.timerRunning ? onPause : onResume}
            disabled={!userTurn || session.timerRemainingSeconds <= 0}
            testID="sparring-pause"
          />
          <MainRoundControl icon={main.icon} label={main.label} onPress={main.onPress} disabled={main.disabled} testID="sparring-main" />
          <SideControl icon="reset" label={t('mobile.timer.reset')} onPress={onReset} disabled={!userTurn} testID="sparring-reset" />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  speaker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerLabel: { flex: 1 },
  root: { flex: 1 },
  flex: { flex: 1 },
  motion: { minHeight: 96, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  group: { gap: 7 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, minHeight: 44 },
  orderNumber: { fontSize: 13.5, fontVariant: ['tabular-nums'], width: 20 },
  orderLabel: { flex: 1, fontSize: 15.5 },
  orderTime: { fontSize: 14, fontVariant: ['tabular-nums'] },
  formError: { fontSize: 15, lineHeight: 21, marginLeft: 4 },
  content: { paddingHorizontal: 18, paddingTop: 14, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  ringWrap: { alignItems: 'center', marginTop: 8, marginBottom: 6 },
  status: { fontSize: 14, lineHeight: 19, textAlign: 'center', maxWidth: 200 },
  time: { letterSpacing: -2, fontVariant: ['tabular-nums'] },
  notice: { fontSize: 14.5, lineHeight: 20 },
  caption: { borderWidth: 2, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  centredCard: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  captionTitle: { fontSize: 16.5, textAlign: 'center' },
  captionText: { fontSize: 15, lineHeight: 21 },
  centred: { textAlign: 'center' },
  captionLabel: { fontSize: 13.5 },
  speechText: { fontSize: 17, lineHeight: 25 },
  composer: { borderWidth: 2, borderRadius: radius.card, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 6 },
  guidance: { fontSize: 14, lineHeight: 19 },
  input: { minHeight: 150, fontSize: 17, lineHeight: 24, fontFamily: fontFamily.regular, textAlignVertical: 'top', paddingTop: 4 },
  words: { fontSize: 13, alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-evenly', paddingTop: 12 },
  keyboardBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  keyboardClock: { fontSize: 17, fontVariant: ['tabular-nums'] },
});
