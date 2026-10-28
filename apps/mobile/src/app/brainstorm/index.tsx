import type { BrainstormInput } from '@debatelab/core/ai/schemas/brainstorm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MainActionButton } from '@/components/buttons';
import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow } from '@/components/form-rows';
import { ModelPicker } from '@/components/model-picker';
import { Text } from '@/components/text';
import { ToolError, ToolProgress, ToolTitle, WorkingIn } from '@/components/tool-form';
import { AIError, isAbortError, type AIErrorKind } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { buildDebateContext } from '@/lib/context-request';
import { useDebates } from '@/lib/debate-context';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/motion';
import { chooseMotionTarget } from '@/lib/motion-gate';
import { keepOpenResult } from '@/lib/open-results';
import { arrivalNotices, autosaveSources, brainstormIdeas, keepSourceAssessments, recordResult } from '@/lib/results';
import { sessionSlot } from '@/lib/session-memory';
import { useSettings } from '@/lib/settings';
import { useTheme } from '@/theme/use-theme';

// The website's defaults (BrainstormForm).
const DEFAULT_FORM: BrainstormInput = { motion: '', side: 'both', context: '', outputMode: 'topfive' };

// The last form stays for the session, as on the website; session memory forgets it when the account changes.
const lastForm = sessionSlot<BrainstormInput>(() => DEFAULT_FORM);

// The website's one progress line while the tool runs.
const PROGRESS = ['brainstorm.working'];

