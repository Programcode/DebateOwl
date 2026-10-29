import { generateDraftSections } from '@debatelab/core/ai/live-sections';
import { GenerateInputSchema, type GenerateInput } from '@debatelab/core/ai/schemas/generate';
import { MAX_MOTION_LENGTH } from '@debatelab/core/validation/motion';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { runRequest } from '@/lib/run-request';
import { MainActionButton } from '@/components/buttons';
import { markCelebration } from '@/components/celebration';
import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow } from '@/components/form-rows';
import { ModelPicker } from '@/components/model-picker';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { ContextLine } from '@/components/context-line';
import { LiveToolRun, useLiveRun } from '@/components/live-run';
import { ToolError, ToolTitle, WorkingIn } from '@/components/tool-form';
import { appendDictation, DictationButton, DictationStatus } from '@/components/voice';
import { AIError, isAbortError, type AIErrorKind } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { resetContextChoices } from '@/lib/context-plan';
import { buildDebateContext } from '@/lib/context-request';
import { useDebates } from '@/lib/debate-context';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/motion';
import { chooseMotionTarget } from '@/lib/motion-gate';
import { keepOpenResult } from '@/lib/open-results';
import { openRefusal } from '@/lib/refusal';
import { arrivalNotices, autosaveSources, generateCase, keepSourceAssessments, recordResult } from '@/lib/results';
import { sessionSlot } from '@/lib/session-memory';
import { useSettings } from '@/lib/settings';
import { useSpeechCapture } from '@/lib/use-speech-capture';
import { useTheme } from '@/theme/use-theme';

// The website's defaults (GenerateForm). The website keeps the last form for the session; so does the app.
const DEFAULT_FORM: GenerateInput = {
  motion: '',
  side: 'pro',
  format: 'custom',
  role: 'r1',
  length: 'standard',
  audience: 'intermediate',
  tone: 'formal',
};
const lastForm = sessionSlot<GenerateInput>(() => DEFAULT_FORM);