/** Brainstorm, as the website's BrainstormPage: a native form, a calm wait, then the ideas as a document. */
export default function BrainstormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { debates, current, oneOff, create, switchTo, refresh } = useDebates();
  const { outputLanguage, readFeatureConfig } = useSettings();
  const { colors } = useTheme();
  const [form, setFormState] = useState<BrainstormInput>(lastForm.get);
  const [motionError, setMotionError] = useState(false);
  const [phase, setPhase] = useState<'form' | 'working'>('form');
  const [error, setError] = useState<AIErrorKind | 'debate' | null>(null);
  const requests = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);
  const owner = useRef(userId);

  const setForm = useCallback((patch: Partial<BrainstormInput>) =>
    setFormState((previous) => {
      const next = { ...previous, ...patch };
      lastForm.set(next);
      return next;
    }), []);

  const abortActive = useCallback(() => {
    requests.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  useEffect(() => () => {
    live.current = false;
    abortActive();
  }, [abortActive]);

  // Another account signing in cancels this one's request and drops its form.
  useEffect(() => {
    if (owner.current === userId) return;
    owner.current = userId;
    abortActive();
    setPhase('form');
    setError(null);
    setFormState(lastForm.get());
  }, [abortActive, userId]);

  // The motion follows the Current Debate unless the student typed their own.
  useEffect(() => {
    if (oneOff || !current) return;
    if (shouldPrefillMotion(lastForm.get().motion, current.motion, debates.map((debate) => debate.motion))) setForm({ motion: current.motion });
  }, [current, debates, oneOff, setForm, userId]);

  const start = async (input: BrainstormInput, debateId: string | null, forUser: string) => {
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request && live.current && owner.current === forUser;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase('working');
    try {
      const [config, debateContext] = await Promise.all([
        readFeatureConfig(forUser, 'brainstorm'),
        debateId ? buildDebateContext(forUser, debateId, 'brainstorm', input.side) : Promise.resolve(undefined),
      ]);
      if (!isCurrent()) return;
      const { result, discoveredSources, truncated, assessments } = await brainstormIdeas(input, { config, language: outputLanguage, debateContext, signal: controller.signal });
      if (!isCurrent()) return;
      const assessed = await keepSourceAssessments(forUser, debateId, assessments, controller.signal);
      if (!isCurrent()) return;
      const sources = await autosaveSources(forUser, discoveredSources, 'brainstorm', debateId, controller.signal);
      if (!isCurrent()) return;
      let savedId: string | null = null;
      let recordFailed = false;
      if (debateId) {
        try {
          savedId = await recordResult(forUser, 'brainstorm', { title: input.motion, input, output: result, debateId, side: input.side });
        } catch (cause) {
          console.warn('Could not save the brainstorm to the debate:', cause instanceof Error ? cause.message : cause);
          recordFailed = true;
        }
      }
      if (!isCurrent()) return;
      const key = keepOpenResult({
        kind: 'brainstorm',
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
      router.replace({
        pathname: '/brainstorm/[id]',
        params: {
          id: key,
          from: from ?? 'prepare',
          ...(notice ? { notice } : {}),
          ...(sources.failed > 0 ? { failed: String(sources.failed) } : {}),
        },
      });
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Brainstorm failed:', cause instanceof Error ? cause.message : cause);
      // A missing debate was deleted elsewhere; reload the list so the app stops using it.
      if (kind === 'debateMissing') void refresh();
      setError(kind);
      setPhase('form');
    } finally {
      if (requests.current === request) abort.current = null;
    }
  };

  const submit = async () => {
    if (!userId) return;
    const input = { ...form, motion: form.motion.trim() };
    if (!input.motion) {
      setMotionError(true);
      return;
    }
    const forUser = userId;
    // Where the brainstorm belongs is settled before anything is sent, as the website's motion gate does.
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
    if (!choice || !live.current || owner.current !== forUser) return;
    let debateId: string | null = null;
    try {
      if (choice.kind === 'switch') {
        await switchTo(choice.debateId);
        debateId = choice.debateId;
      } else if (choice.kind === 'create') {
        debateId = (await create({ motion: input.motion, settings: {} })).id;
      }
    } catch (cause) {
      console.warn('Could not save the debate:', cause instanceof Error ? cause.message : cause);
      if (live.current) setError('debate');
      return;
    }
    if (live.current && owner.current === forUser) void start(input, debateId, forUser);
  };

  const cancel = () => {
    abortActive();
    setPhase('form');
  };

  const working = phase === 'working';

  return (
    <DocumentScreen
      testID="brainstorm-screen"
      header={<DocumentHeader backLabel={backLabel(t, from, 'prepare')} actions={[]} />}
      actions={working ? undefined : <MainActionButton label={t('brainstormForm.submit')} onPress={() => void submit()} />}>
      <ToolTitle title={t('nav.brainstorm')} subtitle={t('brainstorm.emptyDesc')} />
      <WorkingIn />
      {working ? (
        <ToolProgress pose="idea" messages={PROGRESS.map((key) => t(key))} detail={form.motion} onCancel={cancel} />
      ) : (
        <>
          <Field
            label={t('brainstormForm.motion')}
            value={form.motion}
            onChangeText={(motion) => {
              setForm({ motion });
              if (motion.trim()) setMotionError(false);
            }}
            placeholder={t('brainstormForm.motionPlaceholder')}
            multiline
            invalid={motionError}
            style={styles.motion}
            testID="brainstorm-motion"
          />
          {motionError ? (
            <Text accessibilityRole="alert" style={[styles.invalid, { color: colors.destructive }]}>
              {t('debate.motionRequired')}
            </Text>
          ) : null}
          <FormGroup>
            <SelectRow<BrainstormInput['side']>
              first
              label={t('brainstormForm.side')}
              value={form.side}
              onChange={(side) => setForm({ side })}
              options={[
                { value: 'both', label: t('brainstormForm.sideBoth') },
                { value: 'pro', label: t('brainstormForm.sidePro') },
                { value: 'con', label: t('brainstormForm.sideCon') },
              ]}
              testID="brainstorm-side"
            />
            <SelectRow<BrainstormInput['outputMode']>
              label={t('brainstormForm.outputFormat')}
              value={form.outputMode}
              onChange={(outputMode) => setForm({ outputMode })}
              options={[
                { value: 'topfive', label: t('brainstormForm.outputTop5') },
                { value: 'mindmap', label: t('brainstormForm.outputMindmap') },
                { value: 'buckets', label: t('brainstormForm.outputBuckets') },
              ]}
              testID="brainstorm-output"
            />
          </FormGroup>
          <ModelPicker feature="brainstorm" />
          <Field
            label={t('brainstormForm.existing')}
            value={form.context ?? ''}
            onChangeText={(context) => setForm({ context })}
            placeholder={t('brainstormForm.existingPlaceholder')}
            multiline
            style={styles.context}
            testID="brainstorm-context"
          />
          {error ? <ToolError title={t('brainstorm.failed')} error={error} onRetry={() => void submit()} /> : null}
        </>
      )}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  motion: { minHeight: 92, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  context: { minHeight: 100, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  invalid: { fontSize: 14, marginTop: -6, marginLeft: 4 },
});