/** Generate, as the website's GeneratePage: a native form, a calm wait, then the case as a document. */
export default function GenerateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from, motion: motionParam } = useLocalSearchParams<{ from?: string; motion?: string | string[] }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { debates, current, oneOff, create, switchTo, refresh } = useDebates();
  const { language, outputLanguage, readFeatureConfig } = useSettings();
  const { colors } = useTheme();
  const [form, setFormState] = useState<GenerateInput>(lastForm.get);
  const [motionError, setMotionError] = useState(false);
  const [phase, setPhase] = useState<'form' | 'generating'>('form');
  const [error, setError] = useState<AIErrorKind | 'debate' | null>(null);
  const requests = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);
  const liveRun = useLiveRun({ tool: 'case', parts: (draft) => generateDraftSections(draft, t).length });
  const setForm = useCallback((patch: Partial<GenerateInput>) =>
    setFormState((previous) => {
      const next = { ...previous, ...patch };
      lastForm.set(next);
      return next;
    }), []);
  // Dictation fills the motion, as the website's microphone beside it does. The
  // ref holds words that arrived before the last ones were drawn.
  const motionRef = useRef(form.motion);
  useLayoutEffect(() => { motionRef.current = form.motion; }, [form.motion]);
  const dictation = useSpeechCapture(language, (text) => {
    const motion = appendDictation(motionRef.current, text, MAX_MOTION_LENGTH);
    motionRef.current = motion;
    setForm({ motion });
    setMotionError(false);
  });


  const endLiveRun = liveRun.end;
  const abortActive = useCallback(() => {
    requests.current += 1;
    abort.current?.abort();
    abort.current = null;
    endLiveRun();
  }, [endLiveRun]);

  // Leaving cancels a case still on its way, and nothing is saved.
  useEffect(() => () => {
    live.current = false;
    abortActive();
  }, [abortActive]);

  // The motion follows the Current Debate unless the student typed their own.
  useEffect(() => {
    if (oneOff || !current) return;
    if (shouldPrefillMotion(lastForm.get().motion, current.motion, debates.map((debate) => debate.motion))) {
      const role = GenerateInputSchema.shape.role.safeParse(current.settings.role);
      setForm({ motion: current.motion, ...(role.success ? { role: role.data } : {}) });
    }
  }, [current, debates, oneOff, setForm]);

  // A motion from Siri or Shortcuts (debatelab://generate?motion=) fills the form once, over the Current Debate's.
  const motionApplied = useRef(false);
  useEffect(() => {
    // A link may repeat the parameter; Expo Router then gives an array.
    const motion = (Array.isArray(motionParam) ? motionParam[0] : motionParam)?.trim();
    if (motionApplied.current || !motion) return;
    motionApplied.current = true;
    setForm({ motion: motion.slice(0, MAX_MOTION_LENGTH) });
    setMotionError(false);
  }, [motionParam, setForm]);

  const start = async (input: GenerateInput, debateId: string | null, forUser: string) => {
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request && live.current;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase('generating');
    return await runRequest(async () => {
      const [config, debateContext] = await Promise.all([
        readFeatureConfig(forUser, 'generate'),
        debateId ? buildDebateContext(forUser, debateId, 'generate', input.side) : Promise.resolve(undefined),
      ]);
      if (!isCurrent()) return;
      const { result, discoveredSources, truncated, assessments } = await generateCase(input, {
        config,
        language: outputLanguage,
        debateContext,
        signal: controller.signal,
        live: liveRun.begin(input.motion),
      });
      // Review choices cover one request, as on the website.
      resetContextChoices('generate');
      if (!isCurrent()) return;
      const assessed = await keepSourceAssessments(forUser, debateId, assessments, controller.signal);
      if (!isCurrent()) return;
      const sources = await autosaveSources(forUser, discoveredSources, 'generate', debateId, controller.signal);
      if (!isCurrent()) return;
      let savedId: string | null = null;
      let recordFailed = false;
      if (debateId) {
        await runRequest(async () => {
          savedId = await recordResult(forUser, 'case', { title: input.motion, input, output: result, debateId, side: input.side });
        }, async (cause) => {
          console.warn('Could not save the case to the debate:', cause instanceof Error ? cause.message : cause);
          recordFailed = true;
        });
      }
      if (!isCurrent()) return;
      const key = keepOpenResult({
        kind: 'case',
        savedId,
        title: input.motion,
        side: input.side,
        debateId,
        createdAt: Date.now(),
        input,
        output: result,
        sources: discoveredSources,
      });
      const notice = arrivalNotices({ recordFailed, sourcesFailed: sources.failed, assessed, truncated });
      // The case just made celebrates when its document opens; reopening it later does not.
      markCelebration(key);
      liveRun.complete();
      router.replace({
        pathname: '/case/[id]',
        params: { id: key, from: from ?? 'prepare', ...(notice ? { notice } : {}), ...(sources.failed > 0 ? { failed: String(sources.failed) } : {}) },
      });
    }, async (cause) => {
      if (!isCurrent() || isAbortError(cause)) return;
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Generate failed:', cause instanceof Error ? cause.message : cause);
      // A missing debate was deleted elsewhere; reload the list so the app stops using it.
      if (kind === 'debateMissing') void refresh();
      liveRun.end('failed');
      setPhase('form');
      // A limit or model refusal opens the website's dialog as a sheet, not an inline error.
      if (openRefusal(router, cause, 'generate')) return;
      setError(kind);
    }, () => {
      if (requests.current === request) abort.current = null;
    });
  };

  const submit = async () => {
    if (!userId) return;
    const input = { ...form, motion: form.motion.trim() };
    if (!input.motion) {
      setMotionError(true);
      return;
    }
    const forUser = userId;
    // Where the case belongs is settled before anything is sent, as the website's motion gate does.
    const decision = decideMotionTarget(input.motion, { debates, current, oneOff });
    if (decision.kind !== 'ask') {
      void start(input, decision.kind === 'attach' ? decision.debateId : null, forUser);
      return;
    }
    const choice = await chooseMotionTarget(decision.matches, {
      title: current ? t('debate.mismatchTitle') : t('debate.offerTitle'),
      message: `“${input.motion}”\n\n${current ? t('debate.mismatchDesc', { motion: current.motion }) : t('debate.offerDesc')}`,
      switchLabel: t('debate.switchToExisting'),
      createLabel: current ? t('debate.createFromMotion') : t('debate.startDebate'),
      onceLabel: current ? t('debate.useOnce') : t('debate.offerNotNow'),
      cancel: t('common.cancel'),
    });
    if (!choice || !live.current) return;
    let debateId: string | null = null;
    const selected = await runRequest(async () => {
      if (choice.kind === 'switch') {
        await switchTo(choice.debateId);
        debateId = choice.debateId;
      } else if (choice.kind === 'create') {
        debateId = (await create({ motion: input.motion, settings: {} })).id;
      }
      return true;
    }, async (cause) => {
      console.warn('Could not save the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current) setError('debate');
      return false;
    });
    if (!selected) return;
    if (live.current) void start(input, debateId, forUser);
  };

  const cancel = () => {
    abortActive();
    setPhase('form');
  };

  const generating = phase === 'generating';

  return (
    <DocumentScreen
      testID="generate-screen"
      header={<DocumentHeader backLabel={backLabel(t, from, 'prepare')} actions={[]} />}
      actions={generating ? undefined : <MainActionButton label={t('generateForm.submit')} onPress={() => void submit()} />}>
      <ToolTitle title={t('nav.generate')} subtitle={t('generate.emptyDesc')} />
      <WorkingIn />
      {generating ? (
        <LiveToolRun
          label={t('generate.working')}
          run={liveRun.state}
          sections={generateDraftSections}
          detail={form.motion}
          onCancel={cancel}
          pose="thinking"
        />
      ) : (
        <>
          <View style={styles.motionRow}>
            <View style={styles.motionField}>
              <Field
                label={t('generateForm.motion')}
                value={form.motion}
                onChangeText={(motion) => {
                  setForm({ motion });
                  if (motion.trim()) setMotionError(false);
                }}
                placeholder={t('generateForm.motionPlaceholder')}
                multiline
                maxLength={MAX_MOTION_LENGTH}
                invalid={motionError}
                style={styles.motion}
                testID="generate-motion"
              />
            </View>
            <DictationButton capture={dictation} startLabel={t('generateForm.dictate')} stopLabel={t('generateForm.stopListening')} />
          </View>
          <DictationStatus capture={dictation} listeningLabel={t('generateForm.listening')} />
          {motionError ? (
            <Text accessibilityRole="alert" style={[styles.invalid, { color: colors.destructive }]}>
              {t('debate.motionRequired')}
            </Text>
          ) : null}
          <View style={styles.side}>
            <Text weight="medium" tone="secondary" style={styles.label}>
              {t('generateForm.side')}
            </Text>
            <SegmentedControl<GenerateInput['side']>
              options={[
                { value: 'pro', label: t('generateForm.sidePro') },
                { value: 'con', label: t('generateForm.sideCon') },
              ]}
              value={form.side}
              onChange={(side) => setForm({ side })}
            />
          </View>
          <FormGroup>
            <SelectRow<GenerateInput['role']>
              first
              label={t('generateForm.role')}
              value={form.role}
              onChange={(role) => setForm({ role })}
              options={[
                { value: 'general', label: t('debate.roleAny') },
                { value: 'intro', label: t('generateForm.roleIntro') },
                { value: 'r1', label: t('generateForm.roleR1') },
                { value: 'r2', label: t('generateForm.roleR2') },
                { value: 'conc', label: t('generateForm.roleConc') },
              ]}
            />
          </FormGroup>
          <ModelPicker feature="generate" />
          <FormGroup label={t('generateForm.moreOptions')} footer={t('generateForm.styleNote')}>
            <SelectRow<GenerateInput['length']>
              first
              label={t('generateForm.length')}
              value={form.length}
              onChange={(length) => setForm({ length })}
              options={[
                { value: 'brief', label: t('generateForm.lengthBrief') },
                { value: 'standard', label: t('generateForm.lengthStandard') },
                { value: 'comprehensive', label: t('generateForm.lengthComprehensive') },
              ]}
            />
            <SelectRow<GenerateInput['audience']>
              label={t('generateForm.audience')}
              value={form.audience}
              onChange={(audience) => setForm({ audience })}
              options={[
                { value: 'beginner', label: t('generateForm.audienceBeginner') },
                { value: 'intermediate', label: t('generateForm.audienceIntermediate') },
                { value: 'advanced', label: t('generateForm.audienceAdvanced') },
              ]}
            />
            <SelectRow<GenerateInput['tone']>
              label={t('generateForm.tone')}
              value={form.tone}
              onChange={(tone) => setForm({ tone })}
              options={[
                { value: 'formal', label: t('generateForm.toneFormal') },
                { value: 'conversational', label: t('generateForm.toneConversational') },
                { value: 'aggressive', label: t('generateForm.toneAggressive') },
              ]}
            />
          </FormGroup>
          <ContextLine feature="generate" side={form.side} />
          {error ? <ToolError title={error === 'timeout' ? t('generate.timeout') : t('generate.failed')} error={error} onRetry={() => void submit()} /> : null}
        </>
      )}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  motionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  motionField: { flex: 1 },
  motion: { minHeight: 92, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  invalid: { fontSize: 14, marginTop: -6, marginLeft: 4 },
  side: { gap: 7 },
  label: { fontSize: 14, marginLeft: 4 },
});
